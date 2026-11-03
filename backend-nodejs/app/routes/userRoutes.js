import express from 'express';
import Joi from 'joi';
import { listUsers, updateUserRole, updateUserActive } from '../controllers/userController.js';
import { authenticateJWT, authorize } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

const roleSchema = Joi.object({
  role: Joi.string().valid('customer', 'staff', 'admin').required()
});

const activeSchema = Joi.object({
  isActive: Joi.boolean().required()
});

// User and role management: admins only
router.get('/', authenticateJWT, authorize('admin'), listUsers);
router.put('/:userId/role', authenticateJWT, authorize('admin'), validateRequest(roleSchema), updateUserRole);
router.put('/:userId/active', authenticateJWT, authorize('admin'), validateRequest(activeSchema), updateUserActive);

export default router;
