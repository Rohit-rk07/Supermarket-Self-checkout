import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { start, stop, clearData, api, Order, setGoogleVerifier } from '../test-support/setup.js';

const { default: MongoRateLimitStore } = await import('../app/utils/mongoRateLimitStore.js');
const { default: RateLimit } = await import('../app/models/RateLimit.js');
const { normalizeData } = await import('../app/utils/normalizeData.js');

before(start);
after(stop);
beforeEach(async () => {
  await clearData();
  await RateLimit.deleteMany({});
});

describe('the shared (database) rate-limit store', () => {
  const makeStore = (windowMs = 60000, prefix = '') => {
    const store = new MongoRateLimitStore({ prefix });
    store.init({ windowMs });
    return store;
  };

  test('counts up within a window and keeps the same reset time', async () => {
    const store = makeStore();
    const first = await store.increment('a');
    const second = await store.increment('a');
    assert.equal(first.totalHits, 1);
    assert.equal(second.totalHits, 2);
    assert.equal(first.resetTime.getTime(), second.resetTime.getTime());
  });

  test('keys are counted separately, and prefixes keep two limiters apart', async () => {
    const one = makeStore(60000, 'one:');
    const two = makeStore(60000, 'two:');
    await one.increment('same');
    await one.increment('same');
    assert.equal((await two.increment('same')).totalHits, 1);
    assert.equal((await one.increment('other')).totalHits, 1);
  });

  test('a new window starts after the old one ends', async () => {
    const store = makeStore();
    await store.increment('a');
    await store.increment('a');
    await RateLimit.updateOne({ key: 'a' }, { resetAt: new Date(Date.now() - 1000) });
    assert.equal((await store.increment('a')).totalHits, 1);
  });

  test('twenty requests at the same moment are all counted', async () => {
    const store = makeStore();
    await Promise.all(Array.from({ length: 20 }, () => store.increment('burst')));
    assert.equal((await RateLimit.findOne({ key: 'burst' })).count, 20);
  });

  test('decrement and reset work, and never go below zero', async () => {
    const store = makeStore();
    await store.increment('a');
    await store.decrement('a');
    await store.decrement('a');
    assert.equal((await RateLimit.findOne({ key: 'a' })).count, 0);
    await store.increment('a');
    await store.resetKey('a');
    assert.equal(await RateLimit.countDocuments({ key: 'a' }), 0);
  });

  test('the count lives in the database, so a second store object (another server) sees it', async () => {
    const serverA = makeStore();
    const serverB = makeStore();
    await serverA.increment('phone');
    await serverA.increment('phone');
    assert.equal((await serverB.increment('phone')).totalHits, 3);
  });
});

describe('the sign-in limit', () => {
  test('after 60 attempts from one address the next one is blocked with 429, and the count is kept in the database', async () => {
    setGoogleVerifier(async () => { throw new Error('not a real token'); });
    const body = { credential: 'x'.repeat(40) };
    const statuses = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      statuses.push((await api('POST', '/api/auth/google', { body })).status);
    }
    assert.ok(statuses.slice(0, 60).every((status) => status === 401), statuses.slice(0, 60).join(','));
    assert.equal(statuses[60], 429);
    assert.equal(await RateLimit.countDocuments({ key: /^google-ip:/ }), 1);
  });
});

describe('data cleanup (normalizeData)', () => {
  const seed = async () => {
    const realId = new mongoose.Types.ObjectId();
    const base = { userPhone: '+1555', userName: 'TEST', total: 10, items: [] };
    await Order.collection.insertMany([
      { ...base, orderNumber: 'ORD-A', userId: String(realId), deliveryAddress: { city: 'x' }, estimatedDelivery: new Date() },
      { ...base, orderNumber: 'ORD-B', userId: realId },
      { ...base, orderNumber: 'ORD-C', userId: 'demo-1a2b3c4d' }
    ]);
    return realId;
  };

  test('a dry run reports but changes nothing', async () => {
    await seed();
    const result = await normalizeData(mongoose.connection.db, { apply: false });
    assert.equal(result.userIdsToConvert, 1);
    assert.equal(result.demoOrdersLeftAlone, 1);
    assert.equal(result.ordersWithDeliveryFields, 1);
    assert.equal(typeof (await Order.collection.findOne({ orderNumber: 'ORD-A' })).userId, 'string');
  });

  test('--apply converts real ids, removes delivery fields, leaves demo ids, and can run twice', async () => {
    const realId = await seed();
    await normalizeData(mongoose.connection.db, { apply: true });

    const a = await Order.collection.findOne({ orderNumber: 'ORD-A' });
    assert.ok(a.userId instanceof mongoose.Types.ObjectId);
    assert.equal(String(a.userId), String(realId));
    assert.equal(a.deliveryAddress, undefined);
    assert.equal(a.estimatedDelivery, undefined);
    assert.equal((await Order.collection.findOne({ orderNumber: 'ORD-C' })).userId, 'demo-1a2b3c4d');

    const again = await normalizeData(mongoose.connection.db, { apply: true });
    assert.equal(again.userIdsToConvert, 0);
    assert.equal(again.ordersWithDeliveryFields, 0);
  });
});
