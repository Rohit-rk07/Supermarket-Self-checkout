import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
  demoLogin,
  getAuthConfig,
  sendPhoneOTP,
  verifyPhoneOTP,
  completeRegistration,
  getProfile,
  updateProfile,
  signOutEverywhere
} from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/auth.js';
import MongoRateLimitStore from '../utils/mongoRateLimitStore.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

const otpLimitMessage = {
  success: false,
  message: 'Too many OTP requests. Please try again later.'
};

// These limits protect against text-message abuse and code guessing, so their counts live in the
// database (shared by every server instance, and kept across restarts), not in memory.
const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore({ prefix: 'otp-ip:' }),
  message: otpLimitMessage
});

const otpPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore({ prefix: 'otp-phone:' }),
  keyGenerator: (req) => req.body.phoneNumber.trim().toLowerCase(),
  message: otpLimitMessage
});

// Guards the 6-digit code against guessing: only failed attempts count, per phone number
const otpVerifyPhoneLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: new MongoRateLimitStore({ prefix: 'otp-verify:' }),
  keyGenerator: (req) => req.body.phoneNumber.trim().toLowerCase(),
  message: {
    success: false,
    message: 'Too many incorrect attempts. Please request a new OTP in a few minutes.'
  }
});

// A public demo should not be a free session factory
const demoLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore({ prefix: 'demo-ip:' }),
  message: {
    success: false,
    message: 'Too many demo sessions from this network. Please try again later.'
  }
});

// Validation schemas
const phoneOtpSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid phone number'
  })
});

const verifyOtpSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  otp: Joi.string().length(6).required()
});

const completeRegistrationSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().allow('').optional()
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional()
});

// Phone-based authentication routes
router.post('/phone/send-otp', validateRequest(phoneOtpSchema), otpIpLimiter, otpPhoneLimiter, sendPhoneOTP);
router.post('/phone/verify-otp', validateRequest(verifyOtpSchema), otpVerifyPhoneLimiter, verifyPhoneOTP);
// What this deployment offers (for example whether the demo is on)
router.get('/config', getAuthConfig);
router.post('/demo-login', demoLoginLimiter, demoLogin);
router.post('/complete-registration', authenticateJWT, validateRequest(completeRegistrationSchema), completeRegistration);

// Cancel every sign-in of this account, on all devices
router.post('/logout-all', authenticateJWT, signOutEverywhere);

// User profile routes
router.get('/profile', authenticateJWT, getProfile);
router.put('/profile', authenticateJWT, validateRequest(updateProfileSchema), updateProfile);

export default router;
