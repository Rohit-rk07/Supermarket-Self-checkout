import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { LOW_STOCK_LEVEL } from './orderController.js';
import logger from '../utils/logger.js';

const MAX_DAYS = 366;
const round2 = (value) => Math.round(value * 100) / 100;

// Admin: sales report for a period.
//   ?from=<ISO instant, start of the first day>&to=<ISO instant, start of the day AFTER the last day>
//   &tz=+05:30   (the viewer's offset, so days are cut at the shop's midnight, not the server's)
// Money counts when the order was paid. Refunds count on the day the refund was made.
export const getSalesReport = async (req, res) => {
  try {
    const from = new Date(String(req.query.from || ''));
    const to = new Date(String(req.query.to || ''));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return res.status(400).json({ success: false, message: 'Choose a start day and an end day' });
    }
    if ((to - from) / 86400000 > MAX_DAYS) {
      return res.status(400).json({ success: false, message: `Choose a period of at most ${MAX_DAYS} days` });
    }
    const tz = /^[+-]\d{2}:\d{2}$/.test(String(req.query.tz || '')) ? String(req.query.tz) : '+00:00';

    const soldMatch = { paymentStatus: { $in: ['paid', 'refunded'] }, paidAt: { $gte: from, $lt: to } };

    const [byDay, topProducts, refundLinesByDay, legacyRefundsByDay, lowStock] = await Promise.all([
      Order.aggregate([
        { $match: soldMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: tz } },
            orders: { $sum: 1 },
            sales: { $sum: '$total' },
            tax: { $sum: { $add: [{ $ifNull: ['$tax', 0] }, { $ifNull: ['$taxIncluded', 0] }] } }
          }
        }
      ]),
      Order.aggregate([
        { $match: soldMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.barcode',
            name: { $last: '$items.name' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' }
          }
        },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 10 }
      ]),
      Order.aggregate([
        { $match: { 'refundLines.at': { $gte: from, $lt: to } } },
        { $unwind: '$refundLines' },
        { $match: { 'refundLines.at': { $gte: from, $lt: to } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$refundLines.at', timezone: tz } }, refund: '$refundLines.refundId' },
            amount: { $sum: '$refundLines.amount' }
          }
        },
        { $group: { _id: '$_id.day', refunds: { $sum: 1 }, amount: { $sum: '$amount' } } }
      ]),
      // Full refunds made before partial refunds existed carry no refund lines
      Order.aggregate([
        { $match: { paymentStatus: 'refunded', refundedAt: { $gte: from, $lt: to }, 'refundLines.0': { $exists: false } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$refundedAt', timezone: tz } },
            refunds: { $sum: 1 },
            amount: { $sum: '$total' }
          }
        }
      ]),
      Product.find({ isActive: true, trackStock: true, stock: { $lte: LOW_STOCK_LEVEL } })
        .select('barcode name stock')
        .sort({ stock: 1, name: 1 })
        .limit(50)
        .lean()
    ]);

    // One row per day in the period, including days with no sales
    const days = new Map();
    const ensure = (key) => {
      if (!days.has(key)) days.set(key, { date: key, orders: 0, sales: 0, tax: 0, refunds: 0, refunded: 0 });
      return days.get(key);
    };
    // Walk the days using the viewer's offset so the labels match their calendar
    const offsetMinutes = (tz[0] === '-' ? -1 : 1) * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(4, 6), 10));
    for (let t = from.getTime(); t < to.getTime(); t += 86400000) {
      ensure(new Date(t + offsetMinutes * 60000).toISOString().slice(0, 10));
    }
    for (const row of byDay) Object.assign(ensure(row._id), { orders: row.orders, sales: round2(row.sales), tax: round2(row.tax) });
    for (const row of [...refundLinesByDay, ...legacyRefundsByDay]) {
      const day = ensure(row._id);
      day.refunds += row.refunds;
      day.refunded = round2(day.refunded + row.amount);
    }

    const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const sum = (key) => round2(rows.reduce((total, row) => total + row[key], 0));
    const orders = rows.reduce((total, row) => total + row.orders, 0);
    const sales = sum('sales');
    const refunded = sum('refunded');

    res.json({
      success: true,
      data: {
        from,
        to,
        summary: {
          orders,
          sales,
          refunds: rows.reduce((total, row) => total + row.refunds, 0),
          refunded,
          net: round2(sales - refunded),
          tax: sum('tax'),
          averageBasket: orders > 0 ? round2(sales / orders) : 0
        },
        byDay: rows,
        topProducts: topProducts.map((row) => ({ barcode: row._id, name: row.name, quantity: row.quantity, revenue: round2(row.revenue) })),
        lowStock
      }
    });
  } catch (error) {
    logger.error('Sales report error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to build the report' });
  }
};
