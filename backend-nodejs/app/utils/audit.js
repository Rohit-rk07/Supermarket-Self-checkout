import AuditLog from '../models/AuditLog.js';
import logger from './logger.js';

// Write one line in the activity log. It must never break the action being logged,
// so a failure here is only reported in the server log.
export const recordAudit = async (req, action, summary, target = {}) => {
  try {
    await AuditLog.create({
      action,
      actorId: req.user?._id,
      actorName: req.user?.name || req.user?.email || req.user?.phoneNumber || 'Unknown',
      targetType: target.type,
      targetId: target.id !== undefined ? String(target.id) : undefined,
      summary: String(summary).slice(0, 300)
    });
  } catch (error) {
    logger.error('Could not write the activity log', { action, error: error.message });
  }
};
