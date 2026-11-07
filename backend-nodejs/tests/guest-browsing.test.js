import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, clearData, makeProduct, api } from '../test-support/setup.js';

before(start);
after(stop);
beforeEach(clearData);

describe('guest browsing', () => {
  test('a visitor can scan a product without signing in', async () => {
    const product = await makeProduct({ price: 40 });
    const res = await api('GET', `/api/v1/scan/${product.barcode}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.barcode, product.barcode);
  });

  test('an unknown barcode is still a clean 404 for a visitor', async () => {
    const res = await api('GET', '/api/v1/scan/0000000000000');
    assert.equal(res.status, 404);
  });

  test('but a visitor cannot place or list orders', async () => {
    const mine = await api('GET', '/api/v1/orders/my-orders');
    assert.equal(mine.status, 401);
    const placed = await api('POST', '/api/v1/orders', { body: { items: [] } });
    assert.equal(placed.status, 401);
  });
});
