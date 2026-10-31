import Order from '../models/Order.js';

// An order that has not been paid within this many minutes is marked expired
export const PENDING_ORDER_MINUTES = 30;

// Runs whenever someone looks at orders, so it works on a normal server and on serverless alike.
// A payment that arrives late still wins: marking an order paid does not care that it expired.
export const expireStaleOrders = async () => {
  const cutoff = new Date(Date.now() - PENDING_ORDER_MINUTES * 60 * 1000);

  try {
    await Order.updateMany(
      { paymentStatus: 'pending', status: 'pending', createdAt: { $lt: cutoff } },
      { $set: { status: 'expired' } }
    );
  } catch (error) {
    // Looking at orders must never fail because of housekeeping
    console.error('Could not expire stale orders:', error.message);
  }
};
