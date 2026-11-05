import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import { PENDING_ORDER_MINUTES } from '../utils/orderExpiry.js';
import { recordAudit } from '../utils/audit.js';
import { priceBasket } from '../utils/pricing.js';

const round2 = (value) => Math.round(value * 100) / 100;

// Work out what a refund request covers. `requested` is [{ barcode, quantity }] or empty for "everything left".
// Returns { error } or { lines, amount, isFull }, where lines are the per-product parts of the refund.
export const planRefund = (order, requested) => {
  const left = new Map();
  for (const item of order.items || []) left.set(item.barcode, (left.get(item.barcode) || 0) + (item.quantity || 1));
  for (const line of order.refundLines || []) left.set(line.barcode, (left.get(line.barcode) || 0) - (line.quantity || 0));

  const wanted = new Map();
  if (!requested || requested.length === 0) {
    for (const [barcode, quantity] of left) if (quantity > 0) wanted.set(barcode, quantity);
  } else {
    for (const entry of requested) {
      wanted.set(entry.barcode, (wanted.get(entry.barcode) || 0) + entry.quantity);
    }
    for (const [barcode, quantity] of wanted) {
      if (!left.has(barcode)) return { error: `This order has no item with barcode ${barcode}` };
      if (quantity > left.get(barcode)) {
        return { error: `Only ${Math.max(left.get(barcode), 0)} of ${barcode} can still be refunded` };
      }
    }
  }
  if (wanted.size === 0) return { error: 'Nothing is left to refund on this order' };

  // Price what is being handed back, line by line, the same way the order was priced
  const take = new Map(wanted);
  const subset = [];
  for (const item of order.items || []) {
    const have = take.get(item.barcode) || 0;
    if (have <= 0) continue;
    const quantity = Math.min(have, item.quantity || 1);
    take.set(item.barcode, have - quantity);
    subset.push({ ...(item.toObject ? item.toObject() : item), quantity });
  }

  const alreadyBack = order.refundedAmount || 0;
  const moneyLeft = round2(order.total - alreadyBack);
  const isFull = [...left].every(([barcode, quantity]) => (quantity - (wanted.get(barcode) || 0)) <= 0);
  const amount = isFull ? moneyLeft : Math.min(priceBasket(subset).total, moneyLeft);
  if (amount <= 0) return { error: 'These items cost nothing, so there is no money to refund' };

  const lines = [...wanted].map(([barcode, quantity]) => {
    const mine = subset.filter((line) => line.barcode === barcode);
    return { barcode, name: mine[0]?.name, quantity, amount: priceBasket(mine).total };
  });
  // Keep the parts adding up to exactly what Razorpay returns
  const drift = round2(amount - lines.reduce((sum, line) => sum + line.amount, 0));
  if (lines.length > 0 && drift !== 0) lines[lines.length - 1].amount = round2(lines[lines.length - 1].amount + drift);

  return { lines, amount, isFull };
};

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
    for (const field of ['bagCheckRequired', 'bagChecked', 'bagResult', 'bagNote', 'exitedBy', 'exitedByName', 'refundRequestedAt', 'refundFailedAt', 'refundFailedId']) delete data[field];

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

    // Razorpay says a refund did not go through: mark the order so an admin follows up by hand
    if (event === 'refund.failed') {
      const refundEntity = payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id || payload?.payment?.entity?.id;
      if (paymentId) {
        const flagged = await Order.findOneAndUpdate(
          { razorpayPaymentId: paymentId },
          { $set: { refundFailedAt: new Date(), refundFailedId: refundEntity?.id } },
          { new: true }
        );
        if (flagged) {
          logger.error('Razorpay reported a failed refund', { orderNumber: flagged.orderNumber, refundId: refundEntity?.id });
          await recordAudit({ user: { name: 'Razorpay' } }, 'order.refundfailed', `Refund for ${flagged.orderNumber} failed at Razorpay${refundEntity?.id ? ` (${refundEntity.id})` : ''}`, { type: 'order', id: flagged._id });
        }
      }
      return res.json({ received: true });
    }

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

// Admin: after sorting out a failed refund by hand (in the Razorpay dashboard), clear the warning on the order
export const resolveRefundFailure = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = await Order.findOneAndUpdate(
      { _id: orderId, refundFailedAt: { $exists: true } },
      { $unset: { refundFailedAt: 1, refundFailedId: 1 } },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'This order has no failed refund to clear' });
    }
    await recordAudit(req, 'order.refundfailed.clear', `Cleared the failed-refund warning on ${order.orderNumber}`, { type: 'order', id: order._id });
    res.json({ success: true, message: 'Warning cleared', data: order });
  } catch (error) {
    next(error);
  }
};

// Admin: refund a paid order through Razorpay (R-23). With no `items` the whole order is refunded;
// with `items: [{ barcode, quantity }]` only those are (a partial refund, which can be repeated).
// Stock comes back for the refunded units of products the shop tracks.
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

    const plan = planRefund(order, req.body?.items);
    if (plan.error) {
      return res.status(400).json({ success: false, message: plan.error });
    }

    // Claim the refund so two admins pressing the button together cannot refund twice
    const claimed = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: 'paid',
        refundRequestedAt: { $exists: false },
        // The plan was made from this much already returned; if another refund slipped in, start over
        refundedAmount: order.refundedAmount ? order.refundedAmount : { $in: [null, 0] }
      },
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
        amount: Math.round(plan.amount * 100),
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
      const now = new Date();
      const update = {
        $inc: { refundedAmount: plan.amount },
        $push: { refundLines: { $each: plan.lines.map((line) => ({ ...line, refundId: refund?.id, at: now, reason: reason || undefined })) } },
        $set: { refundedAt: now, refundedBy: req.user._id, refundReason: reason || undefined },
        // The claim is only kept for a full refund; a partial one can be followed by another
        ...(plan.isFull ? {} : { $unset: { refundRequestedAt: 1 } })
      };
      if (plan.isFull) {
        update.$set = { ...update.$set, paymentStatus: 'refunded', status: 'refunded', refundId: refund?.id };
      }
      const refunded = await Order.findOneAndUpdate({ _id: order._id }, update, { new: true });

      // Put the refunded items back on the shelf (only products the shop tracks)
      const idByBarcode = new Map((order.items || []).filter((item) => item.productId).map((item) => [item.barcode, item.productId]));
      const restock = plan.lines
        .filter((line) => idByBarcode.has(line.barcode))
        .map((line) => ({
          updateOne: {
            filter: { _id: idByBarcode.get(line.barcode), trackStock: true },
            update: { $inc: { stock: line.quantity } }
          }
        }));
      if (restock.length > 0) await Product.bulkWrite(restock);

      logger.info('Order refunded', { orderNumber: order.orderNumber, refundId: refund?.id, amount: plan.amount, partial: !plan.isFull });
      const what = plan.isFull ? `Refunded ${order.orderNumber} (${plan.amount})` : `Part-refunded ${order.orderNumber}: ${plan.lines.map((line) => `${line.quantity} x ${line.name}`).join(', ')} (${plan.amount})`;
      await recordAudit(req, 'order.refund', `${what}${reason ? `: ${reason}` : ''}`, { type: 'order', id: order._id });
      res.json({
        success: true,
        message: plan.isFull ? 'Refund made. The order is now refunded.' : `Refund of ${plan.amount} made for the chosen items.`,
        data: refunded
      });
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
