import { generateCaptchaImage, validateCaptcha } from '../../src/utils/captcha';

describe('Captcha Utilities', () => {
  describe('generateCaptchaImage', () => {
    it('should generate captcha with image, sessionId, and answer', () => {
      const result = generateCaptchaImage();

      expect(result).toHaveProperty('image');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('answer');
      
      expect(result.image).toBeInstanceOf(Buffer);
      expect(result.sessionId).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(result.answer).toHaveLength(6);
    });

    it('should generate different captchas each time', () => {
      const result1 = generateCaptchaImage();
      const result2 = generateCaptchaImage();

      expect(result1.sessionId).not.toBe(result2.sessionId);
      expect(result1.answer).not.toBe(result2.answer);
    });
  });

  describe('validateCaptcha', () => {
    it('should validate correct captcha answer', () => {
      const { sessionId, answer } = generateCaptchaImage();
      const isValid = validateCaptcha(sessionId, answer);

      expect(isValid).toBe(true);
    });

    it('should validate case-insensitively', () => {
      const { sessionId, answer } = generateCaptchaImage();
      const isValid = validateCaptcha(sessionId, answer.toUpperCase());

      expect(isValid).toBe(true);
    });

    it('should reject incorrect answer', () => {
      const { sessionId } = generateCaptchaImage();
      const isValid = validateCaptcha(sessionId, 'WRONG');

      expect(isValid).toBe(false);
    });

    it('should reject invalid session ID', () => {
      const isValid = validateCaptcha('invalid-session', 'ABCDEF');

      expect(isValid).toBe(false);
    });

    it('should invalidate captcha after use (one-time use)', () => {
      const { sessionId, answer } = generateCaptchaImage();
      
      // First validation should succeed
      const isValid1 = validateCaptcha(sessionId, answer);
      expect(isValid1).toBe(true);

      // Second validation with same session should fail
      const isValid2 = validateCaptcha(sessionId, answer);
      expect(isValid2).toBe(false);
    });
  });
});
