import express from 'express';
import { createOrder, verifyPayment, handleWebhook } from '../controllers/paymentController.js';
import { validateRequest, orderSchema, paymentVerificationSchema } from '../middleware/validation.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = express.Router();

// POST /api/v1/payments/create-order  { orderId }
// Creates a Razorpay order for a saved (pending) order
router.post('/create-order', authenticateJWT, validateRequest(orderSchema), createOrder);

// POST /api/v1/payments/verify-payment
// Verifies the Razorpay signature and marks the order paid
router.post('/verify-payment', authenticateJWT, validateRequest(paymentVerificationSchema), verifyPayment);

// POST /api/v1/payments/webhook
// Called by Razorpay. Authenticated by its signature (not a JWT).
router.post('/webhook', handleWebhook);

export default router;
