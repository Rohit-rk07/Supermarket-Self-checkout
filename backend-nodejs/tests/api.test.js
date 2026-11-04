import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, webhookSignature, setRazorpayClientFactory, Order, Product, Setting
} from '../test-support/setup.js';

const MINUTES = 60 * 1000;

// Pretend an order was created `minutes` ago (timestamps are set by Mongoose, so write around it)
const makeOrderOld = (order, minutes) =>
  Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date(Date.now() - minutes * MINUTES) } });

const payOrder = (token, order, paymentId = 'pay_test1') =>
  api('POST', '/api/v1/payments/verify-payment', {
    token,
    body: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: paymentSignature(order.razorpayOrderId, paymentId)
    }
  });

const stockOf = async (product) => (await Product.findById(product._id)).stock;

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  setRazorpayClientFactory(() => { throw new Error('This test did not expect a call to Razorpay'); });
});

describe('placing an order', () => {
  test('prices come from the database, and the total includes tax correctly', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ price: 100, gstRate: 5, taxInclusive: true });
    const res = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: product.barcode, quantity: 3 }] } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.total, 300);
    assert.equal(res.body.data.taxIncluded, 14.29);
    assert.equal(res.body.data.tax, 0);
  });

  test('a price sent by the client is rejected, so nobody can name their own price', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const res = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: product.barcode, quantity: 1, price: 1 }] } });
    assert.equal(res.status, 400);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('an unknown barcode gives 404', async () => {
    const { token } = await makeUser();
    const res = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: '12345678', quantity: 1 }] } });
    assert.equal(res.status, 404);
  });

  test('a tracked product cannot be ordered beyond its stock', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 2 });
    const tooMany = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: product.barcode, quantity: 3 }] } });
    assert.equal(tooMany.status, 409);
    assert.match(tooMany.body.message, /Only 2/);

    await Product.updateOne({ _id: product._id }, { stock: 0 });
    const none = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: product.barcode, quantity: 1 }] } });
    assert.equal(none.status, 409);
    assert.match(none.body.message, /out of stock/);
  });

  test('an untracked product sells without a stock limit', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ stock: 0 });
    const res = await api('POST', '/api/v1/orders', { token, body: { items: [{ barcode: product.barcode, quantity: 5 }] } });
    assert.equal(res.status, 201);
  });

  test('no token gives 401', async () => {
    const res = await api('POST', '/api/v1/orders', { body: { items: [{ barcode: '12345678', quantity: 1 }] } });
    assert.equal(res.status, 401);
  });
});

describe('creating the Razorpay order', () => {
  test('the amount comes from the saved order, never from the client', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ price: 250 });
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 2 }]);

    let sent;
    setRazorpayClientFactory(() => ({
      orders: { create: async (args) => { sent = args; return { id: 'order_fake1', amount: args.amount, currency: args.currency }; } }
    }));

    const res = await api('POST', '/api/v1/payments/create-order', { token, body: { orderId: String(order._id) } });
    assert.equal(res.status, 200);
    assert.equal(sent.amount, 50000);
    assert.equal(res.body.amount, 500);
    assert.equal((await Order.findById(order._id)).razorpayOrderId, 'order_fake1');
  });

  test("another shopper's order is not found", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(owner.token, [{ barcode: product.barcode, quantity: 1 }]);
    const res = await api('POST', '/api/v1/payments/create-order', { token: other.token, body: { orderId: String(order._id) } });
    assert.equal(res.status, 404);
  });

  test('an order older than 30 minutes is refused with a clear message and marked expired', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    await makeOrderOld(order, 31);

    const res = await api('POST', '/api/v1/payments/create-order', { token, body: { orderId: String(order._id) } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /expired/i);
    assert.equal((await Order.findById(order._id)).status, 'expired');
  });

  test('a paid order cannot be paid again', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(token, order);
    const res = await api('POST', '/api/v1/payments/create-order', { token, body: { orderId: String(order._id) } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /already paid/i);
  });
});

describe('verifying a payment and stock', () => {
  test('a wrong signature is refused and the order stays unpaid', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 10 });
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 2 }]);

    const res = await api('POST', '/api/v1/payments/verify-payment', {
      token,
      body: { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'f'.repeat(64) }
    });
    assert.equal(res.status, 400);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
    assert.equal(await stockOf(product), 10);
  });

  test('a good signature marks the order paid and stock falls once, even if verified twice', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 10 });
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 2 }]);

    const first = await payOrder(token, order);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.paymentStatus, 'paid');
    assert.equal(await stockOf(product), 8);

    const second = await payOrder(token, order);
    assert.equal(second.status, 200);
    assert.equal(await stockOf(product), 8);
  });

  test("a shopper cannot confirm payment on someone else's order", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(owner.token, [{ barcode: product.barcode, quantity: 1 }]);
    const res = await payOrder(other.token, order);
    assert.equal(res.status, 404);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
  });

  test('untracked products keep their stock number', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ stock: 7 });
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 2 }]);
    await payOrder(token, order);
    assert.equal(await stockOf(product), 7);
  });

  test('stock never goes below zero even when two shoppers end up paying for the last unit', async () => {
    // While one shopper is paying, the last unit is held, so a second order is refused (see the stock-hold tests).
    // The two-payers case can still happen when the first order's 30-minute hold has run out but it is paid late.
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 1 });
    const orderA = await placeOrder(a.token, [{ barcode: product.barcode, quantity: 1 }]);
    await makeOrderOld(orderA, 31);
    const orderB = await placeOrder(b.token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(a.token, orderA, 'pay_a');
    await payOrder(b.token, orderB, 'pay_b');
    assert.equal(await stockOf(product), 0);
  });

  test('a late payment still wins on an expired order', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    await Order.updateOne({ _id: order._id }, { status: 'expired' });
    const res = await payOrder(token, order);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.paymentStatus, 'paid');
    assert.equal(res.body.data.status, 'completed');
  });
});

describe('the webhook', () => {
  const send = (payload, signature) => {
    const rawBody = JSON.stringify(payload);
    return api('POST', '/api/v1/payments/webhook', {
      rawBody,
      headers: signature === undefined ? {} : { 'x-razorpay-signature': signature === 'valid' ? webhookSignature(rawBody) : signature }
    });
  };
  const captured = (razorpayOrderId, paymentId = 'pay_hook1') => ({
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId } } }
  });

  test('no signature and a wrong signature are both refused', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    assert.equal((await send(captured(order.razorpayOrderId))).status, 400);
    assert.equal((await send(captured(order.razorpayOrderId), 'a'.repeat(64))).status, 400);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
    assert.equal(await Setting.countDocuments({ key: 'lastWebhookAt' }), 0);
  });

  test('a signed payment.captured marks the order paid, and stock falls only once with verify too', async () => {
    const { token } = await makeUser();
    const product = await makeProduct({ trackStock: true, stock: 5 });
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 2 }]);

    assert.equal((await send(captured(order.razorpayOrderId), 'valid')).status, 200);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'paid');
    assert.equal(await stockOf(product), 3);

    // The shopper's browser finishes afterwards, and Razorpay retries: still only one deduction
    await payOrder(token, order);
    await send(captured(order.razorpayOrderId), 'valid');
    assert.equal(await stockOf(product), 3);
  });

  test('a valid webhook records when it last arrived, and the dashboard shows it', async () => {
    const admin = await makeUser('admin');
    const before = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.equal(before.body.data.payments.webhookConfigured, true);
    assert.equal(before.body.data.payments.lastWebhookAt, null);

    await send({ event: 'something.else', payload: {} }, 'valid');
    const after = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.ok(after.body.data.payments.lastWebhookAt);
  });

  test('payment.failed marks an unpaid order failed but never changes a paid one', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const unpaid = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    const paid = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(token, paid);

    const failed = (id) => ({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f', order_id: id } } } });
    await send(failed(unpaid.razorpayOrderId), 'valid');
    await send(failed(paid.razorpayOrderId), 'valid');

    assert.equal((await Order.findById(unpaid._id)).paymentStatus, 'failed');
    assert.equal((await Order.findById(paid._id)).paymentStatus, 'paid');
  });
});

describe('roles', () => {
  test('staff and admin screens refuse a shopper (403) and a visitor (401)', async () => {
    const customer = await makeUser('customer');
    for (const path of ['/api/v1/orders/all', '/api/v1/orders/stats', '/api/v1/orders/verify/ORD-X']) {
      assert.equal((await api('GET', path, { token: customer.token })).status, 403, path);
      assert.equal((await api('GET', path)).status, 401, path);
    }
  });

  test('staff can list all orders; a shopper only sees their own', async () => {
    const staff = await makeUser('staff');
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct();
    await placeOrder(a.token, [{ barcode: product.barcode, quantity: 1 }]);
    await placeOrder(b.token, [{ barcode: product.barcode, quantity: 1 }]);

    assert.equal((await api('GET', '/api/v1/orders/all', { token: staff.token })).body.data.orders.length, 2);
    assert.equal((await api('GET', '/api/v1/orders/my-orders', { token: a.token })).body.data.orders.length, 1);
  });

  test('a shopper cannot read someone elses order by id', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(a.token, [{ barcode: product.barcode, quantity: 1 }]);
    assert.equal((await api('GET', `/api/v1/orders/${order._id}`, { token: b.token })).status, 404);
    assert.equal((await api('GET', `/api/v1/orders/${order._id}`, { token: a.token })).status, 200);
  });

  test('a deactivated user is locked out', async () => {
    const { user, token } = await makeUser();
    await user.constructor.updateOne({ _id: user._id }, { isActive: false });
    assert.equal((await api('GET', '/api/v1/orders/my-orders', { token })).status, 401);
  });
});

describe('the admin-only status route', () => {
  test('only an admin may use it', async () => {
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    const url = `/api/v1/orders/${order._id}/status`;

    assert.equal((await api('PUT', url, { token: customer.token, body: { status: 'cancelled' } })).status, 403);
    assert.equal((await api('PUT', url, { token: staff.token, body: { status: 'cancelled' } })).status, 403);
    assert.equal((await api('PUT', url, { body: { status: 'cancelled' } })).status, 401);
  });

  test('an admin can move an unpaid order, but cannot set a payment status or a made-up status', async () => {
    const customer = await makeUser();
    const admin = await makeUser('admin');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    const url = `/api/v1/orders/${order._id}/status`;

    assert.equal((await api('PUT', url, { token: admin.token, body: { status: 'processing' } })).status, 200);
    assert.equal((await api('PUT', url, { token: admin.token, body: { status: 'processing', paymentStatus: 'paid' } })).status, 400);
    assert.equal((await api('PUT', url, { token: admin.token, body: { status: 'completed' } })).status, 400);
    assert.equal((await api('PUT', url, { token: admin.token, body: { paymentStatus: 'paid' } })).status, 400);

    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'pending');
    assert.equal(saved.status, 'processing');
  });

  test('a paid order cannot be changed', async () => {
    const customer = await makeUser();
    const admin = await makeUser('admin');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(customer.token, order);

    const res = await api('PUT', `/api/v1/orders/${order._id}/status`, { token: admin.token, body: { status: 'cancelled' } });
    assert.equal(res.status, 400);
    assert.equal((await Order.findById(order._id)).status, 'completed');
  });

  test('a shopper cannot cancel a paid order', async () => {
    const { token } = await makeUser();
    const product = await makeProduct();
    const order = await placeOrder(token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(token, order);
    assert.equal((await api('PUT', `/api/v1/orders/${order._id}/cancel`, { token })).status, 400);
  });
});

describe('exit verification', () => {
  const setup = async () => {
    // These tests are about the receipt rules, so switch the random bag check off (it has its own tests)
    await Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value: 0 } }, { upsert: true });
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    return { customer, staff, order };
  };

  test('an unpaid receipt says NOT_PAID and exit is refused', async () => {
    const { staff, order } = await setup();
    const check = await api('GET', `/api/v1/orders/verify/${order.orderNumber}`, { token: staff.token });
    assert.equal(check.body.result, 'NOT_PAID');
    const exit = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token });
    assert.equal(exit.status, 400);
    assert.equal(exit.body.result, 'NOT_PAID');
  });

  test('a paid receipt works once: the second use is ALREADY_EXITED', async () => {
    const { customer, staff, order } = await setup();
    await payOrder(customer.token, order);
    const url = `/api/v1/orders/verify/${order.orderNumber}`;

    assert.equal((await api('GET', url, { token: staff.token })).body.result, 'PAID');
    assert.equal((await api('POST', `${url}/exit`, { token: staff.token })).status, 200);

    const again = await api('POST', `${url}/exit`, { token: staff.token });
    assert.equal(again.status, 409);
    assert.equal(again.body.result, 'ALREADY_EXITED');
    assert.equal((await api('GET', url, { token: staff.token })).body.result, 'ALREADY_EXITED');
  });

  test('two staff pressing Confirm at the same moment let only one through', async () => {
    const { customer, staff, order } = await setup();
    await payOrder(customer.token, order);
    const url = `/api/v1/orders/verify/${order.orderNumber}/exit`;
    const results = await Promise.all([1, 2, 3, 4].map(() => api('POST', url, { token: staff.token })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  });

  test('an unknown receipt is NOT_FOUND, and a shopper cannot confirm an exit', async () => {
    const { customer, staff } = await setup();
    assert.equal((await api('GET', '/api/v1/orders/verify/ORD-NOPE', { token: staff.token })).status, 404);
    assert.equal((await api('POST', '/api/v1/orders/verify/ORD-NOPE/exit', { token: customer.token })).status, 403);
  });
});

describe('order expiry', () => {
  test('an unpaid order older than 30 minutes becomes Expired and leaves the Unpaid count', async () => {
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    const old = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    const fresh = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await makeOrderOld(old, 31);
    await makeOrderOld(fresh, 5);

    const stats = await api('GET', '/api/v1/orders/stats', { token: staff.token });
    assert.equal(stats.body.data.stats.pendingOrders, 1);
    assert.equal(stats.body.data.stats.expiredOrders, 1);
    assert.equal((await Order.findById(old._id)).status, 'expired');
    assert.equal((await Order.findById(fresh._id)).status, 'pending');
  });

  test('a paid order is never expired, however old', async () => {
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await payOrder(customer.token, order);
    await makeOrderOld(order, 600);

    await api('GET', '/api/v1/orders/all', { token: staff.token });
    const saved = await Order.findById(order._id);
    assert.equal(saved.status, 'completed');
    assert.equal(saved.paymentStatus, 'paid');
  });

  test('the Expired filter lists only expired orders, and the shopper sees it as expired too', async () => {
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    const old = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await makeOrderOld(old, 45);

    const list = await api('GET', '/api/v1/orders/all?status=expired', { token: staff.token });
    assert.equal(list.body.data.orders.length, 1);
    const mine = await api('GET', '/api/v1/orders/my-orders?status=expired', { token: customer.token });
    assert.equal(mine.body.data.orders.length, 1);
  });
});

describe('re-checking a payment with Razorpay (staff Check payment)', () => {
  const fakePayments = (items) => setRazorpayClientFactory(() => ({ orders: { fetchPayments: async () => ({ items }) } }));
  const setup = async (fields = {}) => {
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct({ price: 100, gstRate: 5, taxInclusive: true, trackStock: true, stock: 10, ...fields });
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 2 }]);
    return { customer, staff, product, order };
  };
  const reconcile = (staff, order) => api('POST', `/api/v1/orders/${order._id}/reconcile`, { token: staff.token });

  test('a captured payment of exactly the order amount marks it paid and lowers stock once', async () => {
    const { staff, product, order } = await setup();
    fakePayments([{ id: 'pay_real', status: 'captured', amount: 20000 }]);

    const res = await reconcile(staff, order);
    assert.equal(res.body.result, 'MARKED_PAID');
    assert.equal((await Order.findById(order._id)).paymentStatus, 'paid');
    assert.equal(await stockOf(product), 8);

    const again = await reconcile(staff, order);
    assert.equal(again.body.result, 'ALREADY_PAID');
    assert.equal(await stockOf(product), 8);
  });

  test('a payment of the wrong amount does not count', async () => {
    const { staff, order } = await setup();
    fakePayments([{ id: 'pay_short', status: 'captured', amount: 19999 }]);
    assert.equal((await reconcile(staff, order)).body.result, 'NOT_PAID');
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
  });

  test('a payment that is only authorized, failed or created does not count', async () => {
    const { staff, order } = await setup();
    fakePayments([
      { id: 'pay_1', status: 'authorized', amount: 20000 },
      { id: 'pay_2', status: 'failed', amount: 20000 },
      { id: 'pay_3', status: 'created', amount: 20000 }
    ]);
    assert.equal((await reconcile(staff, order)).body.result, 'NOT_PAID');
  });

  test('an order with no payment started is refused', async () => {
    const { staff, order } = await setup();
    await Order.updateOne({ _id: order._id }, { $unset: { razorpayOrderId: 1 } });
    assert.equal((await reconcile(staff, order)).status, 400);
  });

  test('if Razorpay cannot be reached the answer is 502 and nothing changes', async () => {
    const { staff, order } = await setup();
    setRazorpayClientFactory(() => ({ orders: { fetchPayments: async () => { throw new Error('network down'); } } }));
    assert.equal((await reconcile(staff, order)).status, 502);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'pending');
  });

  test('a late captured payment rescues an expired order', async () => {
    const { staff, order } = await setup();
    await makeOrderOld(order, 90);
    await Order.updateOne({ _id: order._id }, { status: 'expired' });
    fakePayments([{ id: 'pay_late', status: 'captured', amount: 20000 }]);
    assert.equal((await reconcile(staff, order)).body.result, 'MARKED_PAID');
    assert.equal((await Order.findById(order._id)).status, 'completed');
  });

  test('a shopper cannot use Check payment', async () => {
    const { customer, order } = await setup();
    assert.equal((await reconcile(customer, order)).status, 403);
  });
});
