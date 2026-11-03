import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import { PENDING_ORDER_MINUTES } from '../utils/orderExpiry.js';

// NOTE: Do NOT initialize Razorpay at module load time, because dotenv may not
// be configured yet when this file is imported. Instead, create the client
// inside the handler using the current environment variables.

const hasValidCredentials = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  return Boolean(
    RAZORPAY_KEY_ID &&
    RAZORPAY_KEY_SECRET &&
    !RAZORPAY_KEY_ID.includes('YOUR_TEST_KEY') &&
    !RAZORPAY_KEY_SECRET.includes('YOUR_SECRET_KEY')
  );
};

// Tests swap this for a fake so they never call the real Razorpay
let razorpayClientFactory = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

export const setRazorpayClientFactory = (factory) => {
  razorpayClientFactory = factory;
};

const getRazorpayClient = () => razorpayClientFactory();

const safeEqual = (expected, received) => {
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

// Signature Razorpay returns to the browser after a successful payment
export const isValidPaymentSignature = (orderId, paymentId, signature) => {
  if (!orderId || !paymentId || !signature || !process.env.RAZORPAY_KEY_SECRET) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return safeEqual(expected, signature);
};

// Signature Razorpay sends with every webhook call (signed over the raw body)
const isValidWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
};

// Mark an order paid. Safe to call twice (verify-payment and the webhook both call it).
// Stock falls only the first time an order becomes paid, and only for products the shop tracks.
const reduceStock = async (items) => {
  const operations = (items || [])
    .filter((item) => item.productId)
    .map((item) => ({
      updateOne: {
        filter: { _id: item.productId, trackStock: true },
        update: { $inc: { stock: -(item.quantity || 1) } }
      }
    }));

  if (operations.length === 0) return;

  await Product.bulkWrite(operations);
  // Two shoppers can buy the last unit at the same moment; never show negative stock
  await Product.updateMany({ trackStock: true, stock: { $lt: 0 } }, { $set: { stock: 0 } });
};

const markOrderPaid = async (filter, { paymentId, signature }) => {
  const update = {
    paymentStatus: 'paid',
    paymentMethod: 'razorpay',
    status: 'completed',
    paidAt: new Date()
  };
  if (paymentId) update.razorpayPaymentId = paymentId;
  if (signature) update.razorpaySignature = signature;

  const updated = await Order.findOneAndUpdate(
    // A refunded order never turns back into a paid one, even if a late payment message arrives
    { ...filter, paymentStatus: { $nin: ['paid', 'refunded'] } },
    { $set: update },
    { new: true }
  );

  // Already paid earlier: return the existing order
  if (updated) {
    await reduceStock(updated.items);
    return updated;
  }

  return Order.findOne(filter);
};

// Create a Razorpay order for an order that was already saved as pending.
// The amount always comes from the saved order, never from the client.
export const createOrder = async (req, res, next) => {
  try {
    const { orderId, currency = 'INR' } = req.body;

    if (!hasValidCredentials()) {
      logger.error('Invalid Razorpay credentials', {
        keyId: process.env.RAZORPAY_KEY_ID?.substring(0, 10) + '...',
        hasSecret: !!process.env.RAZORPAY_KEY_SECRET
      });
      return res.status(500).json({
        success: false,
        error: 'Payment service not configured',
        details: 'Please configure valid Razorpay credentials'
      });
    }

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = await Order.findOne({ _id: orderId, userId: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({ success: false, message: 'This order was refunded' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Order was cancelled' });
    }

    // Unpaid orders go stale after PENDING_ORDER_MINUTES; the shopper must check out again
    const isTooOld = Date.now() - new Date(order.createdAt).getTime() > PENDING_ORDER_MINUTES * 60 * 1000;
    if (order.status === 'expired' || (order.status === 'pending' && isTooOld)) {
      if (order.status !== 'expired') {
        order.status = 'expired';
        await order.save();
      }
      return res.status(400).json({
        success: false,
        message: 'This order expired because it was not paid in time. Go back to your basket and check out again.'
      });
    }

    const amountInPaise = Math.round(order.total * 100);

    logger.info('Creating Razorpay order', { orderNumber: order.orderNumber, amount: amountInPaise, currency });

    const razorpay = getRazorpayClient();

    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency,
        receipt: order.orderNumber,
        notes: { orderId: String(order._id) }
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      logger.info('Razorpay order created successfully', { razorpayOrderId: razorpayOrder.id, amount: razorpayOrder.amount });

      res.json({
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount / 100,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      });
    } catch (razorpayError) {
      logger.error('Razorpay API error details', {
        error: razorpayError.message,
        statusCode: razorpayError.statusCode,
        description: razorpayError.error?.description,
        code: razorpayError.error?.code,
        reason: razorpayError.error?.reason
      });
      throw razorpayError; // Re-throw to trigger general error handler
    }
  } catch (error) {
    logger.error('Error creating Razorpay order', { error });
    next(error);
  }
};

// Verify the payment signature, then mark the order paid
export const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!isValidPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      logger.error('Invalid payment signature', { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({
        error: "Payment verification failed",
        details: "Invalid signature"
      });
    }

    const order = await markOrderPaid(
      { razorpayOrderId: razorpay_order_id, userId: req.user._id },
      { paymentId: razorpay_payment_id, signature: razorpay_signature }
    );

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
        details: "No order matches this payment"
      });
    }

    // Staff-only fields (the bag-check decision, who let them out) are never sent to the shopper
    const data = order.toObject();
    for (const field of ['bagCheckRequired', 'bagChecked', 'exitedBy', 'exitedByName', 'refundRequestedAt']) delete data[field];

    res.json({
      status: "success",
      message: "Payment verified successfully",
      data
    });
  } catch (error) {
    logger.error('Error verifying payment signature', { error });
    next(error);
  }
};

// Razorpay calls this directly, so the order still gets marked paid
// if the shopper closes the browser right after paying.
export const handleWebhook = async (req, res) => {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      return res.status(503).json({ success: false, message: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!isValidWebhookSignature(req.rawBody, signature)) {
      logger.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // Remember when a valid webhook last arrived so admins can see the webhook is live
    await Setting.updateOne({ key: 'lastWebhookAt' }, { $set: { value: new Date() } }, { upsert: true });

    const { event, payload } = req.body;
    const payment = payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id || payload?.order?.entity?.id;

    if (!razorpayOrderId) {
      return res.json({ received: true });
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      await markOrderPaid({ razorpayOrderId }, { paymentId: payment?.id });
    } else if (event === 'payment.failed') {
      await Order.updateOne(
        { razorpayOrderId, paymentStatus: 'pending' },
        { $set: { paymentStatus: 'failed' } }
      );
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error', { error });
    // A 500 makes Razorpay retry the webhook later
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

// Staff: ask Razorpay whether an unpaid order was really paid, and mark it paid if so.
// Only a captured payment of exactly the order amount counts.
export const reconcileOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.json({ success: true, result: 'ALREADY_PAID', message: 'This order is already paid', data: order });
    }
    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({ success: false, message: 'This order was refunded' });
    }
    if (!order.razorpayOrderId) {
      return res.status(400).json({ success: false, message: 'No payment was ever started for this order' });
    }
    if (!hasValidCredentials()) {
      return res.status(500).json({ success: false, message: 'Payment service not configured' });
    }

    const razorpay = getRazorpayClient();
    let payments;
    try {
      payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
    } catch (razorpayError) {
      logger.error('Could not fetch payments from Razorpay', { error: razorpayError.message });
      return res.status(502).json({ success: false, message: 'Razorpay could not be reached. Try again shortly.' });
    }

    const expectedPaise = Math.round(order.total * 100);
    const match = (payments?.items || []).find(
      (payment) => payment.status === 'captured' && payment.amount === expectedPaise
    );

    if (!match) {
      return res.json({
        success: true,
        result: 'NOT_PAID',
        message: 'Razorpay has no completed payment for this order',
        data: order
      });
    }

    const paidOrder = await markOrderPaid({ _id: order._id }, { paymentId: match.id });
    logger.info('Order marked paid by reconcile', { orderNumber: order.orderNumber, paymentId: match.id });
    res.json({ success: true, result: 'MARKED_PAID', message: 'Payment found. The order is now paid.', data: paidOrder });
  } catch (error) {
    logger.error('Error reconciling order', { error });
    next(error);
  }
};

// Admin: refund a paid order in full through Razorpay (R-23).
// The order becomes refunded, and stock comes back for products the shop tracks.
export const refundOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const reason = String(req.body?.reason || '').trim();

    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({ success: false, message: 'This order was already refunded' });
    }
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ success: false, message: 'Only a paid order can be refunded' });
    }
    if (!order.razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'No Razorpay payment is recorded for this order, so it cannot be refunded here' });
    }
    if (!hasValidCredentials()) {
      return res.status(500).json({ success: false, message: 'Payment service not configured' });
    }

    // Claim the refund so two admins pressing the button together cannot refund twice
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: 'paid', refundRequestedAt: { $exists: false } },
      { $set: { refundRequestedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ success: false, message: 'A refund for this order is already in progress' });
    }

    let refund;
    try {
      const razorpay = getRazorpayClient();
      refund = await razorpay.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(order.total * 100),
        speed: 'normal',
        notes: { orderNumber: order.orderNumber, ...(reason ? { reason } : {}) }
      });
    } catch (razorpayError) {
      // Nothing was refunded: release the claim so the admin can try again
      await Order.updateOne({ _id: order._id }, { $unset: { refundRequestedAt: 1 } });
      logger.error('Razorpay refund failed', { orderNumber: order.orderNumber, error: razorpayError?.error?.description || razorpayError.message });
      return res.status(502).json({
        success: false,
        message: razorpayError?.error?.description || 'Razorpay could not make the refund. Nothing was changed. Try again shortly.'
      });
    }

    try {
      const refunded = await Order.findOneAndUpdate(
        { _id: order._id },
        {
          $set: {
            paymentStatus: 'refunded',
            status: 'refunded',
            refundId: refund?.id,
            refundedAt: new Date(),
            refundedBy: req.user._id,
            refundReason: reason || undefined
          }
        },
        { new: true }
      );

      // Put the items back on the shelf (only products the shop tracks)
      const restock = (order.items || [])
        .filter((item) => item.productId)
        .map((item) => ({
          updateOne: {
            filter: { _id: item.productId, trackStock: true },
            update: { $inc: { stock: item.quantity || 1 } }
          }
        }));
      if (restock.length > 0) await Product.bulkWrite(restock);

      logger.info('Order refunded', { orderNumber: order.orderNumber, refundId: refund?.id });
      res.json({ success: true, message: 'Refund made. The order is now refunded.', data: refunded });
    } catch (saveError) {
      // Money has moved at Razorpay but our record did not update: say so loudly
      logger.error('Refund made at Razorpay but the order could not be updated', { orderNumber: order.orderNumber, refundId: refund?.id, error: saveError.message });
      res.status(500).json({
        success: false,
        message: `The refund was made at Razorpay (refund id ${refund?.id}) but the order could not be updated. Do not refund again; contact the developer.`
      });
    }
  } catch (error) {
    logger.error('Error refunding order', { error });
    next(error);
  }
};
