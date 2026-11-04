import mongoose from 'mongoose';

// A permanent record of who did what (role changes, deactivations, price edits, refunds, settings).
// Entries are only ever added, never edited. The actor's name is kept as text so the record
// still reads correctly if that account is changed or deactivated later.
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true }, // for example user.role, product.price, order.refund
  actorId: mongoose.Schema.Types.Mixed,
  actorName: String,
  targetType: String, // user, product, order, setting
  targetId: String,
  summary: { type: String, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
