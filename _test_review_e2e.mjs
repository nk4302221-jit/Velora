/**
 * Throwaway end-to-end check for the customer review lifecycle that the
 * My Reviews UI drives:
 *
 *   delivered order -> /customer/reviews/reviewable -> POST /customer/reviews
 *   -> pending -> admin moderates -> approved -> customer sees approved
 *
 * Creates its own delivered order, then removes everything it made.
 */
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const BASE = 'http://localhost:5000/api';
const TAG = 'e2e-review';

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
};

async function call(path, { method = 'GET', token, body } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  } catch (e) {
    return { status: 0, message: e.message };
  }
}

const conn = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456',
  database: 'ecommerce_db',
});

const cleanup = async () => {
  await conn.query(
    `DELETE r FROM reviews r
       JOIN users u ON u.id = r.user_id
      WHERE u.email = 'customer@shopvanguard.com'
        AND r.comment LIKE ?`,
    [`%${TAG}%`]
  );
  await conn.query(
    `DELETE oi FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.order_number LIKE ?`,
    [`%${TAG}%`]
  );
  await conn.query(`DELETE FROM orders WHERE order_number LIKE ?`, [
    `%${TAG}%`,
  ]);
};

await cleanup();

const run = async () => {
  const cu = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'customer@shopvanguard.com', password: 'Customer@123' },
  });
  const ad = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@shopvanguard.com', password: 'Admin@123' },
  });

  check('customer login', cu.status === 200, `status=${cu.status}`);
  check('admin login', ad.status === 200, `status=${ad.status}`);

  const cuToken = cu.data?.token;
  const adToken = ad.data?.token;

  // Pick a real product that the customer has NOT already reviewed.
  const [productRows] = await conn.query(
    `SELECT p.id, p.price FROM products p
      WHERE p.id NOT IN (
        SELECT r.product_id FROM reviews r
          JOIN users u ON u.id = r.user_id
         WHERE u.email = 'customer@shopvanguard.com'
      )
      LIMIT 1`
  );

  if (productRows.length === 0) {
    check('a product is available to review', false, 'none found');
    return;
  }

  const product = productRows[0];
  check('a product is available to review', true);

  // Not offered before the order is delivered.
  let r = await call('/customer/reviews/reviewable', { token: cuToken });
  const beforeList = r.data?.products || [];
  check(
    'product not reviewable before delivery',
    !beforeList.some((p) => Number(p.product_id) === Number(product.id)),
    'unexpectedly listed'
  );

  // Create a delivered order containing that product.
  const [[customer]] = await conn.query(
    `SELECT id FROM users WHERE email = 'customer@shopvanguard.com' LIMIT 1`
  );

  const orderNumber = `${TAG}-${Date.now()}`;

  const [orderResult] = await conn.query(
    `INSERT INTO orders
       (user_id, subtotal, discount, shipping, total_amount, payment_status,
        order_status, payment_method, order_number, currency, paid_at)
     VALUES (?, ?, 0, 0, ?, 'paid', 'delivered', 'razorpay', ?, 'INR', NOW())`,
    [customer.id, product.price, product.price, orderNumber]
  );

  const orderId = orderResult.insertId;

  await conn.query(
    `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total)
     VALUES (?, ?, 'E2E Review Product', 1, ?, ?)`,
    [orderId, product.id, product.price, product.price]
  );

  // Offered now that the purchase is delivered.
  r = await call('/customer/reviews/reviewable', { token: cuToken });
  check('reviewable feed is 200 after delivery', r.status === 200, `status=${r.status}`);

  const afterList = r.data?.products || [];
  const offered = afterList.find(
    (p) => Number(p.product_id) === Number(product.id)
  );

  check(
    'delivered product appears as reviewable',
    Boolean(offered),
    `list=${JSON.stringify(afterList.map((p) => p.product_id))}`
  );
  check(
    'reviewable entry carries order_number for display',
    Boolean(offered?.order_number),
    `order_number=${offered?.order_number}`
  );
  check(
    'reviewable entry carries product_name for display',
    Boolean(offered?.product_name),
    `product_name=${offered?.product_name}`
  );

  // Submit.
  r = await call('/customer/reviews', {
    method: 'POST',
    token: cuToken,
    body: {
      product_id: product.id,
      rating: 4,
      title: 'Solid performer',
      comment: `${TAG} genuinely good value for the price paid.`,
    },
  });

  check('review accepted', r.status === 200, `status=${r.status} ${r.message || ''}`);
  check('review starts as pending', r.data?.review?.status === 'pending', `status=${r.data?.review?.status}`);

  const reviewId = r.data?.review?.id;
  check('review id returned', Boolean(reviewId));

  // Drops out of the feed (one review per product).
  r = await call('/customer/reviews/reviewable', { token: cuToken });
  check(
    'reviewed product removed from feed',
    !(r.data?.products || []).some((p) => Number(p.product_id) === Number(product.id)),
    'still listed'
  );

  // Not publicly visible while pending.
  r = await call(`/products/${product.id}`);
  const pubPending = (r.data?.product?.reviews || r.data?.reviews || []).filter(
    (rev) => Number(rev.id) === Number(reviewId)
  );
  check('pending review hidden from public product page', pubPending.length === 0, `visible=${pubPending.length}`);

  // Admin moderates.
  r = await call(`/management/reviews/${reviewId}`, {
    method: 'PATCH',
    token: adToken,
    body: { status: 'approved' },
  });
  check('admin approves review', r.status === 200, `status=${r.status} ${r.message || ''}`);
  check('review now approved', r.data?.review?.status === 'approved', `status=${r.data?.review?.status}`);

  // Customer sees the new status.
  r = await call('/customer/reviews', { token: cuToken });
  const mine = (r.data?.reviews || []).find((rev) => Number(rev.id) === Number(reviewId));
  check('customer sees approved status', mine?.status === 'approved', `status=${mine?.status}`);
  check(
    'customer review carries product_name for the card',
    Boolean(mine?.product_name),
    `product_name=${mine?.product_name}`
  );

  // Resubmitting is an EDIT, not a duplicate: submitReview upserts on
  // (product_id, user_id) and re-pends the row for moderation. Assert the
  // invariants that actually matter rather than expecting a 4xx.
  r = await call('/customer/reviews', {
    method: 'POST',
    token: cuToken,
    body: {
      product_id: product.id,
      rating: 2,
      comment: `${TAG} edited after moderation, downgrading my score.`,
    },
  });
  check('resubmitting an existing review succeeds (edit)', r.status === 200, `status=${r.status} ${r.message || ''}`);
  check('edit keeps the same review id', Number(r.data?.review?.id) === Number(reviewId), `id=${r.data?.review?.id} expected=${reviewId}`);
  check('edit applies the new rating', Number(r.data?.review?.rating) === 2, `rating=${r.data?.review?.rating}`);
  check('edit sends the review back to pending', r.data?.review?.status === 'pending', `status=${r.data?.review?.status}`);

  const [dupRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM reviews r
       JOIN users u ON u.id = r.user_id
      WHERE u.email = 'customer@shopvanguard.com' AND r.product_id = ?`,
    [product.id]
  );
  check(
    'still exactly one review row for the product',
    Number(dupRows[0].n) === 1,
    `rows=${dupRows[0].n}`
  );

  // An edit must un-publish a previously approved review.
  r = await call(`/products/${product.id}`);
  const pubAfterEdit = (r.data?.product?.reviews || r.data?.reviews || []).filter(
    (rev) => Number(rev.id) === Number(reviewId)
  );
  check('edited review is hidden from the public page again', pubAfterEdit.length === 0, `visible=${pubAfterEdit.length}`);

  // Customer cannot approve their own review.
  r = await call(`/management/reviews/${reviewId}`, {
    method: 'PATCH',
    token: cuToken,
    body: { status: 'rejected' },
  });
  check('customer cannot moderate reviews', r.status === 403, `status=${r.status}`);
};

try {
  await run();
} catch (e) {
  fail += 1;
  failures.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  await cleanup();
  await conn.end();
}

console.log('\n========================================================');
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log('========================================================');

process.exit(fail === 0 ? 0 : 1);
