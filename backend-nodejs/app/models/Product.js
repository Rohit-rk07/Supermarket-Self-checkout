import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  barcode: {
    type: String,
    required: [true, 'Barcode is required'],
    unique: true,
    trim: true,
    minlength: [8, 'Barcode must be at least 8 characters'],
    maxlength: [20, 'Barcode cannot exceed 20 characters']
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [1, 'Product name cannot be empty'],
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    max: [10000, 'Price cannot exceed 10000']
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
// Compound indexes for common query patterns
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
