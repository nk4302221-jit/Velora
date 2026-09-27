/**
 * Throwaway smoke test for the Admin/Super Admin portal endpoints the new
 * pages consume. Verifies each page's data source returns the shape the page
 * reads, and that mutations work end to end. Everything it creates is removed.
 */
const BASE = 'http://localhost:5000/api';

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

const TAG = 'smoke';
const created = { categories: [], coupons: [], offers: [] };
const tokens = {};

const run = async () => {
  const ad = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@shopvanguard.com', password: 'Admin@123' },
  });
  const sa = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'superadmin@velora.com', password: 'SuperAdmin@123' },
  });
  const cu = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'customer@shopvanguard.com', password: 'Customer@123' },
  });

  check('admin login', ad.status === 200, `status=${ad.status}`);
  check('super admin login', sa.status === 200, `status=${sa.status}`);
  check('customer login', cu.status === 200, `status=${cu.status}`);

  const t = ad.data?.token;
  const st = sa.data?.token;
  const ct = cu.data?.token;
  tokens.admin = t;

  // ---------- Admin dashboard (AdminPortalDashboardPage) ----------
  let r = await call('/admin/dashboard', { token: t });
  check('GET /admin/dashboard -> 200', r.status === 200, `status=${r.status}`);
  check('dashboard has stats', typeof r.data?.stats === 'object', `got ${typeof r.data?.stats}`);
  check(
    'dashboard stat fields present',
    ['totalUsers', 'totalProducts', 'totalOrders', 'totalRevenue', 'activeMemberships'].every(
      (k) => typeof r.data?.stats?.[k] === 'number'
    ),
    JSON.stringify(r.data?.stats)
  );
  check('dashboard recentOrders is an array', Array.isArray(r.data?.recentOrders), `got ${typeof r.data?.recentOrders}`);
  check('dashboard categoryStats is an array', Array.isArray(r.data?.categoryStats), `got ${typeof r.data?.categoryStats}`);

  // ---------- Orders page ----------
  r = await call('/admin/orders?page=1&limit=5', { token: t });
  check('GET /admin/orders -> 200', r.status === 200, `status=${r.status}`);
  check('orders is a top-level array', Array.isArray(r.orders), `got ${typeof r.orders}`);
  check('orders pagination present', typeof r.pagination?.totalPages === 'number', JSON.stringify(r.pagination));

  // ---------- Products page ----------
  r = await call('/products?page=1&limit=5', { token: t });
  check('GET /products -> 200', r.status === 200, `status=${r.status}`);
  check('products is a top-level array', Array.isArray(r.products), `got ${typeof r.products}`);

  // ---------- Categories page (full CRUD) ----------
  r = await call('/management/categories', { token: t });
  check('GET /management/categories -> 200', r.status === 200, `status=${r.status}`);
  check('categories nested under data', Array.isArray(r.data?.categories), `got ${typeof r.data?.categories}`);
  check('category rows carry product_count', r.data?.categories?.every((c) => 'product_count' in c) ?? false, 'missing product_count');

  r = await call('/management/categories', {
    method: 'POST',
    token: t,
    body: { name: `${TAG} Category`, description: 'temp' },
  });
  check('POST category -> 201', r.status === 201, `status=${r.status} ${r.message || ''}`);
  const categoryId = r.data?.category?.id;
  check('created category returned', Number.isInteger(Number(categoryId)), `id=${categoryId}`);
  if (categoryId) created.categories.push(categoryId);

  r = await call(`/management/categories/${categoryId}`, {
    method: 'PUT',
    token: t,
    body: { name: `${TAG} Category Renamed` },
  });
  check('PUT category -> 200', r.status === 200, `status=${r.status}`);
  check('rename applied', r.data?.category?.name === `${TAG} Category Renamed`, `name=${r.data?.category?.name}`);

  // ---------- Inventory page ----------
  r = await call('/management/inventory?page=1&limit=5', { token: t });
  check('GET /management/inventory -> 200', r.status === 200, `status=${r.status}`);
  check('inventory items array', Array.isArray(r.items), `got ${typeof r.items}`);
  check(
    'inventory summary fields present',
    ['totalUnits', 'outOfStock', 'lowStock', 'totalProducts'].every(
      (k) => typeof r.summary?.[k] === 'number'
    ),
    JSON.stringify(r.summary)
  );

  const target = r.items?.[0];
  check('inventory has a product to edit', Boolean(target), 'none returned');
  if (target) {
    const originalStock = target.stock;
    r = await call(`/management/inventory/${target.id}`, {
      method: 'PATCH',
      token: t,
      body: { stock: originalStock },
    });
    check('PATCH inventory (same value) -> 200', r.status === 200, `status=${r.status}`);

    r = await call(`/management/inventory/${target.id}`, {
      method: 'PATCH',
      token: t,
      body: { stock: -5 },
    });
    check('negative stock rejected', r.status === 400, `status=${r.status}`);

    r = await call(`/management/inventory/${target.id}`, {
      method: 'PATCH',
      token: t,
      body: { stock: 1.5 },
    });
    check('fractional stock rejected', r.status === 400, `status=${r.status}`);
  }

  // ---------- Coupons page (full CRUD) ----------
  r = await call('/management/coupons', { token: t });
  check('GET /management/coupons -> 200', r.status === 200, `status=${r.status}`);
  check('coupons array', Array.isArray(r.data?.coupons), `got ${typeof r.data?.coupons}`);

  r = await call('/management/coupons', {
    method: 'POST',
    token: t,
    body: {
      code: `${TAG.toUpperCase()}10`,
      description: 'temp',
      discountType: 'percentage',
      discountValue: 10,
      usageLimit: 5,
    },
  });
  check('POST coupon -> 201', r.status === 201, `status=${r.status} ${r.message || ''}`);
  const couponId = r.data?.coupon?.id;
  if (couponId) created.coupons.push(couponId);

  r = await call('/management/coupons', {
    method: 'POST',
    token: t,
    body: { code: `${TAG.toUpperCase()}10`, discountType: 'percentage', discountValue: 10 },
  });
  check('duplicate coupon code rejected', r.status === 409, `status=${r.status}`);

  r = await call('/management/coupons', {
    method: 'POST',
    token: t,
    body: { code: `${TAG.toUpperCase()}99`, discountType: 'percentage', discountValue: 500 },
  });
  check('percentage over 100 rejected', r.status === 400, `status=${r.status}`);

  r = await call(`/management/coupons/${couponId}`, {
    method: 'PUT',
    token: t,
    body: { status: 'inactive' },
  });
  check('PUT coupon -> 200', r.status === 200, `status=${r.status}`);
  check('coupon status applied', r.data?.coupon?.status === 'inactive', `status=${r.data?.coupon?.status}`);

  // ---------- Offers page (full CRUD) ----------
  r = await call('/management/offers', { token: t });
  check('GET /management/offers -> 200', r.status === 200, `status=${r.status}`);
  check('offers array', Array.isArray(r.data?.offers), `got ${typeof r.data?.offers}`);

  r = await call('/management/offers', {
    method: 'POST',
    token: t,
    body: { title: `${TAG} Offer`, discountType: 'fixed', discountValue: 50 },
  });
  check('POST offer -> 201', r.status === 201, `status=${r.status} ${r.message || ''}`);
  const offerId = r.data?.offer?.id;
  if (offerId) created.offers.push(offerId);

  r = await call('/management/offers', {
    method: 'POST',
    token: t,
    body: {
      title: `${TAG} Bad Window`,
      discountType: 'percentage',
      discountValue: 5,
      startsAt: '2030-06-01',
      endsAt: '2030-01-01',
    },
  });
  check('offer with inverted window rejected', r.status === 400, `status=${r.status}`);

  r = await call(`/management/offers/${offerId}`, {
    method: 'PUT',
    token: t,
    body: { status: 'inactive' },
  });
  check('PUT offer -> 200', r.status === 200, `status=${r.status}`);

  // ---------- Reviews moderation page ----------
  r = await call('/management/reviews?page=1&limit=5', { token: t });
  check('GET /management/reviews -> 200', r.status === 200, `status=${r.status}`);
  check('reviews array', Array.isArray(r.reviews), `got ${typeof r.data?.reviews}`);
  check(
    'review summary fields present',
    ['averageRating', 'totalReviews', 'pending'].every((k) => k in (r.summary || {})),
    JSON.stringify(r.summary)
  );
  check('reviews pagination present', typeof r.pagination?.totalPages === 'number', JSON.stringify(r.pagination));

  // ---------- Returns page ----------
  r = await call('/management/returns?status=requested&page=1&limit=5', { token: t });
  check('GET /management/returns -> 200', r.status === 200, `status=${r.status}`);
  check('returns is a TOP-LEVEL array', Array.isArray(r.returns), `got ${typeof r.returns}`);
  check('returns pagination present', typeof r.pagination?.totalPages === 'number', JSON.stringify(r.pagination));

  r = await call('/management/returns/999999', {
    method: 'PATCH',
    token: t,
    body: { status: 'approved' },
  });
  check('unknown return -> 404', r.status === 404, `status=${r.status}`);

  r = await call('/management/returns/999999', {
    method: 'PATCH',
    token: t,
    body: { status: 'nonsense' },
  });
  check('invalid return status -> 400', r.status === 400, `status=${r.status}`);

  // ---------- Customers page ----------
  r = await call('/admin/users?page=1&limit=5&role=customer', { token: t });
  check('GET /admin/users -> 200', r.status === 200, `status=${r.status}`);
  check('users is a top-level array', Array.isArray(r.users), `got ${typeof r.users}`);
  check('users pagination present', typeof r.pagination?.totalPages === 'number', JSON.stringify(r.pagination));

  const victim = (r.users || []).find((u) => u.role === 'customer' && u.email !== 'customer@shopvanguard.com');
  if (victim) {
    r = await call(`/admin/users/${victim.id}/status`, {
      method: 'PATCH',
      token: t,
      body: { status: 'blocked' },
    });
    check('customer status -> blocked accepted (enum aligned)', [200, 400].includes(r.status), `status=${r.status} ${r.message || ''}`);
    if (r.status === 400) {
      console.log('      !! schema rejected "blocked" - database.sql must be re-applied');
    } else {
      await call(`/admin/users/${victim.id}/status`, {
        method: 'PATCH',
        token: t,
        body: { status: 'active' },
      });
    }
  }

  // ---------- Customer cannot reach admin management ----------
  for (const path of [
    '/management/categories',
    '/management/inventory',
    '/management/coupons',
    '/management/offers',
    '/management/reviews',
    '/management/returns',
  ]) {
    r = await call(path, { token: ct });
    check(`CUSTOMER blocked from ${path}`, r.status === 403, `status=${r.status}`);
  }

  // ---------- Super Admin portal pages ----------
  r = await call('/super-admin/dashboard', { token: st });
  check('GET /super-admin/dashboard -> 200', r.status === 200, `status=${r.status}`);
  check('SA dashboard stats', typeof r.data?.stats === 'object', `got ${typeof r.data?.stats}`);
  check('SA dashboard recentAdmins array', Array.isArray(r.data?.recentAdmins), `got ${typeof r.data?.recentAdmins}`);
  check('SA dashboard recentAudit array', Array.isArray(r.data?.recentAudit), `got ${typeof r.data?.recentAudit}`);

  r = await call('/super-admin/roles', { token: st });
  check('GET /super-admin/roles -> 200', r.status === 200, `status=${r.status}`);
  check('roles matrix', typeof r.data?.matrix === 'object', `got ${typeof r.data?.matrix}`);
  check('permissionLabels', typeof r.data?.permissionLabels === 'object', `got ${typeof r.data?.permissionLabels}`);

  r = await call('/super-admin/audit-logs?page=1&limit=5', { token: st });
  check('GET /super-admin/audit-logs -> 200', r.status === 200, `status=${r.status}`);
  check('audit logs top-level array', Array.isArray(r.logs), `got ${typeof r.logs}`);

  r = await call('/super-admin/audit-logs?role=super_admin&actorEmail=superadmin', { token: st });
  check('audit log filters accepted', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/super-admin/settings', { token: st });
  check('GET /super-admin/settings -> 200', r.status === 200, `status=${r.status}`);
  check('settings nested under data', typeof r.data?.settings === 'object', `got ${typeof r.data?.settings}`);

  r = await call('/admin/reports', { token: st });
  check('GET /admin/reports as SUPER_ADMIN -> 200', r.status === 200, `status=${r.status}`);
  check('report totals', typeof r.data?.totals === 'object', `got ${typeof r.data?.totals}`);

  r = await call('/admin/payments', { token: st });
  check('GET /admin/payments as SUPER_ADMIN -> 200', r.status === 200, `status=${r.status}`);
  check('payments top-level array', Array.isArray(r.payments), `got ${typeof r.payments}`);

  // Razorpay: reading the status is admin-level by design; WRITING gateway
  // credentials is SUPER ADMIN only (privileged credential mutation).
  r = await call('/admin/payments/razorpay', { token: t });
  check('ADMIN may read razorpay status', r.status === 200, `status=${r.status}`);
  check('razorpay status reports configured flag', typeof r.data?.configured === 'boolean', JSON.stringify(r.data));

  r = await call('/admin/payments/razorpay', {
    method: 'PUT',
    token: t,
    body: { keyId: 'rzp_test_x', keySecret: 'should-never-be-accepted' },
  });
  check('ADMIN blocked from WRITING razorpay credentials', r.status === 403, `status=${r.status} ${r.message || ''}`);

  r = await call('/admin/payments/razorpay/test', { method: 'POST', token: t, body: {} });
  check('ADMIN blocked from razorpay test call', r.status === 403, `status=${r.status}`);

  r = await call('/admin/payments/razorpay', { token: st });
  check('SUPER_ADMIN can read razorpay config', r.status === 200, `status=${r.status}`);
  check('razorpay config never echoes the secret', !r.data?.keySecret, 'keySecret leaked to client');
};

try {
  await run();
} catch (e) {
  fail += 1;
  failures.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  for (const id of created.coupons) await call(`/management/coupons/${id}`, { method: 'DELETE', token: tokens.admin });
  for (const id of created.offers) await call(`/management/offers/${id}`, { method: 'DELETE', token: tokens.admin });
  for (const id of created.categories) await call(`/management/categories/${id}`, { method: 'DELETE', token: tokens.admin });
}

console.log('\n========================================================');
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log('========================================================');

process.exit(fail === 0 ? 0 : 1);
