import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, webhookSignature, setRazorpayClientFactory, Order, Product, Setting, User
} from '../test-support/setup.js';

const payOrder = (token, order, paymentId = 'pay_test1') =>
  api('POST', '/api/v1/payments/verify-payment', {
    token,
    body: {
      razorpay_order_id: order.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: paymentSignature(order.razorpayOrderId, paymentId)
    }
  });

const setBagPercent = (value) => Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value } }, { upsert: true });
const stockOf = async (product) => (await Product.findById(product._id)).stock;

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  setRazorpayClientFactory(() => { throw new Error('This test did not expect a call to Razorpay'); });
});

// A paid order, a staff member and an admin, ready to use
const paidOrder = async (productFields = {}) => {
  const customer = await makeUser();
  const staff = await makeUser('staff');
  const admin = await makeUser('admin');
  const product = await makeProduct(productFields);
  const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 2 }]);
  await payOrder(customer.token, order);
  return { customer, staff, admin, product, order: await Order.findById(order._id) };
};

describe('bag check (R-10)', () => {
  test('the default is 10 percent, and only an admin can change it', async () => {
    const staff = await makeUser('staff');
    const admin = await makeUser('admin');
    const customer = await makeUser();

    assert.equal((await api('GET', '/api/v1/orders/settings/bag-check', { token: staff.token })).body.data.percent, 10);
    assert.equal((await api('GET', '/api/v1/orders/settings/bag-check', { token: customer.token })).status, 403);

    assert.equal((await api('PUT', '/api/v1/orders/settings/bag-check', { token: staff.token, body: { percent: 50 } })).status, 403);
    assert.equal((await api('PUT', '/api/v1/orders/settings/bag-check', { token: admin.token, body: { percent: 101 } })).status, 400);
    assert.equal((await api('PUT', '/api/v1/orders/settings/bag-check', { token: admin.token, body: { percent: -1 } })).status, 400);
    assert.equal((await api('PUT', '/api/v1/orders/settings/bag-check', { token: admin.token, body: { percent: 50 } })).status, 200);
    assert.equal((await api('GET', '/api/v1/orders/settings/bag-check', { token: staff.token })).body.data.percent, 50);
  });

  test('at 100 percent every paid order is picked, and exit is refused until staff tick the box', async () => {
    await setBagPercent(100);
    const { staff, order } = await paidOrder();
    const url = `/api/v1/orders/verify/${order.orderNumber}`;

    const look = await api('GET', url, { token: staff.token });
    assert.equal(look.body.result, 'PAID');
    assert.equal(look.body.bagCheckRequired, true);

    const untick = await api('POST', `${url}/exit`, { token: staff.token });
    assert.equal(untick.status, 400);
    assert.equal(untick.body.result, 'BAG_CHECK_REQUIRED');
    assert.equal((await api('POST', `${url}/exit`, { token: staff.token, body: { bagChecked: false } })).status, 400);
    assert.equal((await Order.findById(order._id)).exitedAt, undefined);

    const ok = await api('POST', `${url}/exit`, { token: staff.token, body: { bagChecked: true } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.bagChecked, true);
  });

  test('at 0 percent it never appears and exit works without a tick', async () => {
    await setBagPercent(0);
    for (let i = 0; i < 5; i += 1) {
      const { staff, order } = await paidOrder();
      const url = `/api/v1/orders/verify/${order.orderNumber}`;
      assert.equal((await api('GET', url, { token: staff.token })).body.bagCheckRequired, false);
      assert.equal((await api('POST', `${url}/exit`, { token: staff.token })).status, 200);
    }
  });

  test('the decision is made once: changing the setting later, or looking again, does not re-roll it', async () => {
    await setBagPercent(100);
    const { staff, order } = await paidOrder();
    const url = `/api/v1/orders/verify/${order.orderNumber}`;
    assert.equal((await api('GET', url, { token: staff.token })).body.bagCheckRequired, true);

    await setBagPercent(0);
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await api('GET', url, { token: staff.token })).body.bagCheckRequired, true);
    }
  });

  test('skipping the receipt screen does not skip the check', async () => {
    await setBagPercent(100);
    const { staff, order } = await paidOrder();
    const res = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token });
    assert.equal(res.status, 400);
    assert.equal(res.body.result, 'BAG_CHECK_REQUIRED');
  });

  test('about the right share of orders is picked at 50 percent', async () => {
    await setBagPercent(50);
    const customer = await makeUser();
    const staff = await makeUser('staff');
    const product = await makeProduct();
    let picked = 0;
    const total = 60;
    for (let i = 0; i < total; i += 1) {
      const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
      await payOrder(customer.token, order, `pay_${i}`);
      const look = await api('GET', `/api/v1/orders/verify/${order.orderNumber}`, { token: staff.token });
      if (look.body.bagCheckRequired) picked += 1;
    }
    // 60 orders at 50 percent: far from all or none, with a very wide safety margin
    assert.ok(picked > 10 && picked < 50, `picked ${picked} of ${total}`);
  });

  test('the shopper never learns whether their bag was picked', async () => {
    await setBagPercent(100);
    const { customer, staff, order } = await paidOrder();
    await api('GET', `/api/v1/orders/verify/${order.orderNumber}`, { token: staff.token });
    const mine = await api('GET', `/api/v1/orders/${order._id}`, { token: customer.token });
    assert.equal(JSON.stringify(mine.body).includes('bagCheck'), false);
    const list = await api('GET', '/api/v1/orders/my-orders', { token: customer.token });
    assert.equal(JSON.stringify(list.body).includes('bagCheck'), false);
  });
});

describe('exit audit (R-13)', () => {
  test('All Orders shows who confirmed the exit, when, and whether the bag was checked', async () => {
    await setBagPercent(100);
    const { staff, order } = await paidOrder();
    await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token, body: { bagChecked: true } });

    const list = await api('GET', '/api/v1/orders/all', { token: staff.token });
    const row = list.body.data.orders.find((o) => o.orderNumber === order.orderNumber);
    assert.ok(row.exitedAt);
    assert.match(row.exitedByName, /TEST staff/);
    assert.equal(row.bagCheckRequired, true);
    assert.equal(row.bagChecked, true);
  });

  test('an exit with no bag check is recorded as not checked', async () => {
    await setBagPercent(0);
    const { staff, order } = await paidOrder();
    await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token });
    const saved = await Order.findById(order._id);
    assert.equal(saved.bagCheckRequired, false);
    assert.equal(saved.bagChecked, false);
  });

  test('the name stays on the order even after that staff member is deactivated', async () => {
    await setBagPercent(0);
    const { staff, admin, order } = await paidOrder();
    await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token });
    await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: false } });
    assert.match((await Order.findById(order._id)).exitedByName, /TEST staff/);
  });
});

describe('refunds (R-23)', () => {
  const fakeRefund = () => {
    const calls = [];
    setRazorpayClientFactory(() => ({
      payments: { refund: async (paymentId, args) => { calls.push({ paymentId, args }); return { id: 'rfnd_1', status: 'processed' }; } }
    }));
    return calls;
  };

  test('an admin refunds a paid order in full: money goes back, order is Refunded, stock returns', async () => {
    const { admin, product, order } = await paidOrder({ trackStock: true, stock: 10, price: 100 });
    assert.equal(await stockOf(product), 8);
    const calls = fakeRefund();

    const res = await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: { reason: 'Wrong item' } });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].paymentId, 'pay_test1');
    assert.equal(calls[0].args.amount, 20000);

    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'refunded');
    assert.equal(saved.status, 'refunded');
    assert.equal(saved.refundId, 'rfnd_1');
    assert.equal(saved.refundReason, 'Wrong item');
    assert.ok(saved.refundedAt);
    assert.equal(await stockOf(product), 10);
  });

  test('untracked products keep their stock number when refunded', async () => {
    const { admin, product, order } = await paidOrder({ stock: 7 });
    fakeRefund();
    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });
    assert.equal(await stockOf(product), 7);
  });

  test('a second refund is refused and stock is not restored twice', async () => {
    const { admin, product, order } = await paidOrder({ trackStock: true, stock: 10 });
    const calls = fakeRefund();
    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });
    const again = await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });
    assert.equal(again.status, 400);
    assert.equal(calls.length, 1);
    assert.equal(await stockOf(product), 10);
  });

  test('two admins pressing Refund at once make only one refund', async () => {
    const { admin, order } = await paidOrder({ trackStock: true, stock: 10 });
    let count = 0;
    setRazorpayClientFactory(() => ({
      payments: { refund: async () => { count += 1; await new Promise((r) => setTimeout(r, 50)); return { id: 'rfnd_x' }; } }
    }));
    const results = await Promise.all([1, 2, 3].map(() =>
      api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} })));
    assert.equal(count, 1);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  });

  test('only an admin can refund; staff and shoppers are refused', async () => {
    const { customer, staff, order } = await paidOrder();
    fakeRefund();
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund`, { token: staff.token, body: {} })).status, 403);
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund`, { token: customer.token, body: {} })).status, 403);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'paid');
  });

  test('an unpaid order cannot be refunded', async () => {
    const customer = await makeUser();
    const admin = await makeUser('admin');
    const product = await makeProduct();
    const order = await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    const res = await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });
    assert.equal(res.status, 400);
  });

  test('if Razorpay refuses, nothing changes and the admin can try again', async () => {
    const { admin, product, order } = await paidOrder({ trackStock: true, stock: 10 });
    setRazorpayClientFactory(() => ({
      payments: { refund: async () => { const e = new Error('boom'); e.error = { description: 'Insufficient balance' }; throw e; } }
    }));
    const failed = await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });
    assert.equal(failed.status, 502);
    assert.match(failed.body.message, /Insufficient balance/);
    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'paid');
    assert.equal(saved.refundRequestedAt, undefined);
    assert.equal(await stockOf(product), 8);

    fakeRefund();
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} })).status, 200);
  });

  test('a refunded order cannot be used to leave the shop', async () => {
    await setBagPercent(0);
    const { staff, admin, order } = await paidOrder();
    fakeRefund();
    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });

    const url = `/api/v1/orders/verify/${order.orderNumber}`;
    assert.equal((await api('GET', url, { token: staff.token })).body.result, 'REFUNDED');
    const exit = await api('POST', `${url}/exit`, { token: staff.token });
    assert.equal(exit.status, 400);
    assert.equal(exit.body.result, 'REFUNDED');
  });

  test('a late Razorpay message cannot turn a refunded order back into a paid one', async () => {
    const { customer, admin, product, order } = await paidOrder({ trackStock: true, stock: 10 });
    fakeRefund();
    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });

    const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test1', order_id: order.razorpayOrderId } } } });
    await api('POST', '/api/v1/payments/webhook', { rawBody, headers: { 'x-razorpay-signature': webhookSignature(rawBody) } });
    await payOrder(customer.token, order);

    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'refunded');
    assert.equal(await stockOf(product), 10);
  });

  test('a refunded order is out of revenue, is counted, and cannot be edited, cancelled, re-paid or re-checked', async () => {
    const { customer, staff, admin, order } = await paidOrder();
    const before = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.equal(before.body.data.stats.totalRevenue, 200);

    fakeRefund();
    await api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body: {} });

    const stats = (await api('GET', '/api/v1/orders/stats', { token: admin.token })).body.data.stats;
    assert.equal(stats.totalRevenue, 0);
    assert.equal(stats.refundedOrders, 1);
    assert.equal(stats.completedOrders, 0);

    assert.equal((await api('PUT', `/api/v1/orders/${order._id}/status`, { token: admin.token, body: { status: 'cancelled' } })).status, 400);
    assert.equal((await api('PUT', `/api/v1/orders/${order._id}/cancel`, { token: customer.token })).status, 400);
    assert.equal((await api('POST', '/api/v1/payments/create-order', { token: customer.token, body: { orderId: String(order._id) } })).status, 400);
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/reconcile`, { token: staff.token })).status, 400);
    assert.equal((await Order.findById(order._id)).paymentStatus, 'refunded');
  });
});

describe('deactivating users (R-43)', () => {
  test('a deactivated user is locked out at once, even with a saved sign-in', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    assert.equal((await api('GET', '/api/v1/orders/all', { token: staff.token })).status, 200);

    const res = await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: false } });
    assert.equal(res.status, 200);
    assert.equal((await api('GET', '/api/v1/orders/all', { token: staff.token })).status, 401);
  });

  test('reactivating restores access', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: false } });
    await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: true } });
    assert.equal((await api('GET', '/api/v1/orders/all', { token: staff.token })).status, 200);
  });

  test('history is kept: the user, their orders and the user list entry all remain', async () => {
    const admin = await makeUser('admin');
    const customer = await makeUser();
    const product = await makeProduct();
    await placeOrder(customer.token, [{ barcode: product.barcode, quantity: 1 }]);
    await api('PUT', `/api/v1/users/${customer.user._id}/active`, { token: admin.token, body: { isActive: false } });

    assert.equal(await Order.countDocuments({ userId: customer.user._id }), 1);
    const list = await api('GET', '/api/v1/users', { token: admin.token });
    const row = list.body.data.users.find((u) => u.phoneNumber === customer.user.phoneNumber);
    assert.equal(row.isActive, false);
  });

  test('a deactivated user gets no new code and cannot finish signing in', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: false } });

    const send = await api('POST', '/api/auth/phone/send-otp', { body: { phoneNumber: staff.user.phoneNumber } });
    assert.equal(send.status, 403);
    assert.match(send.body.message, /deactivated/);

    // Even with a valid code already on the account
    const user = await User.findById(staff.user._id);
    const otp = user.generateOTP();
    await user.save();
    const verify = await api('POST', '/api/auth/phone/verify-otp', { body: { phoneNumber: staff.user.phoneNumber, otp } });
    assert.equal(verify.status, 403);
    assert.equal(verify.body.data, undefined);
  });

  test('an admin cannot deactivate themselves; shoppers and staff cannot deactivate anyone', async () => {
    const admin = await makeUser('admin');
    const staff = await makeUser('staff');
    const customer = await makeUser();
    assert.equal((await api('PUT', `/api/v1/users/${admin.user._id}/active`, { token: admin.token, body: { isActive: false } })).status, 400);
    assert.equal((await api('PUT', `/api/v1/users/${customer.user._id}/active`, { token: staff.token, body: { isActive: false } })).status, 403);
    assert.equal((await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: customer.token, body: { isActive: false } })).status, 403);
    assert.equal((await api('PUT', `/api/v1/users/${staff.user._id}/active`, { token: admin.token, body: { isActive: 'maybe' } })).status, 400);
    assert.equal((await api('PUT', '/api/v1/users/not-an-id/active', { token: admin.token, body: { isActive: false } })).status, 404);
  });
});
