import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { OAuthController } from '../controllers/oauthController';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

router.post('/register', validate(schemas.register), AuthController.register);
router.post('/login', validate(schemas.login), AuthController.login);
router.get('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', authenticate, AuthController.resendVerification);
router.get('/profile', authenticate, AuthController.getProfile);

router.get('/google', OAuthController.googleAuth);
router.get('/google/callback', ...OAuthController.googleCallback);

router.get('/github', OAuthController.githubAuth);
router.get('/github/callback', ...OAuthController.githubCallback);

router.get('/failure', OAuthController.authFailure);

export default router;
