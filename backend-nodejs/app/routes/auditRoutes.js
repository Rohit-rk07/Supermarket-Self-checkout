import express from 'express';
import { listAudit } from '../controllers/auditController.js';
import { authenticateJWT, authorize } from '../middleware/auth.js';

const router = express.Router();

// The activity log is for admins only
router.get('/', authenticateJWT, authorize('admin'), listAudit);

export default router;
