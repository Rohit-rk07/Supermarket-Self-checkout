import express from 'express';
import { 
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getAllOrders,
  getOrderStats,
  verifyReceipt,
  confirmExit
} from '../controllers/orderController.js';
import { reconcileOrder } from '../controllers/paymentController.js';
import { authenticateJWT, authorize } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const createOrderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      barcode: Joi.string().required(),
      quantity: Joi.number().integer().min(1).default(1)
    })
  ).min(1).required(),
  notes: Joi.string().max(500).optional()
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'completed', 'cancelled', 'refunded', 'expired').optional(),
  paymentStatus: Joi.string().valid('pending', 'paid', 'failed', 'refunded').optional()
});

// Routes
router.post('/', authenticateJWT, validateRequest(createOrderSchema), createOrder);
router.get('/my-orders', authenticateJWT, getUserOrders);
// Exit verification (staff and admin). Declared before '/:orderId' routes.
router.get('/verify/:orderNumber', authenticateJWT, authorize('admin', 'staff'), verifyReceipt);
router.post('/verify/:orderNumber/exit', authenticateJWT, authorize('admin', 'staff'), confirmExit);
router.get('/stats', authenticateJWT, authorize('admin', 'staff'), getOrderStats);
router.get('/all', authenticateJWT, authorize('admin', 'staff'), getAllOrders);
router.get('/:orderId', authenticateJWT, getOrderById);
router.put('/:orderId/status', authenticateJWT, authorize('admin', 'staff'), validateRequest(updateOrderStatusSchema), updateOrderStatus);
router.put('/:orderId/cancel', authenticateJWT, cancelOrder);
// Staff: ask Razorpay whether an unpaid order was actually paid, and mark it paid if so
router.post('/:orderId/reconcile', authenticateJWT, authorize('admin', 'staff'), reconcileOrder);

export default router;
