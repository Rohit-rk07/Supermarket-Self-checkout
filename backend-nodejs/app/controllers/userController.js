import mongoose from 'mongoose';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { recordAudit } from '../utils/audit.js';

const ROLES = ['customer', 'staff', 'admin'];

// Staff and customers are chosen here; admins are set only in the server settings (ADMIN_EMAILS)
const ASSIGNABLE_ROLES = ['customer', 'staff'];

const who = (user) => user.name || user.email || user.phoneNumber || 'this user';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Admin: list registered users, optionally filtered by role or a name/phone search
export const listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const { role, search } = req.query;

    // Hide half-finished signups from the old phone sign-in (a Google account, or a verified phone, counts as real)
    const query = { $and: [{ $or: [{ googleId: { $exists: true } }, { isPhoneVerified: true }] }] };

    if (ROLES.includes(role)) {
      query.role = role;
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim().slice(0, 50)), 'i');
      query.$and.push({ $or: [{ name: pattern }, { email: pattern }, { phoneNumber: pattern }] });
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
    ).select('name email phoneNumber role isActive');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    logger.authLog(isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', req.user._id, { targetUserId: userId });
    await recordAudit(req, isActive ? 'user.reactivate' : 'user.deactivate',
      `${isActive ? 'Reactivated' : 'Deactivated'} ${who(user)} (${user.role})`, { type: 'user', id: userId });

    res.json({
      success: true,
      message: `${who(user)} is now ${isActive ? 'active' : 'deactivated'}`,
      data: user
    });
  } catch (error) {
    logger.error('Update user active error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update the account' });
  }
};

// Admin: make someone staff, or back to a customer.
// Admins are never made or removed here: they come from the server's ADMIN_EMAILS setting, so the shop
// can never be left without an admin and staff can never be promoted to admin by mistake.
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be customer or staff. Admins are set in the server settings.' });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (String(req.user._id) === String(userId)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }

    const existing = await User.findById(userId).select('role');
    if (!existing) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (existing.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admins are set in the server settings (ADMIN_EMAILS) and cannot be changed here.' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true }
    ).select('name email phoneNumber role');

    logger.authLog('ROLE_CHANGED', req.user._id, { targetUserId: userId, newRole: role });
    await recordAudit(req, 'user.role', `Made ${who(user)} ${role}`, { type: 'user', id: userId });

    res.json({
      success: true,
      message: `${who(user)} is now ${role}`,
      data: user
    });
  } catch (error) {
    logger.error('Update user role error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
};
