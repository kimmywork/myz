import { Router } from 'express';
import { CaptchaController } from '../controllers/captchaController';

const router = Router();

router.get('/generate', CaptchaController.generateCaptcha);

export default router;
