// =====================================================
// CURRENCY FORMATTING (single source of truth)
// The store settles in Indian Rupees. Every customer and
// portal surface should format through these helpers so a
// price is rendered identically everywhere.
// =====================================================

export const STORE_CURRENCY = 'INR';

const formatterCache = new Map();

function getFormatter(currency, maximumFractionDigits) {
  const key = `${currency}|${maximumFractionDigits}`;

  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits,
      })
    );
  }

  return formatterCache.get(key);
}

/**
 * Format an amount for display.
 *
 * @param {number|string} value
 * @param {string} [currency] ISO 4217 code (defaults to the store currency).
 * @param {number} [maximumFractionDigits] Decimal places (defaults to 2).
 */
export const formatCurrency = (value, currency = STORE_CURRENCY, maximumFractionDigits = 2) => {
  const amount = Number(value);

  return getFormatter(currency, maximumFractionDigits).format(Number.isFinite(amount) ? amount : 0);
};

/** Convenience wrapper for the store currency (INR). */
export const formatINR = (value, maximumFractionDigits = 2) =>
  formatCurrency(value, STORE_CURRENCY, maximumFractionDigits);

export default formatINR;
