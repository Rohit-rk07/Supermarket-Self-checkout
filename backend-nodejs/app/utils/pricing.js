// Single source of truth for tax and totals.
// The client never decides prices: the server calculates everything from the database.

export const TAX_RATE = 0.18; // 18% GST

const round2 = (value) => Math.round(value * 100) / 100;

export const computeTotals = (itemsTotal) => {
  const subtotal = round2(itemsTotal);
  const tax = round2(subtotal * TAX_RATE);
  const total = round2(subtotal + tax);

  return { subtotal, tax, total };
};
