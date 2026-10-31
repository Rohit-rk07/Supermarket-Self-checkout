import mongoose from 'mongoose';

// Small key/value records the app keeps about itself (for example when the last webhook arrived)
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);
