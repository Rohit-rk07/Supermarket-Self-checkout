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
  confirmExit,
  getBagCheckSetting,
  updateBagCheckSetting
} from '../controllers/orderController.js';
import { getSalesReport } from '../controllers/reportController.js';
import { reconcileOrder, refundOrder, resolveRefundFailure } from '../controllers/paymentController.js';
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

// Admins can only move an unpaid order between these states. Payment status is never set by hand:
// it changes only through Razorpay (verify, webhook, Check payment) so stock and money stay in step.
const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'cancelled', 'expired').required()
});

const bagCheckSettingSchema = Joi.object({
  percent: Joi.number().integer().min(0).max(100).required()
});

const refundSchema = Joi.object({
  reason: Joi.string().trim().max(200).allow('').optional(),
  // Leave out to refund everything that is left; or list what to hand back
  items: Joi.array().items(
    Joi.object({
      barcode: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required()
    })
  ).max(100).optional()
});

// Routes
router.post('/', authenticateJWT, validateRequest(createOrderSchema), createOrder);
router.get('/my-orders', authenticateJWT, getUserOrders);
// Exit verification (staff and admin). Declared before '/:orderId' routes.
router.get('/verify/:orderNumber', authenticateJWT, authorize('admin', 'staff'), verifyReceipt);
router.post('/verify/:orderNumber/exit', authenticateJWT, authorize('admin', 'staff'), confirmExit);
router.get('/stats', authenticateJWT, authorize('admin', 'staff'), getOrderStats);
// Share of paid orders picked for a bag check at the exit (admin changes it)
router.get('/settings/bag-check', authenticateJWT, authorize('admin', 'staff'), getBagCheckSetting);
router.put('/settings/bag-check', authenticateJWT, authorize('admin'), validateRequest(bagCheckSettingSchema), updateBagCheckSetting);
router.get('/reports/sales', authenticateJWT, authorize('admin'), getSalesReport);
router.get('/all', authenticateJWT, authorize('admin', 'staff'), getAllOrders);
router.get('/:orderId', authenticateJWT, getOrderById);
router.put('/:orderId/status', authenticateJWT, authorize('admin'), validateRequest(updateOrderStatusSchema), updateOrderStatus);
router.put('/:orderId/cancel', authenticateJWT, cancelOrder);
// Staff: ask Razorpay whether an unpaid order was actually paid, and mark it paid if so
router.post('/:orderId/reconcile', authenticateJWT, authorize('admin', 'staff'), reconcileOrder);
// Admin: clear the warning after a failed refund was sorted out by hand
router.post('/:orderId/refund-failure/clear', authenticateJWT, authorize('admin'), resolveRefundFailure);
// Admin: refund a paid order (all of it, or chosen items) through Razorpay
router.post('/:orderId/refund', authenticateJWT, authorize('admin'), validateRequest(refundSchema), refundOrder);

export default router;
