import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Setting from '../models/Setting.js';
import { priceBasket, taxFor } from '../utils/pricing.js';
import { expireStaleOrders } from '../utils/orderExpiry.js';

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

    const order = await Order.findOne({ _id: orderId, userId })
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
    const { status, paymentStatus } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;

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

    if (order.paymentStatus === 'paid') {
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
      .select('orderNumber total status paymentStatus razorpayOrderId userPhone userName items createdAt paidAt exitedAt')
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

    const order = await Order.findOne({ orderNumber })
      .select('orderNumber items subtotal tax total status paymentStatus paidAt exitedAt createdAt userName')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        result: 'NOT_FOUND',
        message: 'No order matches this receipt'
      });
    }

    let result = 'PAID';
    if (order.status === 'cancelled') {
      result = 'CANCELLED';
    } else if (order.paymentStatus !== 'paid') {
      result = 'NOT_PAID';
    } else if (order.exitedAt) {
      result = 'ALREADY_EXITED';
    }

    res.json({
      success: true,
      result,
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

    // Atomic: only a paid, not cancelled, not yet exited order can be marked
    const order = await Order.findOneAndUpdate(
      {
        orderNumber,
        paymentStatus: 'paid',
        status: { $ne: 'cancelled' },
        exitedAt: null
      },
      { $set: { exitedAt: new Date(), exitedBy: req.user._id } },
      { new: true }
    ).select('orderNumber total exitedAt').lean();

    if (order) {
      return res.json({
        success: true,
        message: 'Exit confirmed',
        data: order
      });
    }

    // Not updated: work out why so staff get a clear message
    const existing = await Order.findOne({ orderNumber })
      .select('paymentStatus status exitedAt')
      .lean();

    if (!existing) {
      return res.status(404).json({ success: false, result: 'NOT_FOUND', message: 'No order matches this receipt' });
    }
    if (existing.exitedAt) {
      return res.status(409).json({ success: false, result: 'ALREADY_EXITED', message: 'This receipt was already used to exit' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, result: 'CANCELLED', message: 'This order was cancelled' });
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
