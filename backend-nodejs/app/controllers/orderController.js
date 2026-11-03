import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import { priceBasket, taxFor } from '../utils/pricing.js';
import { expireStaleOrders } from '../utils/orderExpiry.js';

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
  await Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value: percent } }, { upsert: true });
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
    const userPhone = req.user.phoneNumber;
    const userName = req.user.name;

    // Validate items and calculate totals
    const orderItems = [];

    const barcodes = [...new Set(items.map(item => item.barcode))];
    const products = await Product.find({ barcode: { $in: barcodes }, isActive: true }).lean();
    const productsByBarcode = new Map(products.map(product => [product.barcode, product]));

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
      if (product.trackStock === true && (product.stock ?? 0) < quantity) {
        return res.status(409).json({
          success: false,
          message: (product.stock ?? 0) <= 0
            ? `${product.name} is out of stock`
            : `Only ${product.stock} of ${product.name} left`
        });
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
        .select('orderNumber subtotal tax total status paymentStatus paymentMethod paidAt items createdAt')
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
      .select('-bagCheckRequired -bagChecked -exitedBy -exitedByName -refundRequestedAt')
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

    order.status = status;

    await order.save();

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
    const { page = 1, limit = 10, status, paymentStatus } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const orders = await Order.find(query)
      .select('orderNumber total status paymentStatus razorpayOrderId userPhone userName items createdAt paidAt exitedAt exitedByName bagCheckRequired bagChecked refundedAt refundReason')
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
// result is one of PAID, NOT_PAID, ALREADY_EXITED, CANCELLED, so the UI can show a clear verdict.
export const verifyReceipt = async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();

    let order = await Order.findOne({ orderNumber })
      .select('orderNumber items subtotal tax total status paymentStatus paidAt exitedAt exitedByName bagCheckRequired bagChecked createdAt userName')
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
        ...(bagChecked ? {} : { bagCheckRequired: { $ne: true } })
      },
      {
        $set: {
          exitedAt: new Date(),
          exitedBy: req.user._id,
          exitedByName: req.user.name || req.user.phoneNumber,
          bagChecked
        }
      },
      { new: true }
    ).select('orderNumber total exitedAt exitedByName bagChecked').lean();

    if (order) {
      return res.json({
        success: true,
        message: 'Exit confirmed',
        data: order
      });
    }

    // Not updated: work out why so staff get a clear message
    const existing = await Order.findOne({ orderNumber })
      .select('paymentStatus status exitedAt bagCheckRequired')
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

    const recentOrders = await Order.find()
      .select('orderNumber total status userPhone userName createdAt')
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
