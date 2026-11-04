import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, Order, Product
} from '../test-support/setup.js';

const AuditLog = (await import('../app/models/AuditLog.js')).default;

const MINUTES = 60 * 1000;
const payOrder = (token, order, paymentId = 'pay_test1') =>
  api('POST', '/api/v1/payments/verify-payment', {
    token,
    body: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: paymentSignature(order.razorpayOrderId, paymentId)
    }
  });

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  await AuditLog.deleteMany({});
});

describe('holding stock while a shopper is paying', () => {
  const order1 = (user, product, quantity) =>
    api('POST', '/api/v1/orders', { token: user.token, body: { items: [{ barcode: product.barcode, quantity }] } });

  test('the last unit is held for the first shopper; the second is told so', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 1, name: 'Last Biscuit' });

    assert.equal((await order1(a, product, 1)).status, 201);
    const second = await order1(b, product, 1);
    assert.equal(second.status, 409);
    assert.match(second.body.message, /being paid for by other shoppers/);
  });

  test('only the part that is not held is on offer', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 5 });
    await order1(a, product, 3);
    const tooMany = await order1(b, product, 3);
    assert.equal(tooMany.status, 409);
    assert.match(tooMany.body.message, /Only 2/);
    assert.equal((await order1(b, product, 2)).status, 201);
  });

  test('the hold lets go after 30 minutes, or when the order is cancelled', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 1 });
    const held = await order1(a, product, 1);
    assert.equal((await order1(b, product, 1)).status, 409);

    await Order.collection.updateOne({ _id: new (await import('mongoose')).default.Types.ObjectId(held.body.data._id) }, { $set: { createdAt: new Date(Date.now() - 31 * MINUTES) } });
    const afterExpiry = await order1(b, product, 1);
    assert.equal(afterExpiry.status, 201);

    // Cancelling frees it again
    await api('PUT', `/api/v1/orders/${afterExpiry.body.data._id}/cancel`, { token: b.token });
    assert.equal((await order1(a, product, 1)).status, 201);
  });

  test("a shopper's own earlier unpaid order does not block their new checkout", async () => {
    const a = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 1 });
    assert.equal((await order1(a, product, 1)).status, 201);
    assert.equal((await order1(a, product, 1)).status, 201);
  });

  test('a paid order stops holding and the stock itself falls', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 2 });
    const placed = await placeOrder(a.token, [{ barcode: product.barcode, quantity: 2 }]);
    assert.equal((await order1(b, product, 1)).status, 409);
    await payOrder(a.token, placed);
    assert.equal((await Product.findById(product._id)).stock, 0);
    assert.match((await order1(b, product, 1)).body.message, /out of stock/);
  });

  test('the same barcode on two lines cannot slip past the limit', async () => {
    const a = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 3 });
    const res = await api('POST', '/api/v1/orders', {
      token: a.token,
      body: { items: [{ barcode: product.barcode, quantity: 2 }, { barcode: product.barcode, quantity: 2 }] }
    });
    assert.equal(res.status, 409);
  });

  test('untracked products are never held', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ stock: 0 });
    assert.equal((await order1(a, product, 5)).status, 201);
    assert.equal((await order1(b, product, 5)).status, 201);
  });
});

describe('the activity log', () => {
  const entries = async (token) => (await api('GET', '/api/v1/audit', { token })).body.data.entries;

  test('role changes, deactivations, product edits and the bag-check setting are recorded', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    const product = await makeProduct({ price: 100 });

    await api('PUT', `/api/v1/users/${staff.user._id}/role`, { token: admin.token, body: { role: 'customer' } });
    await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: false } });
    await api('PUT', `/api/v1/products/${product.barcode}`, { token: admin.token, body: { barcode: product.barcode, name: product.name, price: 120 } });
    await api('PUT', '/api/v1/orders/settings/bag-check', { token: admin.token, body: { percent: 25 } });

    const log = await entries(admin.token);
    const actions = log.map((entry) => entry.action);
    for (const expected of ['user.role', 'user.deactivate', 'product.price', 'setting.bagcheck']) {
      assert.ok(actions.includes(expected), `${expected} missing from ${actions.join(',')}`);
    }
    const price = log.find((entry) => entry.action === 'product.price');
    assert.match(price.summary, /price 100 to 120/);
    assert.match(price.actorName, /TEST admin/);
    assert.match(log.find((entry) => entry.action === 'setting.bagcheck').summary, /from 10% to 25%/);
  });

  test('an order moved by an admin is recorded', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await api('PUT', `/api/v1/orders/${order._id}/status`, { token: admin.token, body: { status: 'cancelled' } });
    const log = await entries(admin.token);
    assert.match(log.find((entry) => entry.action === 'order.status').summary, /moved from pending to cancelled/);
  });

  test('only admins can read it, newest first, and it can be narrowed to one group', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    const customer = await makeUser();
    const product = await makeProduct();
    await api('PUT', `/api/v1/users/${customer.user._id}/role`, { token: admin.token, body: { role: 'staff' } });
    await api('PUT', `/api/v1/products/${product.barcode}`, { token: admin.token, body: { barcode: product.barcode, name: product.name, price: 55 } });

    assert.equal((await api('GET', '/api/v1/audit', { token: staff.token })).status, 403);
    assert.equal((await api('GET', '/api/v1/audit', { token: customer.token })).status, 403);
    assert.equal((await api('GET', '/api/v1/audit')).status, 401);

    const all = await entries(admin.token);
    assert.equal(all[0].action, 'product.price');
    const onlyUsers = (await api('GET', '/api/v1/audit?group=user', { token: admin.token })).body.data.entries;
    assert.ok(onlyUsers.length > 0 && onlyUsers.every((entry) => entry.action.startsWith('user.')));
  });

  test('the person is kept as text, so the line survives their account being changed', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    await api('PUT', `/api/v1/users/${customer.user._id}/role`, { token: admin.token, body: { role: 'staff' } });
    await admin.user.constructor.deleteOne({ _id: admin.user._id });
    const direct = await AuditLog.findOne({ action: 'user.role' }).lean();
    assert.match(direct.actorName, /TEST admin/);
  });
});
