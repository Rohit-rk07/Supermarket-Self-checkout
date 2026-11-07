import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// JWT Authentication Middleware
export const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user in database
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or inactive user' 
      });
    }

    // "Sign out of all devices" raises the user's tokenVersion; older tokens (which carry the old number) stop working
    if ((decoded.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'You were signed out. Please sign in again.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'CastError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }

    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

// Role-based authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

// Generate JWT token
// Tokens last a day by default (set JWT_EXPIRES_IN to change it). `tokenVersion` ties the token to the
// user's current sign-in generation so "sign out of all devices" can cancel every older token.
export const generateJWT = (userId, tokenVersion = 0) => {
  return jwt.sign(
    { userId, tv: tokenVersion },
    process.env.JWT_SECRET, 
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Optional authentication (for public endpoints)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive && (decoded.tv || 0) === (user.tokenVersion || 0)) {
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};
