import request from 'supertest';
import app from '../../src/index';

describe('Sync API', () => {
  let testToken: string;
  const testEmail = `sync${Date.now()}@example.com`;

  beforeAll(async () => {
    // Create and login a test user
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: 'password123',
      });
    
    if (response.status !== 201 || !response.body.token) {
      throw new Error(`Failed to register test user: ${JSON.stringify(response.body)}`);
    }
    
    testToken = response.body.token;
  });

  describe('GET /api/sync/status', () => {
    it('should get sync status with unverified email', async () => {
      const response = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${testToken}`);

      // Should be forbidden because email is not verified
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('verification');
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/sync/status');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/sync/highlights', () => {
    it('should reject sync without email verification', async () => {
      const response = await request(app)
        .post('/api/sync/highlights')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          highlights: {
            'test-1': {
              id: 'test-1',
              text: 'Test highlight',
              url: 'https://example.com',
              createdAt: new Date().toISOString(),
            },
          },
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('verification');
    });

    it('should reject sync with invalid data', async () => {
      const response = await request(app)
        .post('/api/sync/highlights')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          // Missing highlights field
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject sync without authentication', async () => {
      const response = await request(app)
        .post('/api/sync/highlights')
        .send({
          highlights: {},
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/sync/highlights', () => {
    it('should reject request without email verification', async () => {
      const response = await request(app)
        .get('/api/sync/highlights')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('verification');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/sync/highlights');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });
});
