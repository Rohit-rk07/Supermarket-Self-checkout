import mongoose from 'mongoose';
import { priceBasket } from '../utils/pricing.js';

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  barcode: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  // The tax this line was sold at, kept so a later rate change never rewrites an old receipt
  gstRate: Number,
  taxInclusive: Boolean
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String for demo users
    required: true,
    index: true
  },
  // Shoppers sign in with Google, so the phone number is optional; the email is what identifies them
  userPhone: {
    type: String,
    default: ''
  },
  userEmail: {
    type: String,
    default: ''
  },
  userName: {
    type: String,
    required: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    min: 0
  },
  tax: {
    type: Number,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled', 'refunded', 'expired'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'cash', 'card'],
    default: 'razorpay'
  },
  paymentId: {
    type: String,
    index: true
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  taxIncluded: { type: Number, min: 0 }, // GST already inside the shelf prices
  paidAt: Date,
  exitedAt: Date, // set when staff confirm the shopper may leave (receipt can only be used once)
  exitedBy: mongoose.Schema.Types.Mixed,
  exitedByName: String, // who confirmed the exit, kept as text so the history survives even if the account changes
  // Random bag check (R-10). Decided once, the first time staff look at a paid receipt, and never shown to the shopper
  bagCheckRequired: Boolean,
  bagChecked: Boolean, // staff ticked that they checked the bag when confirming the exit
  bagResult: { type: String, enum: ['matched', 'mismatch'] }, // what staff found when they looked in the bag
  bagNote: String, // what did not match (required with a mismatch)
  // Refund (R-23)
  refundRequestedAt: Date, // set while a refund is being made, so two admins cannot refund twice
  refundId: String,
  refundedAt: Date,
  refundedBy: mongoose.Schema.Types.Mixed,
  refundReason: String,
  // Partial refunds: every refund made on this order, and the money returned so far
  refundedAmount: { type: Number, min: 0 },
  refundLines: [{
    _id: false,
    barcode: String,
    name: String,
    quantity: Number,
    amount: Number,
    refundId: String,
    at: Date,
    reason: String
  }],
  // Razorpay told us a refund did not go through; the admin must follow up by hand
  refundFailedAt: Date,
  refundFailedId: String,
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  notes: String
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ razorpayOrderId: 1 });
// Compound indexes for common query patterns
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ userPhone: 1, createdAt: -1 });
orderSchema.index({ status: 1, paymentStatus: 1 });

// Generate order number
orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    this.orderNumber = `ORD-${timestamp}-${random}`.toUpperCase();
  }
  next();
});

// Calculate total from items
orderSchema.methods.calculateTotal = function() {
  const totals = priceBasket(this.items);
  // (totals come from priceBasket above)
  this.subtotal = totals.subtotal;
  this.tax = totals.tax;
  this.taxIncluded = totals.taxIncluded;
  this.total = totals.total;
  return this.total;
};

// Update item subtotals
orderSchema.pre('save', function(next) {
  this.items.forEach(item => {
    item.subtotal = item.price * item.quantity;
  });
  // Only recalculate for new orders or changed items, so old orders keep their original totals
  if (this.isNew || this.isModified('items')) {
    this.calculateTotal();
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
