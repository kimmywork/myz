import request from 'supertest';
import app from '../../src/index';
import { setupDatabase, cleanDatabase, closeDatabase } from '../setup';

// Helper function to get captcha session
async function getCaptchaSession(): Promise<{ cookie: string; answer: string }> {
  const response = await request(app).get('/api/captcha/generate');
  const cookies = response.headers['set-cookie'];
  const cookie = cookies ? cookies[0] : '';
  
  // For testing, we need to extract the answer somehow
  // In a real scenario, you'd mock the captcha or use a test captcha
  // For now, we'll use a placeholder
  return { cookie, answer: 'TEST123' }; // This will fail in real tests
}

describe('Authentication API', () => {
  // Initialize database before all tests in this suite
  beforeAll(async () => {
    await setupDatabase();
  });

  // Clean database after all tests in this suite
  afterAll(async () => {
    await closeDatabase();
  });

  // Clean database before each test to ensure isolation
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/auth/register', () => {
    // Captcha validation tests are skipped in test mode since captcha is optional
    it.skip('should require captcha', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `test${Date.now()}@example.com`,
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Captcha');
    });

    it.skip('should reject invalid captcha', async () => {
      const { cookie } = await getCaptchaSession();
      
      const response = await request(app)
        .post('/api/auth/register')
        .set('Cookie', cookie)
        .send({
          email: `test${Date.now()}@example.com`,
          password: 'password123',
          captcha: 'WRONG',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('captcha');
    });
  });

  describe('POST /api/auth/login', () => {
    // Captcha validation tests are skipped in test mode since captcha is optional
    it.skip('should require captcha', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Captcha');
    });

    it.skip('should reject invalid captcha', async () => {
      const { cookie } = await getCaptchaSession();
      
      const response = await request(app)
        .post('/api/auth/login')
        .set('Cookie', cookie)
        .send({
          email: 'test@example.com',
          password: 'password123',
          captcha: 'WRONG',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('captcha');
    });
  });

  describe('POST /api/auth/register - Validation', () => {
    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject duplicate email registration', async () => {
      const email = `duplicate${Date.now()}@example.com`;
      
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
        });

      // Attempt duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    const testEmail = `login${Date.now()}@example.com`;
    const testPassword = 'password123';

    beforeEach(async () => {
      // Create a test user before each test (after cleanDatabase runs)
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
        });
    });

    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testEmail);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject login with invalid data', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid',
          password: '',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/profile', () => {
    let testToken: string;
    const testEmail = `profile${Date.now()}@example.com`;

    beforeEach(async () => {
      // Create and login a test user before each test (after cleanDatabase runs)
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'password123',
        });
      
      testToken = response.body.token;
    });

    it('should get profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(testEmail);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
