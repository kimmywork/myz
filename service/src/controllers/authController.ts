import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { generateToken } from '../utils/jwt';
import { sendVerificationEmail } from '../utils/email';
import { AuthRequest } from '../middleware/auth';

function asAuthRequest(req: Request): AuthRequest {
  return req as AuthRequest;
}

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      const user = await UserModel.create({ email, password });

      if (user.email_verification_token) {
        await sendVerificationEmail(email, user.email_verification_token);
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
        token,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await UserModel.findByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const isValidPassword = await UserModel.verifyPassword(user, password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Invalid verification token' });
        return;
      }

      const success = await UserModel.verifyEmail(token);
      if (!success) {
        res.status(400).json({ error: 'Invalid or expired verification token' });
        return;
      }

      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Email verification failed' });
    }
  }

  static async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const authReq = asAuthRequest(req);
      if (!authReq.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await UserModel.findById(authReq.user.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.email_verified) {
        res.status(400).json({ error: 'Email already verified' });
        return;
      }

      const newToken = await UserModel.updateVerificationToken(user.id);
      await sendVerificationEmail(user.email, newToken);

      res.json({ message: 'Verification email sent' });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Failed to resend verification email' });
    }
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const authReq = asAuthRequest(req);
      if (!authReq.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await UserModel.findById(authReq.user.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        authProvider: user.auth_provider,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }
}
