import request from 'supertest';
import app from '../../src/index';

describe('Authentication API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: `test${Date.now()}@example.com`,
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user.emailVerified).toBe(false);
    });

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

    beforeAll(async () => {
      // Create a test user
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

    beforeAll(async () => {
      // Create and login a test user
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
