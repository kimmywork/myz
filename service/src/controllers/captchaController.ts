import { Request, Response } from 'express';
import { generateCaptchaImage } from '../utils/captcha';

export class CaptchaController {
  static async generateCaptcha(_req: Request, res: Response): Promise<void> {
    try {
      const { image, sessionId } = generateCaptchaImage();

      // Set session ID in cookie for client to send back
      res.cookie('captcha_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 5 * 60 * 1000, // 5 minutes
      });

      // Send image
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(image);
    } catch (error) {
      console.error('Captcha generation error:', error);
      res.status(500).json({ error: 'Failed to generate captcha' });
    }
  }
}
