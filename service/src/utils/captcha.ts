import { createCanvas } from 'canvas';
import crypto from 'crypto';

interface CaptchaSession {
  answer: string;
  expiresAt: number;
}

// In-memory store for captcha sessions
// In production, consider using Redis or session storage
const captchaSessions = new Map<string, CaptchaSession>();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of captchaSessions.entries()) {
    if (session.expiresAt < now) {
      captchaSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

export function generateCaptchaImage(): { image: Buffer; sessionId: string; answer: string } {
  const width = 200;
  const height = 60;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Generate random text
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let captchaText = '';
  for (let i = 0; i < 6; i++) {
    captchaText += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Background with gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f0f0f0');
  gradient.addColorStop(1, '#e0e0e0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add noise lines
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.lineTo(Math.random() * width, Math.random() * height);
    ctx.stroke();
  }

  // Draw text with random colors and positions
  ctx.font = 'bold 30px Arial';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < captchaText.length; i++) {
    const x = 20 + i * 30;
    const y = 30 + (Math.random() - 0.5) * 10;
    const angle = (Math.random() - 0.5) * 0.4;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100})`;
    ctx.fillText(captchaText[i], 0, 0);
    ctx.restore();
  }

  // Add noise dots
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.5)`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }

  // Generate session ID
  const sessionId = crypto.randomBytes(32).toString('hex');

  // Store captcha session (expires in 5 minutes)
  captchaSessions.set(sessionId, {
    answer: captchaText,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Convert to PNG buffer
  const buffer = canvas.toBuffer('image/png');

  return { image: buffer, sessionId, answer: captchaText };
}

export function validateCaptcha(sessionId: string, userAnswer: string): boolean {
  const session = captchaSessions.get(sessionId);

  if (!session) {
    return false;
  }

  // Check if expired
  if (session.expiresAt < Date.now()) {
    captchaSessions.delete(sessionId);
    return false;
  }

  // Validate answer (case-insensitive)
  const isValid = session.answer.toLowerCase() === userAnswer.toLowerCase();

  // Delete session after validation (one-time use)
  captchaSessions.delete(sessionId);

  return isValid;
}

export function cleanupCaptchaSession(sessionId: string): void {
  captchaSessions.delete(sessionId);
}
