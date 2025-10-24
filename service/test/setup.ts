// Test setup file
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'myz_test_db';
process.env.DB_USER = process.env.DB_USER || 'test_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'test-github-client-id';
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'test-github-client-secret';
process.env.GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback';
