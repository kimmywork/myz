import { Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { UserModel } from '../models/User';
import { generateToken } from '../utils/jwt';
import { sendVerificationEmail } from '../utils/email';
import dotenv from 'dotenv';

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in Google profile'));
        }

        let user = await UserModel.findByOAuth('google', profile.id);
        
        if (!user) {
          user = await UserModel.findByEmail(email);
          if (user) {
            return done(new Error('Email already registered with different provider'));
          }

          user = await UserModel.create({
            email,
            auth_provider: 'google',
            oauth_id: profile.id,
          });

          if (user.email_verification_token) {
            await sendVerificationEmail(email, user.email_verification_token);
          }
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackURL: process.env.GITHUB_CALLBACK_URL || '',
      scope: ['user:email'],
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in GitHub profile'));
        }

        let user = await UserModel.findByOAuth('github', profile.id);
        
        if (!user) {
          user = await UserModel.findByEmail(email);
          if (user) {
            return done(new Error('Email already registered with different provider'));
          }

          user = await UserModel.create({
            email,
            auth_provider: 'github',
            oauth_id: profile.id,
          });

          if (user.email_verification_token) {
            await sendVerificationEmail(email, user.email_verification_token);
          }
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

export class OAuthController {
  static googleAuth = passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  });

  static googleCallback = [
    passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
    (req: Request, res: Response) => {
      const user = req.user as any;
      if (!user) {
        res.redirect('/auth/failure');
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${token}`);
    }
  ];

  static githubAuth = passport.authenticate('github', { 
    scope: ['user:email'],
    session: false 
  });

  static githubCallback = [
    passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
    (req: Request, res: Response) => {
      const user = req.user as any;
      if (!user) {
        res.redirect('/auth/failure');
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${token}`);
    }
  ];

  static authFailure(req: Request, res: Response): void {
    res.status(401).json({ error: 'OAuth authentication failed' });
  }
}
