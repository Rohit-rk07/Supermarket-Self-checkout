import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, setRazorpayClientFactory, Order
} from '../test-support/setup.js';

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  setRazorpayClientFactory(() => { throw new Error('This test did not expect a call to Razorpay'); });
});

const payOrder = (token, order, paymentId) =>
  api('POST', '/api/v1/payments/verify-payment', {
    token,
    body: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: paymentSignature(order.razorpayOrderId, paymentId)
    }
  });

const DAY = 86400000;
const window = (days = 1) => {
  const to = new Date(Date.now() + DAY / 2); // a little in the future, so "now" is inside
  const from = new Date(to.getTime() - days * DAY);
  return `from=${from.toISOString()}&to=${to.toISOString()}&tz=%2B00:00`;
};

describe('sales report (item 19)', () => {
  test('adds up paid orders, top products and low stock; refunds come off the net', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const a = await makeProduct({ price: 100, trackStock: true, stock: 6 });
    const b = await makeProduct({ price: 40 });

    const first = await placeOrder(customer.token, [{ barcode: a.barcode, quantity: 3 }, { barcode: b.barcode, quantity: 1 }]);
    await payOrder(customer.token, first, 'pay_r1');
    const second = await placeOrder(customer.token, [{ barcode: a.barcode, quantity: 1 }]);
    await payOrder(customer.token, second, 'pay_r2');
    await placeOrder(customer.token, [{ barcode: b.barcode, quantity: 5 }]); // never paid: must not count

    setRazorpayClientFactory(() => ({ payments: { refund: async () => ({ id: 'rfnd_a' }) } }));
    const refunded = await Order.findById(first._id);
    await api('POST', `/api/v1/orders/${refunded._id}/refund`, { token: admin.token, body: { items: [{ barcode: b.barcode, quantity: 1 }] } });

    const res = await api('GET', `/api/v1/orders/reports/sales?${window(3)}`, { token: admin.token });
    assert.equal(res.status, 200);
    const { summary, byDay, topProducts, lowStock } = res.body.data;

    assert.equal(summary.orders, 2);
    assert.equal(summary.sales, 440); // 340 + 100, GST included in the shelf prices
    assert.equal(summary.refunds, 1);
    assert.equal(summary.refunded, 40);
    assert.equal(summary.net, 400);
    assert.equal(summary.averageBasket, 220);
    assert.equal(byDay.length >= 3, true);
    assert.equal(byDay.reduce((sum, day) => sum + day.sales, 0), 440);

    assert.equal(topProducts[0].barcode, a.barcode);
    assert.equal(topProducts[0].quantity, 4);
    assert.equal(topProducts[0].revenue, 400);
    assert.deepEqual(lowStock.map((p) => p.barcode), [a.barcode]); // 6 - 3 - 1 = 2 left
  });

  test('only admins can read it, and the period must make sense', async () => {
    const staff = await makeUser('staff');
    const admin = await makeUser('admin');
    assert.equal((await api('GET', `/api/v1/orders/reports/sales?${window()}`, { token: staff.token })).status, 403);
    assert.equal((await api('GET', '/api/v1/orders/reports/sales', { token: admin.token })).status, 400);
    const from = new Date('2026-01-01').toISOString();
    const to = new Date('2028-01-01').toISOString();
    assert.equal((await api('GET', `/api/v1/orders/reports/sales?from=${from}&to=${to}`, { token: admin.token })).status, 400);
  });

  test('a quiet period returns zeros and an empty list, not an error', async () => {
    const admin = await makeUser('admin');
    const res = await api('GET', `/api/v1/orders/reports/sales?${window(2)}`, { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.summary.sales, 0);
    assert.equal(res.body.data.summary.averageBasket, 0);
    assert.deepEqual(res.body.data.topProducts, []);
  });
});
