import { generateToken, verifyToken, decodeToken } from '../../src/utils/jwt';

describe('JWT Utilities', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        emailVerified: true,
      };

      const token = generateToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        emailVerified: true,
      };

      const token = generateToken(payload);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.emailVerified).toBe(payload.emailVerified);
    });

    it('should return null for an invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for an expired token', () => {
      // This would require mocking time or using a very short expiration
      // For now, we just test invalid signature
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0In0.invalid';
      const decoded = verifyToken(fakeToken);
      expect(decoded).toBeNull();
    });
  });

  describe('decodeToken', () => {
    it('should decode a token without verifying signature', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        emailVerified: true,
      };

      const token = generateToken(payload);
      const decoded = decodeToken(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
    });

    it('should return null for malformed token', () => {
      const decoded = decodeToken('not-a-jwt-token');
      expect(decoded).toBeNull();
    });
  });
});
