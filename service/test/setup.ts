// Test setup file
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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

// Global database pool for test utilities
let globalPool: Pool | null = null;

function getPool(): Pool {
  if (!globalPool) {
    globalPool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }
  return globalPool;
}

// Global setup function to initialize database schema
// This is exported and should be called manually by API tests
export async function setupDatabase() {
  const pool = getPool();

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, '../src/config/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Execute schema (CREATE TABLE IF NOT EXISTS, so safe to run multiple times)
    await pool.query(schema);
    console.log('✓ Database schema initialized for tests');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

// Clean database function for API tests
export async function cleanDatabase() {
  const pool = getPool();
  
  try {
    // Delete data from all tables (in correct order to respect foreign keys)
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM highlights_metadata');
    await pool.query('DELETE FROM sync_metadata');
    await pool.query('DELETE FROM users');
  } catch (error) {
    console.error('Failed to clean database:', error);
    throw error;
  }
}

// Cleanup database pool after tests
export async function closeDatabase() {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}
