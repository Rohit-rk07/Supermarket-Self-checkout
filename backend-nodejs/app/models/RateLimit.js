import mongoose from 'mongoose';

// One row per rate-limit key (for example a phone number). MongoDB deletes the row by itself
// once resetAt has passed, so this collection never grows.
const rateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  resetAt: { type: Date, required: true }
});

rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimit = mongoose.model('RateLimit', rateLimitSchema);

export default RateLimit;
