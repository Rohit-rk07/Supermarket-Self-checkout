import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import { priceBasket, taxFor } from '../utils/pricing.js';
import { expireStaleOrders, PENDING_ORDER_MINUTES } from '../utils/orderExpiry.js';
import { recordAudit } from '../utils/audit.js';

// A tracked product at or below this many units counts as low stock
export const LOW_STOCK_LEVEL = 5;

// ---- Random bag check (R-10) ----
export const DEFAULT_BAG_CHECK_PERCENT = 10;

export const getBagCheckPercent = async () => {
  const setting = await Setting.findOne({ key: 'bagCheckPercent' }).lean();
  const value = Number(setting?.value);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_BAG_CHECK_PERCENT;
};

// Decide once, per order, whether it gets a bag check. The answer is saved so looking at the same receipt
// again (or another staff member looking) never re-rolls it. Only paid orders that have not yet left get one.
const ensureBagCheckFlag = async (order) => {
  if (!order || order.bagCheckRequired !== undefined) return order;
  if (order.paymentStatus !== 'paid' || order.exitedAt || order.status === 'cancelled') return order;

  const percent = await getBagCheckPercent();
  const required = Math.random() * 100 < percent;
  const saved = await Order.findOneAndUpdate(
    { _id: order._id, bagCheckRequired: { $exists: false } },
    { $set: { bagCheckRequired: required } },
    { new: true }
  ).select('bagCheckRequired').lean();

  // Another request decided first: use its answer
  const finalValue = saved ? saved.bagCheckRequired : (await Order.findById(order._id).select('bagCheckRequired').lean()).bagCheckRequired;
  return { ...order, bagCheckRequired: finalValue };
};

export const getBagCheckSetting = async (req, res) => {
  res.json({ success: true, data: { percent: await getBagCheckPercent() } });
};

export const updateBagCheckSetting = async (req, res) => {
  const { percent } = req.body;
  const previous = await getBagCheckPercent();
  await Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value: percent } }, { upsert: true });
  await recordAudit(req, 'setting.bagcheck', `Bag check changed from ${previous}% to ${percent}%`, { type: 'setting', id: 'bagCheckPercent' });
  res.json({ success: true, message: `Bag check set to ${percent} percent`, data: { percent } });
};

// Create a new order. It starts as pending/unpaid; payment is handled in paymentController.
// The client sends only barcodes and quantities: every price comes from the database.
export const createOrder = async (req, res) => {
  try {
    const { items, notes } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = req.user._id;
    const userPhone = req.user.phoneNumber || '';
    const userEmail = req.user.email || '';
    const userName = req.user.name;

    // Validate items and calculate totals
    const orderItems = [];

    const barcodes = [...new Set(items.map(item => item.barcode))];
    const products = await Product.find({ barcode: { $in: barcodes }, isActive: true }).lean();
    const productsByBarcode = new Map(products.map(product => [product.barcode, product]));

    // How many of each barcode this basket asks for in total (the same barcode may appear on two lines)
    const requested = new Map();
    for (const item of items) {
      requested.set(item.barcode, (requested.get(item.barcode) || 0) + (item.quantity || 1));
    }

    // Units other shoppers are paying for right now are held for them, so the last unit is not sold twice.
    // An unpaid order holds its stock for PENDING_ORDER_MINUTES, then it lets go on its own.
    // This shopper's own earlier unpaid orders do not count: a new checkout replaces them.
    const trackedIds = products.filter((product) => product.trackStock === true).map((product) => product._id);
    const heldRows = trackedIds.length === 0 ? [] : await Order.aggregate([
      {
        $match: {
          paymentStatus: 'pending',
          status: 'pending',
          createdAt: { $gte: new Date(Date.now() - PENDING_ORDER_MINUTES * 60 * 1000) },
          userId: { $ne: userId },
          'items.productId': { $in: trackedIds }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: trackedIds } } },
      { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } }
    ]);
    const held = new Map(heldRows.map((row) => [String(row._id), row.quantity]));

    for (const item of items) {
      const product = productsByBarcode.get(item.barcode);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product with barcode ${item.barcode} not found`
        });
      }

      const quantity = item.quantity || 1;
      // Stock only limits products the shop tracks
      if (product.trackStock === true) {
        const onShelf = product.stock ?? 0;
        const heldByOthers = held.get(String(product._id)) || 0;
        const available = Math.max(onShelf - heldByOthers, 0);

        if (available < requested.get(item.barcode)) {
          let message;
          if (onShelf <= 0) {
            message = `${product.name} is out of stock`;
          } else if (available <= 0) {
            message = `${product.name}: the last ones are being paid for by other shoppers. Try again in a few minutes.`;
          } else {
            message = `Only ${available} of ${product.name} left${heldByOthers > 0 ? ' (the rest are being paid for by other shoppers)' : ''}`;
          }
          return res.status(409).json({ success: false, message });
        }
      }

      const subtotal = Math.round(product.price * quantity * 100) / 100;
      const tax = taxFor(product);

      orderItems.push({
        gstRate: tax.rate,
        taxInclusive: tax.inclusive,
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        quantity,
        subtotal
      });

      // (the order's totals are worked out once all lines are priced)
    }

    // Tax is applied on the server so the saved total is exactly what Razorpay will charge
    const totals = priceBasket(orderItems);

    // Generate order number
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    const orderNumber = `ORD-${timestamp}-${random}`.toUpperCase();

    const order = new Order({
      userId,
      userPhone,
      userEmail,
      userName,
      items: orderItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      taxIncluded: totals.taxIncluded,
      total: totals.total,
      orderNumber,
      notes
    });

    await order.save();

    // Populate product details
    await order.populate('items.productId', 'name price category');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
};

// Get user orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id; // Set by middleware for both regular and demo users
    await expireStaleOrders();

    const { page = 1, limit = 10, status } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .select('orderNumber subtotal tax total status paymentStatus paymentMethod paidAt items createdAt refundedAmount refundLines')
        .populate('items.productId', 'name price category')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchases',
      error: error.message
    });
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id; // Set by middleware for both regular and demo users

    // Staff-only fields (the bag-check decision, who let them out) are never sent to the shopper
    const order = await Order.findOne({ _id: orderId, userId })
      .select('-bagCheckRequired -bagChecked -bagResult -bagNote -exitedBy -exitedByName -refundRequestedAt -refundFailedAt -refundFailedId')
      .populate('items.productId', 'name price category description');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order'
    });
  }
};

// Update order status (admin only)
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // A paid or refunded order is never edited by hand; refunds have their own flow
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'A paid order cannot be changed here'
      });
    }

    const previousStatus = order.status;
    order.status = status;

    await order.save();
    await recordAudit(req, 'order.status', `Order ${order.orderNumber} moved from ${previousStatus} to ${status}`, { type: 'order', id: order._id });

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: order
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order'
    });
  }
};

// Cancel order (only orders that have not been paid)
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Paid orders cannot be cancelled'
      });
    }

    order.status = 'cancelled';
    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cancelling order',
      error: error.message
    });
  }
};

// Get all orders (admin only)
export const getAllOrders = async (req, res) => {
  try {
    await expireStaleOrders();
    const { page = 1, limit = 10, status, paymentStatus, flag } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    // Orders that need someone's attention
    if (flag === 'refundFailed') query.refundFailedAt = { $exists: true };
    if (flag === 'bagMismatch') query.bagResult = 'mismatch';
    if (flag === 'exitHeld') query.exitHeldAt = { $ne: null, $exists: true };
    if (flag === 'partialRefund') query.refundedAmount = { $gt: 0 };

    const orders = await Order.find(query)
      .select('orderNumber total status paymentStatus razorpayOrderId userPhone userEmail userName items createdAt paidAt exitedAt exitHeldAt exitedByName bagCheckRequired bagChecked bagResult bagNote refundedAt refundReason refundedAmount refundLines refundFailedAt')
      .populate('userId', 'name phoneNumber')
      .populate('items.productId', 'name price category')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
};

// Staff: look up an order by the receipt number in its QR code (read only).
// result is one of PAID, NOT_PAID, ALREADY_EXITED, CANCELLED, REFUNDED, HELD, so the UI can show a clear verdict.
export const verifyReceipt = async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();

    let order = await Order.findOne({ orderNumber })
      .select('orderNumber items subtotal tax total status paymentStatus paidAt exitedAt exitHeldAt exitedByName bagCheckRequired bagChecked bagResult bagNote refundedAmount refundLines createdAt userName')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        result: 'NOT_FOUND',
        message: 'No order matches this receipt'
      });
    }

    let result = 'PAID';
    if (order.paymentStatus === 'refunded') {
      result = 'REFUNDED';
    } else if (order.status === 'cancelled') {
      result = 'CANCELLED';
    } else if (order.paymentStatus !== 'paid') {
      result = 'NOT_PAID';
    } else if (order.exitedAt) {
      result = 'ALREADY_EXITED';
    } else if (order.exitHeldAt) {
      result = 'HELD';
    } else {
      order = await ensureBagCheckFlag(order);
    }

    res.json({
      success: true,
      result,
      // true means staff must look in the bag before confirming the exit
      bagCheckRequired: result === 'PAID' && order.bagCheckRequired === true,
      data: order
    });
  } catch (error) {
    console.error('Verify receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify receipt'
    });
  }
};

// Staff: confirm the shopper may leave. Works once per order, so a receipt cannot be reused.
export const confirmExit = async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();

    // Staff tick a box on the screen to say they looked in the bag
    const bagChecked = req.body?.bagChecked === true;
    // What they found: "matched" (the default when only the tick is sent) or "mismatch" with a note
    const bagResult = bagChecked ? (req.body?.bagResult === 'mismatch' ? 'mismatch' : 'matched') : undefined;
    const bagNote = String(req.body?.bagNote || '').trim().slice(0, 300);
    if (bagResult === 'mismatch' && bagNote.length < 3) {
      return res.status(400).json({ success: false, result: 'NOTE_REQUIRED', message: 'Write a short note about what did not match.' });
    }

    // Make sure the bag-check decision exists even if staff confirm without opening the receipt first
    const current = await Order.findOne({ orderNumber }).select('paymentStatus status exitedAt bagCheckRequired').lean();
    await ensureBagCheckFlag(current);

    // Atomic: only a paid, not cancelled, not yet exited order can be marked.
    // An order picked for a bag check needs the tick.
    const order = await Order.findOneAndUpdate(
      {
        orderNumber,
        paymentStatus: 'paid',
        status: { $ne: 'cancelled' },
        exitedAt: null,
        exitHeldAt: null,
        ...(bagChecked ? {} : { bagCheckRequired: { $ne: true } })
      },
      {
        $set: bagResult === 'mismatch'
          // A mismatch holds the exit: the shopper stays until an admin releases it
          ? { exitHeldAt: new Date(), exitedBy: req.user._id, exitedByName: req.user.name || req.user.email, bagChecked, bagResult, bagNote }
          : {
            exitedAt: new Date(),
            exitedBy: req.user._id,
            exitedByName: req.user.name || req.user.email || req.user.phoneNumber,
            bagChecked,
            ...(bagResult ? { bagResult } : {})
          }
      },
      { new: true }
    ).select('orderNumber total exitedAt exitHeldAt exitedByName bagChecked bagResult').lean();

    if (order && order.exitHeldAt && !order.exitedAt) {
      await recordAudit(req, 'order.exithold', `Held the exit of ${order.orderNumber}: ${bagNote}`, { type: 'order', id: order._id });
      return res.status(200).json({
        success: true,
        result: 'HELD',
        message: 'Exit held. Ask an admin to release it.',
        data: order
      });
    }

    if (order) {
      return res.json({
        success: true,
        message: 'Exit confirmed',
        data: order
      });
    }

    // Not updated: work out why so staff get a clear message
    const existing = await Order.findOne({ orderNumber })
      .select('paymentStatus status exitedAt exitHeldAt bagCheckRequired')
      .lean();

    if (!existing) {
      return res.status(404).json({ success: false, result: 'NOT_FOUND', message: 'No order matches this receipt' });
    }
    if (existing.paymentStatus === 'refunded') {
      return res.status(400).json({ success: false, result: 'REFUNDED', message: 'This order was refunded' });
    }
    if (existing.exitedAt) {
      return res.status(409).json({ success: false, result: 'ALREADY_EXITED', message: 'This receipt was already used to exit' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, result: 'CANCELLED', message: 'This order was cancelled' });
    }
    if (existing.exitHeldAt) {
      return res.status(409).json({ success: false, result: 'HELD', message: 'This exit is on hold after a bag-check mismatch. An admin has to release it.' });
    }
    if (existing.paymentStatus === 'paid' && existing.bagCheckRequired === true && !bagChecked) {
      return res.status(400).json({ success: false, result: 'BAG_CHECK_REQUIRED', message: 'This bag was picked for a check. Look in the bag, then tick the box.' });
    }
    return res.status(400).json({ success: false, result: 'NOT_PAID', message: 'This order has not been paid' });
  } catch (error) {
    console.error('Confirm exit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm exit'
    });
  }
};

// Admin: let a held shopper go. The mismatch stays recorded on the order; staff then confirm the exit as normal.
export const releaseExitHold = async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
    const order = await Order.findOneAndUpdate(
      { orderNumber, exitedAt: null, exitHeldAt: { $ne: null } },
      {
        $set: { exitReleasedAt: new Date(), exitReleasedByName: req.user.name || req.user.email, bagCheckRequired: false },
        $unset: { exitHeldAt: 1 }
      },
      { new: true }
    ).select('orderNumber').lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'This order has no exit hold to release' });
    }
    await recordAudit(req, 'order.exitrelease', `Released the exit hold on ${order.orderNumber}`, { type: 'order', id: order._id });
    res.json({ success: true, message: `Exit released for ${order.orderNumber}. Staff can now confirm it.` });
  } catch (error) {
    console.error('Release exit hold error:', error);
    res.status(500).json({ success: false, message: 'Failed to release the hold' });
  }
};

// Get order statistics (admin only)
export const getOrderStats = async (req, res) => {
  try {
    await expireStaleOrders();
    const totalOrders = await Order.countDocuments();
    // Unpaid = waiting for payment and not expired or cancelled
    const pendingOrders = await Order.countDocuments({ paymentStatus: 'pending', status: 'pending' });
    const expiredOrders = await Order.countDocuments({ status: 'expired' });
    const lastWebhook = await Setting.findOne({ key: 'lastWebhookAt' }).lean();
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });
    const refundedOrders = await Order.countDocuments({ paymentStatus: 'refunded' });

    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    // "Today" starts when the viewer's day started (the browser sends it, so the shop's own timezone is used)
    const sinceParam = new Date(String(req.query.since || ''));
    const sinceValid = !Number.isNaN(sinceParam.getTime()) && Date.now() - sinceParam.getTime() < 48 * 60 * 60 * 1000;
    const since = sinceValid ? sinceParam : new Date(new Date().setHours(0, 0, 0, 0));

    const [salesToday, awaitingExit, exitedToday, refundedToday, partialToday, lowStock, refundsFailed, bagCheckedToday, bagMismatchToday] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'paid', paidAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]),
      Order.countDocuments({ paymentStatus: 'paid', exitedAt: { $exists: false }, status: { $ne: 'cancelled' } }),
      Order.countDocuments({ exitedAt: { $gte: since } }),
      Order.aggregate([
        // Refunds made before partial refunds existed have no refund lines; their amount is the whole order
        { $match: { paymentStatus: 'refunded', refundedAt: { $gte: since }, 'refundLines.0': { $exists: false } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { 'refundLines.at': { $gte: since } } },
        { $unwind: '$refundLines' },
        { $match: { 'refundLines.at': { $gte: since } } },
        { $group: { _id: '$refundLines.refundId', amount: { $sum: '$refundLines.amount' } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Product.countDocuments({ isActive: true, trackStock: true, stock: { $lte: LOW_STOCK_LEVEL } }),
      Order.countDocuments({ refundFailedAt: { $exists: true } }),
      Order.countDocuments({ $or: [{ exitedAt: { $gte: since } }, { exitHeldAt: { $gte: since } }], bagChecked: true }),
      // A held exit counts now; once released, it counts on the day the shopper leaves
    Order.countDocuments({ $or: [{ exitedAt: { $gte: since } }, { exitHeldAt: { $gte: since } }], bagResult: 'mismatch' })
    ]);

    const recentOrders = await Order.find()
      .select('orderNumber total status userPhone userEmail userName createdAt')
      .populate('userId', 'name phoneNumber')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        stats: {
          totalOrders,
          pendingOrders,
          expiredOrders,
          completedOrders,
          cancelledOrders,
          refundedOrders,
          totalRevenue: totalRevenue[0]?.total || 0
        },
        today: {
          since,
          sales: salesToday[0]?.total || 0,
          paidOrders: salesToday[0]?.count || 0,
          awaitingExit,
          exited: exitedToday,
          refunds: (refundedToday[0]?.count || 0) + (partialToday[0]?.count || 0),
          refundedAmount: (refundedToday[0]?.total || 0) + (partialToday[0]?.total || 0),
          lowStock,
          refundsFailed, // orders where Razorpay said a refund failed (all time, until an admin clears it)
          bagChecked: bagCheckedToday,
          bagMismatches: bagMismatchToday
        },
        recentOrders,
        payments: {
          webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
          lastWebhookAt: lastWebhook?.value || null
        }
      }
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order statistics'
    });
  }
};
