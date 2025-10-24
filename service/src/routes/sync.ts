import { Router } from 'express';
import { SyncController } from '../controllers/syncController';
import { authenticate, requireVerifiedEmail } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

router.use(authenticate);
router.use(requireVerifiedEmail);

router.post('/highlights', validate(schemas.syncHighlights), SyncController.syncHighlights);
router.get('/status', SyncController.getSyncStatus);
router.get('/highlights', SyncController.getAllHighlights);

export default router;
