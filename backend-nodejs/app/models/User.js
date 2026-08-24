import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: false,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'staff'],
    default: 'customer'
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isNewUser: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  otpCode: String,
  otpExpires: Date
}, {
  timestamps: true
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

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


// Generate OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otpCode = otp;
  this.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return otp;
};

// Verify OTP
userSchema.methods.verifyOTP = function(otp) {
  return this.otpCode === otp && this.otpExpires > Date.now();
};

const User = mongoose.model('User', userSchema);

export default User;
