import RateLimit from '../models/RateLimit.js';

// A rate-limit store that keeps its counts in MongoDB instead of in the server's memory.
// Memory is lost on every restart and is not shared between serverless instances, so a limit
// such as "5 OTP texts per phone" could be dodged. Here every instance counts in the same place.
//
// Works with express-rate-limit v7 (the Store interface: init, increment, decrement, resetKey).
// `prefix` keeps different limiters from sharing a counter when they use the same kind of key.
export default class MongoRateLimitStore {
  // false tells express-rate-limit that the counts are shared, not private to this process
  localKeys = false;

  constructor({ prefix = '' } = {}) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  storageKey(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    const storageKey = this.storageKey(key);
    const now = new Date();
    const newReset = new Date(now.getTime() + this.windowMs);

    // One atomic step: start a new window if the old one ended, otherwise add one to the count
    const run = () =>
      RateLimit.findOneAndUpdate(
        { key: storageKey },
        [
          {
            $set: {
              count: { $cond: [{ $gt: ['$resetAt', now] }, { $add: ['$count', 1] }, 1] },
              resetAt: { $cond: [{ $gt: ['$resetAt', now] }, '$resetAt', newReset] }
            }
          }
        ],
        { upsert: true, new: true }
      ).lean();

    let doc;
    try {
      doc = await run();
    } catch (error) {
      // Two first requests for a new key can race to create it; the loser simply retries
      if (error?.code !== 11000) throw error;
      doc = await run();
    }

    return { totalHits: doc.count, resetTime: doc.resetAt };
  }

  async decrement(key) {
    await RateLimit.updateOne({ key: this.storageKey(key), count: { $gt: 0 } }, { $inc: { count: -1 } });
  }

  async resetKey(key) {
    await RateLimit.deleteOne({ key: this.storageKey(key) });
  }
}
