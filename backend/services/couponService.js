import { executeQuery } from '../config/db.js';

/**
 * Domain error carrying an HTTP status so callers can translate a rejected
 * coupon into a proper errorResponse without re-deriving the rule that failed.
 */
export class CouponError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CouponError';
    this.status = status;
  }
}

/**
 * Computes the redemption value of a coupon against a given base amount.
 *
 * The base is the order value after product/membership discounts and before
 * shipping. A percentage coupon is capped by max_discount (when set); a fixed
 * coupon is a flat amount. The result is never allowed to exceed the base or
 * fall below zero, so a total can never go negative.
 */
export function computeCouponDiscount(coupon, baseAmount) {
  const base = Math.max(0, Number(baseAmount) || 0);
  const value = Number(coupon.discount_value) || 0;

  let discount = String(coupon.discount_type).toLowerCase() === 'fixed'
    ? value
    : base * (value / 100);

  const maxDiscount = coupon.max_discount != null ? Number(coupon.max_discount) : null;
  if (maxDiscount != null && !Number.isNaN(maxDiscount) && discount > maxDiscount) {
    discount = maxDiscount;
  }

  if (discount > base) discount = base;
  if (discount < 0) discount = 0;

  return Number(discount.toFixed(2));
}

/**
 * Resolves and validates a coupon code against the current order base amount.
 *
 * Returns { coupon, code, discount }. Throws CouponError when the code is
 * missing, unknown, inactive, outside its validity window, already at its usage
 * limit, or below its minimum order amount. The base never depends on any
 * client-supplied number.
 */
export async function resolveCoupon(rawCode, baseAmount) {
  const code = String(rawCode ?? '').trim();
  if (!code) {
    throw new CouponError('Please enter a coupon code', 400);
  }

  const rows = await executeQuery('SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1', [code.toUpperCase()]);
  const coupon = rows[0];

  if (!coupon) {
    throw new CouponError('This coupon code is not valid', 404);
  }

  if (String(coupon.status).toLowerCase() !== 'active') {
    throw new CouponError('This coupon is no longer available', 400);
  }

  const now = Date.now();

  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    throw new CouponError('This coupon is not active yet', 400);
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) {
    throw new CouponError('This coupon has expired', 400);
  }

  if (coupon.usage_limit != null && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
    throw new CouponError('This coupon has reached its usage limit', 400);
  }

  const base = Math.max(0, Number(baseAmount) || 0);
  const minOrder = Number(coupon.min_order_amount) || 0;

  if (base < minOrder) {
    throw new CouponError(
      `Add items worth ${minOrder.toFixed(2)} or more to use this coupon`,
      400
    );
  }

  return {
    coupon,
    id: coupon.id,
    code: coupon.code,
    description: coupon.description || null,
    discount: computeCouponDiscount(coupon, base),
  };
}

/**
 * Records a successful redemption so usage limits stay accurate. Called only
 * after an order row that stores the coupon has been created.
 */
export async function redeemCoupon(couponId) {
  if (!couponId) return;
  await executeQuery(
    'UPDATE coupons SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [couponId]
  );
}

export default { CouponError, computeCouponDiscount, resolveCoupon, redeemCoupon };
