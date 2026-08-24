import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';

// Create new order
export const createOrder = async (req, res) => {
  try {
    const { items, notes, deliveryAddress } = req.body;
    
    let userId, userPhone, userName;

    // Handle demo-token authentication
    if (req.headers['demo-token'] === 'demo-token-123') {
      userId = 'demo-user';
      userPhone = '+91-9999999999'; // Demo phone number
      userName = 'Demo User';
    } else if (req.user) {
      userId = req.user._id;
      userPhone = req.user.phoneNumber;
      userName = req.user.name;
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate items and calculate total
    const orderItems = [];
    let total = 0;

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
      const subtotal = product.price * quantity;

      orderItems.push({
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        price: product.price,
        quantity,
        subtotal
      });

      total += subtotal;
    }

    // Generate order number
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    const orderNumber = `ORD-${timestamp}-${random}`.toUpperCase();

    console.log('🔢 Generated order number:', orderNumber);

    // Create order
    const order = new Order({
      userId,
      userPhone,
      userName,
      items: orderItems,
      total,
      orderNumber,
      notes,
      deliveryAddress
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
    const userId = req.user._id; // Should be set by middleware for both regular and demo users

    const { page = 1, limit = 10, status } = req.query;

    // Build query
    const query = { userId };
    if (status) {
      query.status = status;
    }

    console.log('🔍 Fetching orders for userId:', userId, 'with query:', query);

    const [orders, total] = await Promise.all([
      Order.find(query)
      .select('orderNumber total status paymentStatus paymentMethod items createdAt')
      .populate('items.productId', 'name price category')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(),
      Order.countDocuments(query)
    ]);

    console.log('📦 Found orders:', orders.length);

    // Update order statuses based on age for all users
    const statusUpdates = [];
    const updatedOrders = orders.map((order) => {
      const orderAge = Date.now() - order.createdAt.getTime();
      const hoursOld = orderAge / (1000 * 60 * 60);
      
      let newStatus = order.status;
      
      // Auto-update status based on time
      if (order.paymentStatus === 'paid' && order.status === 'pending') {
        if (hoursOld > 48) {
          newStatus = 'completed';
        } else if (hoursOld > 2) {
          newStatus = 'processing';
        }
        
        if (newStatus !== order.status) {
          order.status = newStatus;
          statusUpdates.push({
            updateOne: {
              filter: { _id: order._id, status: 'pending' },
              update: { $set: { status: newStatus } }
            }
          });
        }
      }
      
      return order;
    });

    if (statusUpdates.length > 0) {
      await Order.bulkWrite(statusUpdates, { ordered: false });
    }

    res.json({
      success: true,
      data: {
        orders: updatedOrders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching purchases:', error);
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
    const userId = req.user._id; // Should be set by middleware for both regular and demo users

    console.log('🔍 Fetching order:', orderId, 'for userId:', userId);

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
    console.error('❌ Get order error:', error);
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

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    let userId = req.user?._id;

    // Handle demo-token authentication
    if (!userId && req.headers['demo-token'] === 'demo-token-123') {
      userId = 'demo-user';
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order that is already ${order.status}`
      });
    }

    order.status = 'cancelled';
    order.updatedAt = new Date();
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
    const { page = 1, limit = 10, status, paymentStatus } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const orders = await Order.find(query)
      .select('orderNumber total status paymentStatus userPhone userName items createdAt')
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

// Get order statistics (admin only)
export const getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
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
          completedOrders,
          cancelledOrders,
          totalRevenue: totalRevenue[0]?.total || 0
        },
        recentOrders
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
