import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceBasket, priceLine, taxFor } from '../app/utils/pricing.js';

test('PRD example: 100 rupees at 5% inclusive totals 100.00 with 4.76 GST inside', () => {
  const totals = priceBasket([{ price: 100, quantity: 1, gstRate: 5, taxInclusive: true }]);
  assert.deepEqual(totals, { subtotal: 100, tax: 0, taxIncluded: 4.76, total: 100 });
});

test('exclusive tax is added on top of the shelf price', () => {
  const totals = priceBasket([{ price: 100, quantity: 2, gstRate: 12, taxInclusive: false }]);
  assert.equal(totals.subtotal, 200);
  assert.equal(totals.tax, 24);
  assert.equal(totals.total, 224);
});

test('old products without tax fields keep 18% added on top', () => {
  assert.deepEqual(taxFor({}), { rate: 18, inclusive: false });
  const totals = priceBasket([{ price: 50, quantity: 1 }]);
  assert.equal(totals.tax, 9);
  assert.equal(totals.total, 59);
});

test('0% GST adds and includes nothing', () => {
  const line = priceLine(40, 3, { rate: 0, inclusive: true });
  assert.equal(line.shelf, 120);
  assert.equal(line.taxIncluded, 0);
  assert.equal(line.taxAdded, 0);
});

test('a mixed basket adds up (inclusive 300 at 5% plus exclusive 100 at 18%)', () => {
  const totals = priceBasket([
    { price: 100, quantity: 3, gstRate: 5, taxInclusive: true },
    { price: 100, quantity: 1, gstRate: 18, taxInclusive: false }
  ]);
  assert.equal(totals.subtotal, 400);
  assert.equal(totals.taxIncluded, 14.29);
  assert.equal(totals.tax, 18);
  assert.equal(totals.total, 418);
});

test('amounts are rounded to two decimals', () => {
  const totals = priceBasket([{ price: 33.33, quantity: 3, gstRate: 18, taxInclusive: false }]);
  assert.equal(totals.subtotal, 99.99);
  assert.equal(totals.tax, 18);
  assert.equal(totals.total, 117.99);
});
