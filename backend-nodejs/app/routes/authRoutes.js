import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
  demoLogin,
  sendPhoneOTP,
  verifyPhoneOTP,
  completeRegistration,
  getProfile,
  updateProfile
} from '../controllers/authController.js';
import { authenticateJWT } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

const otpLimitMessage = {
  success: false,
  message: 'Too many OTP requests. Please try again later.'
};

const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: otpLimitMessage
});

const otpPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
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
  keyGenerator: (req) => `verify:${req.body.phoneNumber.trim().toLowerCase()}`,
  message: {
    success: false,
    message: 'Too many incorrect attempts. Please request a new OTP in a few minutes.'
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
router.post('/demo-login', demoLogin);
router.post('/complete-registration', authenticateJWT, validateRequest(completeRegistrationSchema), completeRegistration);

// User profile routes
router.get('/profile', authenticateJWT, getProfile);
router.put('/profile', authenticateJWT, validateRequest(updateProfileSchema), updateProfile);

export default router;
