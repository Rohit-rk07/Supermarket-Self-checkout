// Money helpers shared by every screen.
// The formulas mirror backend utils/pricing.js exactly, so what a shopper sees is what is charged.
// The server is still the authority: it recalculates everything when the order is saved.

// Products saved before per-product tax existed keep the original behaviour:
// 18% added on top of the shelf price.
const LEGACY_TAX = { rate: 18, inclusive: false };

export const round2 = (value) => Math.round(value * 100) / 100;

export const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

// Works on a product, a basket line or an order line
export const taxFor = (item) => ({
  rate: typeof item?.gstRate === 'number' ? item.gstRate : LEGACY_TAX.rate,
  inclusive: typeof item?.taxInclusive === 'boolean' ? item.taxInclusive : LEGACY_TAX.inclusive,
});

const priceLine = (price, quantity, tax) => {
  const shelf = round2(price * quantity);
  if (tax.inclusive) {
    return { shelf, taxAdded: 0, taxIncluded: round2(shelf - shelf / (1 + tax.rate / 100)) };
  }
  return { shelf, taxAdded: round2((shelf * tax.rate) / 100), taxIncluded: 0 };
};

// Totals for lines: [{ price, quantity, gstRate, taxInclusive }]
//   subtotal    what the shelf prices add up to
//   tax         GST added on top (tax-exclusive items only)
//   taxIncluded GST that is already inside the shelf prices
//   total       what the shopper pays = subtotal + tax
export const priceBasket = (lines) => {
  let subtotal = 0;
  let taxAdded = 0;
  let taxIncluded = 0;

  for (const line of lines || []) {
    const priced = priceLine(line.price || 0, line.quantity || 1, taxFor(line));
    subtotal += priced.shelf;
    taxAdded += priced.taxAdded;
    taxIncluded += priced.taxIncluded;
  }

  subtotal = round2(subtotal);
  taxAdded = round2(taxAdded);
  taxIncluded = round2(taxIncluded);
  return { subtotal, tax: taxAdded, taxIncluded, total: round2(subtotal + taxAdded) };
};

// Totals for a saved order. Orders carry what the server calculated; very old ones are recalculated.
export const getTotals = (order) => {
  if (typeof order?.subtotal === 'number' && typeof order?.tax === 'number' && typeof order?.total === 'number') {
    return {
      subtotal: order.subtotal,
      tax: order.tax,
      taxIncluded: typeof order.taxIncluded === 'number' ? order.taxIncluded : 0,
      total: order.total,
    };
  }
  return priceBasket(order?.items);
};

// Totals for a basket that has not been ordered yet
export const getBasketTotals = (cart) => priceBasket(cart);

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
