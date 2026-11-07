import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  // Who they are: the Google account they sign in with
  googleId: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: false,
    trim: true
  },
  picture: String,
  // Optional contact number the person can add in their profile. Not used to sign in.
  phoneNumber: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'staff'],
    default: 'customer'
  },
  // Kept from the old phone sign-in so existing accounts still show in the staff list
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Raised by "sign out of all devices": every token made before that stops working
  tokenVersion: {
    type: Number,
    default: 0
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes. Uniqueness only applies to accounts that actually have the value, so many accounts can have no phone.
userSchema.index({ phoneNumber: 1 }, { unique: true, partialFilterExpression: { phoneNumber: { $type: 'string' } } });
userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
// Compound indexes for common query patterns
userSchema.index({ role: 1, isActive: 1 });

// Pre-save middleware
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

const User = mongoose.model('User', userSchema);

export default User;
