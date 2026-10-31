// Single source of truth for tax and totals.
// The client never decides prices: the server calculates everything from the database.

export const GST_RATES = [0, 5, 12, 18, 28];

// Products saved before per-product tax existed keep the original behaviour:
// 18% added on top of the shelf price.
export const LEGACY_TAX = { rate: 18, inclusive: false };

const round2 = (value) => Math.round(value * 100) / 100;

// Works on a product or on an order line, which both carry gstRate and taxInclusive
export const taxFor = (item) => ({
  rate: typeof item?.gstRate === 'number' ? item.gstRate : LEGACY_TAX.rate,
  inclusive: typeof item?.taxInclusive === 'boolean' ? item.taxInclusive : LEGACY_TAX.inclusive,
});

// Price one line. `price` is the shelf price of one unit.
//  - inclusive: the shelf price already contains the tax, so report how much of it is tax
//  - exclusive: the tax is added on top of the shelf price
export const priceLine = (price, quantity, tax) => {
  const shelf = round2(price * quantity);

  if (tax.inclusive) {
    return { shelf, taxAdded: 0, taxIncluded: round2(shelf - shelf / (1 + tax.rate / 100)) };
  }

  return { shelf, taxAdded: round2((shelf * tax.rate) / 100), taxIncluded: 0 };
};

// Totals for a set of lines: [{ price, quantity, gstRate, taxInclusive }]
//   subtotal    what the shelf prices add up to
//   tax         GST added on top (exclusive items only)
//   taxIncluded GST that is already inside the shelf prices (inclusive items)
//   total       what the shopper pays = subtotal + tax
export const priceBasket = (lines) => {
  let subtotal = 0;
  let taxAdded = 0;
  let taxIncluded = 0;

  for (const line of lines) {
    const priced = priceLine(line.price, line.quantity || 1, taxFor(line));
    subtotal += priced.shelf;
    taxAdded += priced.taxAdded;
    taxIncluded += priced.taxIncluded;
  }

  subtotal = round2(subtotal);
  taxAdded = round2(taxAdded);
  taxIncluded = round2(taxIncluded);

  return { subtotal, tax: taxAdded, taxIncluded, total: round2(subtotal + taxAdded) };
};
