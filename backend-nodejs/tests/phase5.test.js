import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  start, stop, clearData, makeUser, makeProduct, placeOrder, api,
  paymentSignature, webhookSignature, setRazorpayClientFactory, Order, Product, Setting
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

const stockOf = async (product) => (await Product.findById(product._id)).stock;
const setBagPercent = (value) => Setting.updateOne({ key: 'bagCheckPercent' }, { $set: { value } }, { upsert: true });

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  setRazorpayClientFactory(() => { throw new Error('This test did not expect a call to Razorpay'); });
});

// A paid order of 3 x A (100, GST 5% included) and 1 x B (50, GST 18% added on top)
const paidMixedOrder = async () => {
  const customer = await makeUser();
  const staff = await makeUser('staff');
  const admin = await makeUser('admin');
  const a = await makeProduct({ price: 100, trackStock: true, stock: 20 });
  const b = await makeProduct({ price: 50, gstRate: 18, taxInclusive: false, trackStock: true, stock: 20 });
  const placed = await placeOrder(customer.token, [{ barcode: a.barcode, quantity: 3 }, { barcode: b.barcode, quantity: 1 }]);
  await payOrder(customer.token, placed);
  return { customer, staff, admin, a, b, order: await Order.findById(placed._id) };
};

const fakeRefunds = () => {
  const calls = [];
  setRazorpayClientFactory(() => ({
    payments: { refund: async (paymentId, args) => { calls.push({ paymentId, args }); return { id: `rfnd_${calls.length}` }; } }
  }));
  return calls;
};

const refund = (admin, order, body) => api('POST', `/api/v1/orders/${order._id}/refund`, { token: admin.token, body });

describe('partial refunds (item 11)', () => {
  test('refunding some items returns their price, restores only their stock, and keeps the order paid', async () => {
    const { admin, a, b, order } = await paidMixedOrder();
    assert.equal(order.total, 359); // 300 + 50 + 9 GST
    const calls = fakeRefunds();

    const res = await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 1 }], reason: 'Damaged' });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.amount, 10000);

    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'paid');
    assert.equal(saved.refundedAmount, 100);
    assert.equal(saved.refundLines.length, 1);
    assert.equal(saved.refundRequestedAt, undefined);
    assert.equal(await stockOf(a), 18); // 20 - 3 + 1
    assert.equal(await stockOf(b), 19); // untouched
  });

  test('GST added on top is refunded too', async () => {
    const { admin, b, order } = await paidMixedOrder();
    const calls = fakeRefunds();
    await refund(admin, order, { items: [{ barcode: b.barcode, quantity: 1 }] });
    assert.equal(calls[0].args.amount, 5900); // 50 + 9
  });

  test('several partial refunds add up, and the last one closes the order as refunded for exactly the total', async () => {
    const { admin, a, b, order } = await paidMixedOrder();
    const calls = fakeRefunds();

    await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 2 }] });
    await refund(admin, order, { items: [{ barcode: b.barcode, quantity: 1 }] });
    assert.equal((await Order.findById(order._id)).paymentStatus, 'paid');

    const last = await refund(admin, order, {}); // everything that is left
    assert.equal(last.status, 200);

    const total = calls.reduce((sum, call) => sum + call.args.amount, 0);
    assert.equal(total, 35900);
    const saved = await Order.findById(order._id);
    assert.equal(saved.paymentStatus, 'refunded');
    assert.equal(saved.status, 'refunded');
    assert.equal(saved.refundedAmount, 359);
    assert.equal(await stockOf(a), 20);
    assert.equal(await stockOf(b), 20);
  });

  test('cannot refund more units than were bought or left, or an unknown item', async () => {
    const { admin, a, order } = await paidMixedOrder();
    const calls = fakeRefunds();

    assert.equal((await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 4 }] })).status, 400);
    assert.equal((await refund(admin, order, { items: [{ barcode: '000000000000', quantity: 1 }] })).status, 400);
    assert.equal((await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 0 }] })).status, 400);

    await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 2 }] });
    const tooMany = await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 2 }] });
    assert.equal(tooMany.status, 400);
    assert.equal(calls.length, 1);
  });

  test('if Razorpay refuses a partial refund nothing changes and it can be retried', async () => {
    const { admin, a, order } = await paidMixedOrder();
    setRazorpayClientFactory(() => ({ payments: { refund: async () => { throw { error: { description: 'Bank down' } }; } } }));
    const failed = await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 1 }] });
    assert.equal(failed.status, 502);
    const saved = await Order.findById(order._id);
    assert.ok(!saved.refundedAmount);
    assert.equal(saved.refundRequestedAt, undefined);
    assert.equal(await stockOf(a), 17);

    fakeRefunds();
    assert.equal((await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 1 }] })).status, 200);
  });

  test('two partial refunds at the same moment cannot both go through for the same items', async () => {
    const { admin, a, order } = await paidMixedOrder();
    let count = 0;
    setRazorpayClientFactory(() => ({
      payments: { refund: async () => { count += 1; await new Promise((r) => setTimeout(r, 40)); return { id: `rfnd_${count}` }; } }
    }));
    const results = await Promise.all([1, 2].map(() => refund(admin, order, { items: [{ barcode: a.barcode, quantity: 3 }] })));
    assert.equal(count, 1);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  });

  test('a part-refunded order can still be used to exit, and the shopper sees the amount returned', async () => {
    await setBagPercent(0);
    const { admin, staff, customer, a, order } = await paidMixedOrder();
    fakeRefunds();
    await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 1 }] });

    const exit = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token, body: {} });
    assert.equal(exit.status, 200);

    const mine = await api('GET', '/api/v1/orders/my-orders', { token: customer.token });
    assert.equal(mine.body.data.orders[0].refundedAmount, 100);
  });

  test('the "partial refund" filter lists them, and today shows the money returned', async () => {
    const { admin, staff, a, order } = await paidMixedOrder();
    fakeRefunds();
    await refund(admin, order, { items: [{ barcode: a.barcode, quantity: 1 }] });

    const list = await api('GET', '/api/v1/orders/all?flag=partialRefund', { token: staff.token });
    assert.equal(list.body.data.orders.length, 1);

    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const stats = await api('GET', `/api/v1/orders/stats?since=${since}`, { token: admin.token });
    assert.equal(stats.body.data.today.refunds, 1);
    assert.equal(stats.body.data.today.refundedAmount, 100);
  });
});

const sendWebhook = (payload) => {
  const rawBody = JSON.stringify(payload);
  return api('POST', '/api/v1/payments/webhook', { rawBody, headers: { 'x-razorpay-signature': webhookSignature(rawBody) } });
};

describe('refund.failed webhook (item 10)', () => {
  test('flags the order, lists it, counts it, and an admin can clear the flag', async () => {
    const { admin, staff, order } = await paidMixedOrder();
    fakeRefunds();
    await refund(admin, order, {});

    const res = await sendWebhook({ event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_test1' } } } });
    assert.equal(res.status, 200);

    const saved = await Order.findById(order._id);
    assert.ok(saved.refundFailedAt);
    assert.equal(saved.refundFailedId, 'rfnd_1');

    const list = await api('GET', '/api/v1/orders/all?flag=refundFailed', { token: staff.token });
    assert.equal(list.body.data.orders.length, 1);

    const stats = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.equal(stats.body.data.today.refundsFailed, 1);

    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund-failure/clear`, { token: staff.token })).status, 403);
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund-failure/clear`, { token: admin.token })).status, 200);
    assert.equal((await Order.findById(order._id)).refundFailedAt, undefined);
    assert.equal((await api('POST', `/api/v1/orders/${order._id}/refund-failure/clear`, { token: admin.token })).status, 404);
  });

  test('a forged refund.failed message is refused, and an unknown payment is ignored', async () => {
    const { order } = await paidMixedOrder();
    const body = JSON.stringify({ event: 'refund.failed', payload: { refund: { entity: { id: 'x', payment_id: 'pay_test1' } } } });
    const forged = await api('POST', '/api/v1/payments/webhook', { rawBody: body, headers: { 'x-razorpay-signature': 'nope' } });
    assert.equal(forged.status, 400);
    assert.equal((await Order.findById(order._id)).refundFailedAt, undefined);

    const unknown = await sendWebhook({ event: 'refund.failed', payload: { refund: { entity: { id: 'x', payment_id: 'pay_none' } } } });
    assert.equal(unknown.status, 200);
  });

  test('the shopper never sees the failed-refund flag', async () => {
    const { customer, order } = await paidMixedOrder();
    await sendWebhook({ event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_9', payment_id: 'pay_test1' } } } });
    const one = await api('GET', `/api/v1/orders/${order._id}`, { token: customer.token });
    assert.equal(one.body.data.refundFailedAt, undefined);
    assert.equal(one.body.data.refundFailedId, undefined);
  });
});

describe('bag-check result (item 12)', () => {
  const exit = (staff, order, body) => api('POST', `/api/v1/orders/verify/${order.orderNumber}/exit`, { token: staff.token, body });

  test('"matched" is saved with the exit and counted today', async () => {
    await setBagPercent(100);
    const { staff, admin, order } = await paidMixedOrder();
    assert.equal((await exit(staff, order, { bagChecked: true, bagResult: 'matched' })).status, 200);
    const saved = await Order.findById(order._id);
    assert.equal(saved.bagResult, 'matched');
    assert.equal(saved.bagNote, undefined);

    const stats = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.equal(stats.body.data.today.bagChecked, 1);
    assert.equal(stats.body.data.today.bagMismatches, 0);
  });

  test('only the tick (the old way) still counts as matched', async () => {
    await setBagPercent(100);
    const { staff, order } = await paidMixedOrder();
    await exit(staff, order, { bagChecked: true });
    assert.equal((await Order.findById(order._id)).bagResult, 'matched');
  });

  test('"mismatch" needs a note, is saved, listed and counted', async () => {
    await setBagPercent(100);
    const { staff, admin, order } = await paidMixedOrder();

    const noNote = await exit(staff, order, { bagChecked: true, bagResult: 'mismatch' });
    assert.equal(noNote.status, 400);
    assert.equal(noNote.body.result, 'NOTE_REQUIRED');
    assert.equal((await Order.findById(order._id)).exitedAt, undefined);

    const ok = await exit(staff, order, { bagChecked: true, bagResult: 'mismatch', bagNote: '  2 extra bottles in the bag  ' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.result, 'HELD');
    const saved = await Order.findById(order._id);
    assert.equal(saved.bagResult, 'mismatch');
    assert.equal(saved.bagNote, '2 extra bottles in the bag');
    // The exit is held, not confirmed
    assert.equal(saved.exitedAt, undefined);
    assert.ok(saved.exitHeldAt);

    const list = await api('GET', '/api/v1/orders/all?flag=bagMismatch', { token: staff.token });
    assert.equal(list.body.data.orders.length, 1);
    assert.equal(list.body.data.orders[0].bagNote, '2 extra bottles in the bag');
    const stats = await api('GET', '/api/v1/orders/stats', { token: admin.token });
    assert.equal(stats.body.data.today.bagMismatches, 1);
  });

  test('a held exit stays held for staff and only an admin can release it', async () => {
    await setBagPercent(100);
    const { staff, admin, order } = await paidMixedOrder();
    await exit(staff, order, { bagChecked: true, bagResult: 'mismatch', bagNote: 'Extra item' });

    const again = await exit(staff, order, { bagChecked: true });
    assert.equal(again.status, 409);
    assert.equal(again.body.result, 'HELD');
    const view = await api('GET', `/api/v1/orders/verify/${order.orderNumber}`, { token: staff.token });
    assert.equal(view.body.result, 'HELD');

    const byStaff = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/release`, { token: staff.token });
    assert.equal(byStaff.status, 403);
    assert.equal((await Order.findById(order._id)).exitedAt, undefined);

    const released = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/release`, { token: admin.token });
    assert.equal(released.status, 200);
    const goes = await exit(staff, order, {});
    assert.equal(goes.status, 200);
    const saved = await Order.findById(order._id);
    assert.ok(saved.exitedAt);
    assert.equal(saved.bagResult, 'mismatch');

    const twice = await api('POST', `/api/v1/orders/verify/${order.orderNumber}/release`, { token: admin.token });
    assert.equal(twice.status, 404);
  });

  test('the shopper never sees the bag result or note', async () => {
    await setBagPercent(100);
    const { staff, customer, order } = await paidMixedOrder();
    await exit(staff, order, { bagChecked: true, bagResult: 'mismatch', bagNote: 'Extra item' });
    const one = await api('GET', `/api/v1/orders/${order._id}`, { token: customer.token });
    assert.equal(one.body.data.bagResult, undefined);
    assert.equal(one.body.data.bagNote, undefined);
  });
});
