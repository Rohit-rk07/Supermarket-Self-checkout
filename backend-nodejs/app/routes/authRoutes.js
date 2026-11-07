import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAuthConfig,
  googleLogin,
  getProfile,
  updateProfile,
  signOutEverywhere
} from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/auth.js';
import MongoRateLimitStore from '../utils/mongoRateLimitStore.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

// Sign-ins are slowed down per network address. The count lives in the database so every server instance shares it.
const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore({ prefix: 'google-ip:' }),
  message: {
    success: false,
    message: 'Too many sign-in attempts. Please try again in a few minutes.'
  }
});

// Validation schemas
const googleLoginSchema = Joi.object({
  credential: Joi.string().min(20).max(4096).required()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).optional(),
  // Optional contact number; an empty string removes it
  phoneNumber: Joi.string().trim().pattern(/^\+?[1-9]\d{6,14}$/).allow('').optional().messages({
    'string.pattern.base': 'Please enter a valid phone number, for example +919876543210'
  })
});

// What this deployment offers (the Google client id the sign-in button needs)
router.get('/config', getAuthConfig);
router.post('/google', googleLoginLimiter, validateRequest(googleLoginSchema), googleLogin);

// Cancel every sign-in of this account, on all devices
router.post('/logout-all', authenticateJWT, signOutEverywhere);

// User profile routes
router.get('/profile', authenticateJWT, getProfile);
router.put('/profile', authenticateJWT, validateRequest(updateProfileSchema), updateProfile);

export default router;
