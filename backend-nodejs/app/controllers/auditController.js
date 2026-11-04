import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const GROUPS = ['user', 'product', 'order', 'setting'];

// Admin: the activity log, newest first. ?group=user|product|order|setting narrows it.
export const listAudit = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const query = {};
    if (GROUPS.includes(req.query.group)) {
      query.action = new RegExp(`^${req.query.group}\\.`);
    }

    const [entries, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: { entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
    });
  } catch (error) {
    logger.error('List audit log error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to load the activity log' });
  }
};
