import { Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { UserModel } from '../models/User';
import { generateToken } from '../utils/jwt';
import { sendVerificationEmail } from '../utils/email';
import dotenv from 'dotenv';

dotenv.config();

interface PassportProfile {
  id: string;
  emails?: Array<{ value: string }>;
  displayName?: string;
}

interface PassportDoneFunction {
  (error: Error | null, user?: Express.User | false): void;
}

interface OAuthUser {
  id: string;
  email: string;
  email_verified: boolean;
}

// Only configure strategies if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
      },
    async (_accessToken, _refreshToken, profile: PassportProfile, done: PassportDoneFunction) => {
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
}

// Only configure GitHub strategy if credentials are provided
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
        scope: ['user:email'],
      },
    async (_accessToken: string, _refreshToken: string, profile: PassportProfile, done: PassportDoneFunction) => {
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
}

export class OAuthController {
  static googleAuth = passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  });

  static googleCallback = [
    passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
    (req: Request, res: Response) => {
      const user = req.user as OAuthUser;
      if (!user) {
        res.redirect('/?error=authentication_failed');
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      // Redirect to web UI with token
      res.redirect(`/?token=${token}`);
    }
  ];

  static githubAuth = passport.authenticate('github', { 
    scope: ['user:email'],
    session: false 
  });

  static githubCallback = [
    passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
    (req: Request, res: Response) => {
      const user = req.user as OAuthUser;
      if (!user) {
        res.redirect('/?error=authentication_failed');
        return;
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.email_verified,
      });

      // Redirect to web UI with token
      res.redirect(`/?token=${token}`);
    }
  ];

  static authFailure(_req: Request, res: Response): void {
    res.redirect('/?error=authentication_failed');
  }
}
