import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, setRazorpayClientFactory, Order, Setting
} from '../test-support/setup.js';

const AuditLog = (await import('../app/models/AuditLog.js')).default;

const payOrder = (token, order, paymentId = 'pay_test1') =>
  api('POST', '/api/v1/payments/verify-payment', {
    token,
    body: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: paymentSignature(order.razorpayOrderId, paymentId)
    }
  });

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  await AuditLog.deleteMany({});
  await Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value: 0 } }, { upsert: true });
});

describe("today's numbers for the home pages", () => {
  const today = async (token) =>
    (await api('GET', `/api/v1/orders/stats?since=${encodeURIComponent(startOfToday())}`, { token })).body.data.today;

  test('sales, paid orders, awaiting exit and exited are counted for today', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    const customer = await makeUser();
    const product = await makeProduct({ price: 100, gstRate: 5, taxInclusive: true });

    const first = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 2 }]);
    const second = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]); // never paid
    await payOrder(customer.token, first, 'pay_1');
    await payOrder(customer.token, second, 'pay_2');
    await api('POST', `/api/v1/orders/verify/${first.orderNumber}/exit`, { token: staff.token });

    const numbers = await today(admin.token);
    assert.equal(numbers.sales, 300);
    assert.equal(numbers.paidOrders, 2);
    assert.equal(numbers.awaitingExit, 1);
    assert.equal(numbers.exited, 1);
    assert.equal(numbers.refunds, 0);
  });

  test('an order paid yesterday is not in todays sales but still awaits exit', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(customer.token, order);
    await Order.collection.updateOne({ _id: order._id }, { $set: { paidAt: new Date(Date.now() - 26 * 60 * 60 * 1000) } });

    const numbers = await today(admin.token);
    assert.equal(numbers.sales, 0);
    assert.equal(numbers.paidOrders, 0);
    assert.equal(numbers.awaitingExit, 1);
  });

  test('low stock counts only tracked, active products at or below 5', async () => {
    const admin = await makeUser('admin');
    await makeProduct({ trackStock: true, stock: 5 });
    await makeProduct({ trackStock: true, stock: 0 });
    await makeProduct({ trackStock: true, stock: 6 });
    await makeProduct({ stock: 1 }); // not tracked
    await makeProduct({ trackStock: true, stock: 2, isActive: false });
    assert.equal((await today(admin.token)).lowStock, 2);
  });

  test('a refund shows up in todays refunds and in the activity log', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const product = await makeProduct({ price: 100, gstRate: 5, taxInclusive: true });
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(customer.token, order);
    setRazorpayClientFactory(() => ({ payments: { refund: async () => ({ id: 'rfnd_1' }) } }));

    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: { reason: 'Damaged' } });

    const numbers = await today(admin.token);
    assert.equal(numbers.refunds, 1);
    assert.equal(numbers.refundedAmount, 100);
    const log = (await api('GET', '/api/v1/audit?group=order', { token: admin.token })).body.data.entries;
    assert.match(log[0].summary, /Refunded .*Damaged/);
  });

  test('staff may read the numbers; a shopper may not', async () => {
    const staff = await makeUser('staff');
    const customer = await makeUser();
    assert.equal((await api('GET', '/api/v1/orders/stats', { token: staff.token })).status, 200);
    assert.equal((await api('GET', '/api/v1/orders/stats', { token: customer.token })).status, 403);
  });
});
