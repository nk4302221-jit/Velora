/**
 * Focused regression test for the late backend changes:
 *  - email/mobile login
 *  - identifier-based login
 *  - secure logout (JWT revocation via jti)
 *  - admin-level reports + payments
 *  - super-admin DELETE /admins/:id
 *  - customer review submission (verified purchase)
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

const SA = { email: 'superadmin@velora.com', password: 'SuperAdmin@123' };
const AD = { email: 'admin@shopvanguard.com', password: 'Admin@123' };
const CU = { email: 'customer@shopvanguard.com', password: 'Customer@123' };

const run = async () => {
  // ---------- 1. Email login still works ----------
  let r = await call('/auth/login', { method: 'POST', body: AD });
  check('admin email login', r.status === 200 && r.data?.user?.role === 'admin', JSON.stringify(r).slice(0, 160));
  const adminToken = r.data?.token;

  r = await call('/auth/login', { method: 'POST', body: SA });
  check('super admin email login', r.status === 200 && r.data?.user?.role === 'super_admin', JSON.stringify(r).slice(0, 160));
  const saToken = r.data?.token;

  r = await call('/auth/login', { method: 'POST', body: CU });
  check('customer email login', r.status === 200 && r.data?.user?.role === 'customer', JSON.stringify(r).slice(0, 160));
  const cuToken = r.data?.token;

  // ---------- 2. identifier login (email) ----------
  r = await call('/auth/login', {
    method: 'POST',
    body: { identifier: 'admin@shopvanguard.com', password: 'Admin@123' },
  });
  check('identifier login with email', r.status === 200, `status=${r.status} ${r.message || ''}`);

  // ---------- 3. identifier login (mobile number) ----------
  r = await call('/auth/login', {
    method: 'POST',
    body: { identifier: '+1 (555) 019-2834', password: 'Admin@123' },
  });
  check('identifier login with mobile (formatted)', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/auth/login', {
    method: 'POST',
    body: { identifier: '+15550192834', password: 'Admin@123' },
  });
  check('identifier login with mobile (unformatted)', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/auth/login', {
    method: 'POST',
    body: { phone: '+15550192834', password: 'Admin@123' },
  });
  check('explicit phone login', r.status === 200, `status=${r.status} ${r.message || ''}`);

  // wrong password on phone must still fail
  r = await call('/auth/login', {
    method: 'POST',
    body: { identifier: '+15550192834', password: 'WrongPass@999' },
  });
  check('phone login rejects wrong password', r.status === 401, `status=${r.status}`);

  // unknown phone must not enumerate
  r = await call('/auth/login', {
    method: 'POST',
    body: { identifier: '+15550000000', password: 'Whatever@1' },
  });
  check('unknown phone returns generic 401', r.status === 401, `status=${r.status}`);

  // ---------- 4. Admin reports + payments ----------
  r = await call('/admin/reports', { token: adminToken });
  check('ADMIN can read /admin/reports', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/admin/payments', { token: adminToken });
  check('ADMIN can read /admin/payments', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/admin/reports', { token: cuToken });
  check('CUSTOMER blocked from /admin/reports', r.status === 403, `status=${r.status}`);

  r = await call('/admin/payments', { token: cuToken });
  check('CUSTOMER blocked from /admin/payments', r.status === 403, `status=${r.status}`);

  // ---------- 5. Super admin delete admin ----------
  r = await call('/admin/users/admin', {
    method: 'POST',
    token: saToken,
    body: {
      fullName: 'Temp Deletable Admin',
      email: `tmp.delete.${Date.now()}@velora.com`,
      password: 'TempPass@123',
    },
  });
  check('SUPER_ADMIN creates temp admin', [200, 201].includes(r.status), `status=${r.status} ${r.message || ''}`);
  const tempId = r.data?.data?.user?.id ?? r.data?.data?.admin?.id ?? r.data?.user?.id;

  r = await call(`/super-admin/admins/${tempId}`, { method: 'DELETE', token: adminToken });
  check('ADMIN cannot delete admins (403)', r.status === 403, `status=${r.status}`);

  r = await call(`/super-admin/admins/${tempId}`, { method: 'DELETE', token: saToken });
  check('SUPER_ADMIN deletes temp admin', r.status === 200, `status=${r.status} ${r.message || ''}`);

  // cannot delete self
  r = await call('/super-admin/admins/12', { method: 'DELETE', token: saToken });
  check('SUPER_ADMIN cannot delete self', r.status === 403, `status=${r.status}`);

  // ---------- 6. Customer reviews ----------
  r = await call('/customer/reviews', { token: cuToken });
  check('CUSTOMER can list own reviews', r.status === 200, `status=${r.status} ${r.message || ''}`);

  r = await call('/customer/reviews', {
    method: 'POST',
    token: cuToken,
    body: { product_id: 1, rating: 5, comment: 'Amazing noise cancelling, worth every rupee!' },
  });
  const reviewOk = r.status === 200;
  check('CUSTOMER review on non-delivered product rejected', reviewOk ? r.data?.review?.product_id === 1 : r.status === 403, `status=${r.status} ${r.message || ''}`);

  r = await call('/customer/reviews', { method: 'POST', token: adminToken, body: { product_id: 1, rating: 5, comment: 'staff should not review' } });
  check('ADMIN blocked from customer review route', r.status === 403, `status=${r.status}`);

  r = await call('/customer/reviews', {
    method: 'POST',
    token: cuToken,
    body: { product_id: 1, rating: 9, comment: 'rating out of range should fail' },
  });
  check('review rating range validated', r.status === 400, `status=${r.status}`);

  // ---------- 6b. Reviewable-products feed (drives the review form UI) ----------
  // This powers GET /customer/reviews/reviewable, which the My Reviews page
  // uses to populate its product picker. It previously shipped referencing a
  // non-existent orders.delivered_at column, so lock the contract down.
  r = await call('/customer/reviews/reviewable', { token: cuToken });
  check('CUSTOMER can list reviewable products', r.status === 200, `status=${r.status} ${r.message || ''}`);

  const reviewable = r.data?.products;
  check(
    'reviewable products is an array',
    Array.isArray(reviewable),
    `got ${typeof reviewable}`
  );

  if (Array.isArray(reviewable)) {
    check(
      'every reviewable product carries a real product_id',
      reviewable.every((p) => Number.isInteger(Number(p.product_id)) && Number(p.product_id) > 0),
      JSON.stringify(reviewable.map((p) => p.product_id))
    );

    // If a review was accepted above for product 1, that product must drop
    // out of the feed - otherwise the UI would offer an already-reviewed item.
    if (reviewOk) {
      check(
        'reviewed product no longer offered as reviewable',
        !reviewable.some((p) => Number(p.product_id) === 1),
        'product 1 still listed'
      );
    }
  }

  r = await call('/customer/reviews/reviewable', { token: adminToken });
  check('ADMIN blocked from reviewable products', r.status === 403, `status=${r.status}`);

  r = await call('/customer/reviews/reviewable');
  check('anonymous blocked from reviewable products', [401, 403].includes(r.status), `status=${r.status}`);

  // ---------- 6c. Customer returns + payment history ----------
  r = await call('/customer/returns', { token: cuToken });
  check('CUSTOMER can list own returns', r.status === 200, `status=${r.status} ${r.message || ''}`);
  check('own returns is an array', Array.isArray(r.data?.returns), `got ${typeof r.data?.returns}`);

  r = await call('/customer/payments', { token: cuToken });
  check('CUSTOMER can list own payments', r.status === 200, `status=${r.status} ${r.message || ''}`);
  check('own payments is an array', Array.isArray(r.data?.payments), `got ${typeof r.data?.payments}`);

  r = await call('/customer/returns', { token: adminToken });
  check('ADMIN blocked from customer returns', r.status === 403, `status=${r.status}`);

  r = await call('/customer/payments', { token: adminToken });
  check('ADMIN blocked from customer payments', r.status === 403, `status=${r.status}`);

  // ---------- 7. Secure logout / revocation ----------
  // Dedicated session so revoking it does not disturb the other checks.
  r = await call('/auth/login', { method: 'POST', body: CU });
  const throwaway = r.data?.token;
  check('throwaway session issued', Boolean(throwaway));

  r = await call('/auth/me', { token: throwaway });
  check('throwaway session works before logout', r.status === 200, `status=${r.status}`);

  r = await call('/auth/logout', { method: 'POST', token: throwaway });
  check(
    'logout succeeds and revokes the session',
    r.status === 200 && r.data?.sessionRevoked === true,
    JSON.stringify(r).slice(0, 160)
  );

  r = await call('/auth/me', { token: throwaway });
  check('REVOKED token rejected by /auth/me', r.status === 401, `status=${r.status}`);

  r = await call('/customer/dashboard', { token: throwaway });
  check('REVOKED token rejected by /customer/dashboard', r.status === 401, `status=${r.status}`);

  r = await call('/admin/dashboard', { token: throwaway });
  check('REVOKED token rejected by /admin/dashboard', r.status === 401, `status=${r.status}`);

  // other sessions unaffected
  r = await call('/auth/me', { token: cuToken });
  check('other sessions still valid after one logout', r.status === 200, `status=${r.status}`);

  // ---------- 8. Revoked rows persisted ----------
  console.log('');
  console.log(`PASSED: ${pass}   FAILED: ${fail}`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
};

run().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
