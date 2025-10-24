import pool from '../config/database';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  email_verified: boolean;
  email_verification_token?: string;
  email_verification_expires?: Date;
  auth_provider: string;
  oauth_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password?: string;
  auth_provider?: string;
  oauth_id?: string;
}

export class UserModel {
  static async create(data: CreateUserData): Promise<User> {
    const { email, password, auth_provider = 'local', oauth_id } = data;
    
    let password_hash: string | undefined;
    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const verification_token = uuidv4();
    const verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const query = `
      INSERT INTO users (email, password_hash, email_verification_token, email_verification_expires, auth_provider, oauth_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [email, password_hash, verification_token, verification_expires, auth_provider, oauth_id];
    const result = await pool.query(query, values);
    
    return result.rows[0];
  }

  static async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    
    return result.rows[0] || null;
  }

  static async findById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    return result.rows[0] || null;
  }

  static async findByOAuth(provider: string, oauthId: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE auth_provider = $1 AND oauth_id = $2';
    const result = await pool.query(query, [provider, oauthId]);
    
    return result.rows[0] || null;
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password_hash) {
      return false;
    }
    return bcrypt.compare(password, user.password_hash);
  }

  static async verifyEmail(token: string): Promise<boolean> {
    const query = `
      UPDATE users 
      SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL
      WHERE email_verification_token = $1 AND email_verification_expires > NOW()
      RETURNING *
    `;
    
    const result = await pool.query(query, [token]);
    return result.rows.length > 0;
  }

  static async updateVerificationToken(userId: string): Promise<string> {
    const verification_token = uuidv4();
    const verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const query = `
      UPDATE users 
      SET email_verification_token = $1, email_verification_expires = $2
      WHERE id = $3
      RETURNING *
    `;
    
    await pool.query(query, [verification_token, verification_expires, userId]);
    return verification_token;
  }

  static async updatePassword(userId: string, newPassword: string): Promise<void> {
    const password_hash = await bcrypt.hash(newPassword, 10);
    const query = 'UPDATE users SET password_hash = $1 WHERE id = $2';
    await pool.query(query, [password_hash, userId]);
  }
}
