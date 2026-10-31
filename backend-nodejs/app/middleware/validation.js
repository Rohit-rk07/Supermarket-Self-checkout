import Joi from 'joi';

// Product validation schema
export const productSchema = Joi.object({
  barcode: Joi.string().required().min(8).max(20),
  name: Joi.string().required().min(1).max(100),
  price: Joi.number().required().min(0).max(10000),
  category: Joi.string().trim().max(50).optional(),
  stock: Joi.number().integer().min(0).optional(),
  gstRate: Joi.number().valid(0, 5, 12, 18, 28).optional(),
  trackStock: Joi.boolean().truthy('yes', 'y', '1').falsy('no', 'n', '0').optional(),
  taxInclusive: Joi.boolean().truthy('yes', 'y', '1').falsy('no', 'n', '0').optional()
});

// Razorpay order validation schema: the client names a saved order, never an amount
export const orderSchema = Joi.object({
  orderId: Joi.string().required(),
  currency: Joi.string().default('INR')
});

// Payment verification schema
export const paymentVerificationSchema = Joi.object({
  razorpay_payment_id: Joi.string().required(),
  razorpay_order_id: Joi.string().required(),
  razorpay_signature: Joi.string().required()
});

// Validation middleware
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    next();
  };
};
