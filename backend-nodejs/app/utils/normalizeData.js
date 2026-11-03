// One-off data tidy-up (task 5.5). Safe to run more than once.
//
//   npm run normalize-data            shows what would change, changes nothing
//   npm run normalize-data -- --apply makes the changes
//
// 1. An order's userId should be a real ObjectId for real shoppers. Any saved as a text string that
//    looks like an ObjectId is converted. (Demo shoppers keep their "demo-..." text ids on purpose.)
// 2. The unused delivery fields (deliveryAddress, estimatedDelivery, actualDelivery) are removed.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const DELIVERY_FIELDS = ['deliveryAddress', 'estimatedDelivery', 'actualDelivery'];

export const normalizeData = async (db, { apply = false } = {}) => {
  const orders = db.collection('orders');

  const stringIds = await orders
    .find({ userId: { $type: 'string', $regex: /^[0-9a-fA-F]{24}$/ } }, { projection: { userId: 1 } })
    .toArray();
  const demoOrders = await orders.countDocuments({ userId: { $type: 'string', $regex: /^demo-/ } });
  const withDelivery = await orders.countDocuments({ $or: DELIVERY_FIELDS.map((field) => ({ [field]: { $exists: true } })) });

  if (apply) {
    for (const order of stringIds) {
      await orders.updateOne({ _id: order._id }, { $set: { userId: new mongoose.Types.ObjectId(order.userId) } });
    }
    if (withDelivery > 0) {
      await orders.updateMany(
        {},
        { $unset: Object.fromEntries(DELIVERY_FIELDS.map((field) => [field, ''])) }
      );
    }
  }

  return { applied: apply, userIdsToConvert: stringIds.length, demoOrdersLeftAlone: demoOrders, ordersWithDeliveryFields: withDelivery };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'supermarket-checkout' });
  const result = await normalizeData(mongoose.connection.db, { apply });
  console.log(apply ? 'Changes made:' : 'Dry run, nothing changed. Run again with --apply to make these changes:');
  console.log(result);
  await mongoose.disconnect();
}
