import mongoose from 'mongoose';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { recordAudit } from '../utils/audit.js';

const ROLES = ['customer', 'staff', 'admin'];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Admin: list registered users, optionally filtered by role or a name/phone search
export const listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { role, search } = req.query;

    // Hide half-finished signups (OTP never verified)
    const query = { isPhoneVerified: true };

    if (ROLES.includes(role)) {
      query.role = role;
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim().slice(0, 50)), 'i');
      query.$or = [{ name: pattern }, { phoneNumber: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name phoneNumber email role isActive lastLogin createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    logger.error('List users error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to load users' });
  }
};

// Admin: switch an account off or on (R-43). A deactivated user cannot sign in or use a saved sign-in,
// but nothing is deleted, so their orders and the exits they confirmed stay in the history.
export const updateUserActive = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isActive } },
      { new: true }
    ).select('name phoneNumber role isActive');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.authLog(isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', req.user._id, { targetUserId: userId });
    await recordAudit(req, isActive ? 'user.reactivate' : 'user.deactivate',
      `${isActive ? 'Reactivated' : 'Deactivated'} ${user.name || user.phoneNumber} (${user.role})`, { type: 'user', id: userId });

    res.json({
      success: true,
      message: `${user.name || user.phoneNumber} is now ${isActive ? 'active' : 'deactivated'}`,
      data: user
    });
  } catch (error) {
    logger.error('Update user active error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update the account' });
  }
};

// Admin: change a user's role (customer, staff or admin).
// An admin cannot change their own role, so the system can never be left without an admin.
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be customer, staff or admin' });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true }
    ).select('name phoneNumber role');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.authLog('ROLE_CHANGED', req.user._id, { targetUserId: userId, newRole: role });
    await recordAudit(req, 'user.role', `Made ${user.name || user.phoneNumber} ${role}`, { type: 'user', id: userId });

    res.json({
      success: true,
      message: `${user.name || user.phoneNumber} is now ${role}`,
      data: user
    });
  } catch (error) {
    logger.error('Update user role error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
};
