// End-to-end authorization + feature test against the running API.
// Exercises: all 3 role logins, blocked routes, protected routes, logout,
// registration role-escalation attempt, and existing e-commerce features.
const API = process.env.TEST_API || 'http://localhost:5000/api';

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(`${label} ${detail}`);
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json };
}

const uniqEmail = `rbac_${Date.now()}@example.com`;

console.log('\n=== 1. LOGIN: all three roles ===');

const logins = {};
for (const [label, email, password] of [
  ['SUPER_ADMIN', 'superadmin@velora.com', 'SuperAdmin@123'],
  ['ADMIN', 'admin@shopvanguard.com', 'Admin@123'],
  ['CUSTOMER', 'customer@shopvanguard.com', 'Customer@123'],
]) {
  const res = await call('/auth/login', { method: 'POST', body: { email, password } });
  const ok = res.status === 200 && res.body?.data?.token;
  check(`${label} login (${email})`, ok, `status=${res.status} ${JSON.stringify(res.body)?.slice(0, 160)}`);
  if (ok) logins[label] = res.body.data;
  console.log(`        -> role reported by server: ${res.body?.data?.user?.role}`);
  check(
    `${label} login returns no password field`,
    !JSON.stringify(res.body).includes('password_hash')
  );
}

const SA = logins.SUPER_ADMIN?.token;
const AD = logins.ADMIN?.token;
let CU = logins.CUSTOMER?.token;

console.log('\n=== 2. WRONG PASSWORD / INVALID LOGIN ===');
let r = await call('/auth/login', {
  method: 'POST',
  body: { email: 'customer@shopvanguard.com', password: 'TotallyWrongPassword123' },
});
check('wrong password -> 401', r.status === 401, `status=${r.status}`);
check('wrong password message is generic', /invalid (email or password|credentials)/i.test(r.body?.message || ''), r.body?.message);

r = await call('/auth/login', { method: 'POST', body: { email: 'nobody@nowhere.test', password: 'whatever' } });
check('unknown email -> 401', r.status === 401, `status=${r.status}`);

r = await call('/auth/login', { method: 'POST', body: { email: 'customer@shopvanguard.com' } });
check('missing password -> 400', r.status === 400, `status=${r.status}`);

console.log('\n=== 3. ROLE-BASED REDIRECT DATA (server-authoritative role) ===');
check('SUPER_ADMIN role from server', logins.SUPER_ADMIN?.user?.role === 'super_admin', logins.SUPER_ADMIN?.user?.role);
check('ADMIN role from server', logins.ADMIN?.user?.role === 'admin', logins.ADMIN?.user?.role);
check('CUSTOMER role from server', logins.CUSTOMER?.user?.role === 'customer', logins.CUSTOMER?.user?.role);

console.log('\n=== 4. FORGED JWT ROLE CLAIM (must NOT escalate) ===');
// Forge a token whose `role` claim says super_admin but whose `id` is a customer.
const { default: jwt } = await import('jsonwebtoken');
const dotenv = (await import('dotenv')).default;
dotenv.config();
const forged = jwt.sign(
  { id: logins.CUSTOMER?.user?.id, email: 'customer@shopvanguard.com', role: 'super_admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
r = await call('/super-admin/dashboard', { token: forged });
check('forged super_admin claim -> 403', r.status === 403, `status=${r.status} ${r.body?.message}`);
r = await call('/admin/dashboard', { token: forged });
check('forged claim on /admin/dashboard -> 403 (customer)', r.status === 403, `status=${r.status}`);

console.log('\n=== 5. PROTECTED ROUTES: no token -> 401 ===');
for (const p of [
  '/auth/me',
  '/admin/dashboard',
  '/super-admin/dashboard',
  '/management/coupons',
  '/customer/dashboard',
  '/cart',
  '/orders',
]) {
  r = await call(p);
  check(`no token ${p} -> 401`, r.status === 401, `status=${r.status}`);
}

console.log('\n=== 6. CUSTOMER -> ADMIN / SUPER ADMIN URLs BLOCKED ===');
for (const p of [
  '/admin/dashboard',
  '/admin/users',
  '/admin/orders',
  '/super-admin/dashboard',
  '/super-admin/admins',
  '/super-admin/audit-logs',
  '/super-admin/settings',
  '/super-admin/roles',
  '/super-admin/reports',
  '/management/categories',
  '/management/inventory',
  '/management/coupons',
  '/management/offers',
  '/management/reviews',
  '/management/returns',
]) {
  r = await call(p, { token: CU });
  check(`CUSTOMER blocked from ${p} -> 403`, r.status === 403, `status=${r.status}`);
}

console.log('\n=== 7. CUSTOMER -> SUPER ADMIN MUTATIONS BLOCKED ===');
r = await call('/admin/users/admin', { method: 'POST', token: CU, body: { fullName: 'Hacker', email: uniqEmail, password: 'Hacker@123' } });
check('CUSTOMER cannot create admin -> 403', r.status === 403, `status=${r.status}`);
r = await call('/admin/users/2/role', { method: 'PATCH', token: CU, body: { role: 'super_admin' } });
check('CUSTOMER cannot change roles -> 403', r.status === 403, `status=${r.status}`);
r = await call('/super-admin/settings', { method: 'PUT', token: CU, body: { settings: { site_name: 'Owned' } } });
check('CUSTOMER cannot write settings -> 403', r.status === 403, `status=${r.status}`);

console.log('\n=== 8. ADMIN -> SUPER ADMIN URLS BLOCKED ===');
for (const p of [
  '/super-admin/dashboard',
  '/super-admin/admins',
  '/super-admin/audit-logs',
  '/super-admin/settings',
  '/super-admin/roles',
  '/super-admin/reports',
  '/super-admin/payments',
]) {
  r = await call(p, { token: AD });
  check(`ADMIN blocked from ${p} -> 403`, r.status === 403, `status=${r.status}`);
}

console.log('\n=== 9. ADMIN -> SUPER ADMIN MUTATIONS BLOCKED ===');
r = await call('/admin/users/admin', { method: 'POST', token: AD, body: { fullName: 'Sneaky', email: uniqEmail, password: 'Sneaky@123' } });
check('ADMIN cannot create admin -> 403', r.status === 403, `status=${r.status}`);
r = await call('/admin/users/2/role', { method: 'PATCH', token: AD, body: { role: 'admin' } });
check('ADMIN cannot change roles -> 403', r.status === 403, `status=${r.status}`);
r = await call('/admin/payments/razorpay', { method: 'PUT', token: AD, body: { keyId: 'x', keySecret: 'y' } });
check('ADMIN cannot write payment creds -> 403', r.status === 403, `status=${r.status}`);

console.log('\n=== 10. ADMIN -> CUSTOMER ROUTE BLOCKED ===');
r = await call('/customer/dashboard', { token: AD });
check('ADMIN blocked from /customer/dashboard -> 403', r.status === 403, `status=${r.status}`);

console.log('\n=== 11. SUPER ADMIN -> ADMIN FEATURES ACCESSIBLE ===');
for (const p of [
  '/admin/dashboard',
  '/admin/users',
  '/admin/orders',
  '/super-admin/dashboard',
  '/super-admin/admins',
  '/super-admin/roles',
  '/super-admin/settings',
  '/super-admin/reports',
  '/super-admin/payments',
  '/management/categories',
  '/management/inventory',
  '/management/coupons',
  '/management/offers',
  '/management/reviews',
  '/management/returns',
]) {
  r = await call(p, { token: SA });
  check(`SUPER_ADMIN allowed ${p} -> 200`, r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
}

console.log('\n=== 12. ADMIN -> ADMIN FEATURES ACCESSIBLE ===');
for (const p of [
  '/admin/dashboard',
  '/admin/users',
  '/admin/orders',
  '/management/categories',
  '/management/inventory',
  '/management/coupons',
  '/management/offers',
  '/management/reviews',
  '/management/returns',
]) {
  r = await call(p, { token: AD });
  check(`ADMIN allowed ${p} -> 200`, r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
}

console.log('\n=== 13. CUSTOMER SELF-SERVICE ACCESSIBLE ===');
for (const p of ['/customer/dashboard', '/customer/returns', '/customer/payments']) {
  r = await call(p, { token: CU });
  check(`CUSTOMER allowed ${p} -> 200`, r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
}

console.log('\n=== 14. NO PASSWORD LEAKS IN ANY RESPONSE ===');
for (const [label, token] of [['SUPER_ADMIN', SA], ['ADMIN', AD], ['CUSTOMER', CU]]) {
  for (const p of ['/auth/me', '/admin/users', '/admin/users/2', '/super-admin/admins', '/customer/dashboard']) {
    r = await call(p, { token });
    const body = JSON.stringify(r.body || {});
    check(`${label} ${p} has no password_hash`, !body.includes('password_hash'));
    if (body.includes('password_hash')) console.log('        LEAK in', p);
  }
}

console.log('\n=== 15. REGISTRATION ROLE ESCALATION BLOCKED ===');
r = await call('/auth/register', {
  method: 'POST',
  body: { fullName: 'Escalate', email: uniqEmail, password: 'Pass@1234', confirmPassword: 'Pass@1234' },
});
check('normal registration -> 201 (customer)', r.status === 201, `status=${r.status} ${r.body?.message || ''}`);

r = await call('/auth/register', {
  method: 'POST',
  body: { fullName: 'Escalate', email: `esc_${Date.now()}@example.com`, password: 'Pass@1234', confirmPassword: 'Pass@1234', role: 'admin' },
});
check('registration with role=admin -> 403', r.status === 403, `status=${r.status}`);

r = await call('/auth/register', {
  method: 'POST',
  body: { fullName: 'Escalate', email: `esc2_${Date.now()}@example.com`, password: 'Pass@1234', confirmPassword: 'Pass@1234', role: 'super_admin' },
});
check('registration with role=super_admin -> 403', r.status === 403, `status=${r.status}`);

console.log('\n=== 16. SQL INJECTION ATTEMPTS ARE PARAMETERIZED ===');
r = await call(`/admin/users?search=${encodeURIComponent("' OR '1'='1")}`, { token: SA });
check('sqli in search does not error', r.status === 200, `status=${r.status}`);
const sqliBody = JSON.stringify(r.body || {});
check('sqli did not dump other admins', !sqliBody.includes('superadmin@velora.com'), 'leaked privileged account');

r = await call("/admin/users?role=admin'--", { token: SA });
check('sqli in role filter handled safely', r.status === 200 || r.status === 400, `status=${r.status}`);

console.log('\n=== 17. EXISTING E-COMMERCE FEATURES STILL WORK (customer) ===');
for (const p of ['/products', '/products/categories', '/cart', '/wishlist', '/addresses', '/orders', '/plans/my-status']) {
  r = await call(p, { token: CU });
  check(`customer ${p} -> 200`, r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
}
r = await call('/products/1', { token: CU });
check('product detail -> 200', r.status === 200, `status=${r.status}`);

console.log('\n=== 18. EXISTING PUBLIC ENDPOINTS ===');
for (const p of ['/products', '/products/categories', '/plans']) {
  r = await call(p);
  check(`public ${p} -> 200`, r.status === 200, `status=${r.status}`);
}

console.log('\n=== 19. LOGOUT ===');
const revokedCustomerToken = CU;
r = await call('/auth/logout', { method: 'POST', token: CU });
check('authenticated logout -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
check('logout reports the session as revoked', r.body?.data?.sessionRevoked === true, JSON.stringify(r.body?.data || {}));
r = await call('/auth/logout', { method: 'POST' });
check('logout without token -> 401', r.status === 401, `status=${r.status}`);

// A signed-out JWT must stop working on the server, not just in localStorage.
r = await call('/auth/me', { token: revokedCustomerToken });
check('revoked customer token rejected by /auth/me -> 401', r.status === 401, `status=${r.status}`);
r = await call('/customer/dashboard', { token: revokedCustomerToken });
check('revoked customer token rejected by /customer/dashboard -> 401', r.status === 401, `status=${r.status}`);

// Later customer-scoped sections need a live session, so sign in again.
r = await call('/auth/login', { method: 'POST', body: { email: 'customer@shopvanguard.com', password: 'Customer@123' } });
CU = r.body?.data?.token;
check('customer re-login after logout', r.status === 200 && Boolean(CU), `status=${r.status}`);
r = await call('/customer/dashboard', { token: CU });
check('re-issued customer token works', r.status === 200, `status=${r.status}`);

console.log('\n=== 20. INACTIVE ADMIN IS LOCKED OUT ===');
const tempAdminEmail = `temp_admin_${Date.now()}@example.com`;
r = await call('/admin/users/admin', {
  method: 'POST',
  token: SA,
  body: { fullName: 'Temp Admin', email: tempAdminEmail, password: 'TempAdmin@123' },
});
check('SUPER_ADMIN can create admin -> 200/201', r.status === 200 || r.status === 201, `status=${r.status} ${r.body?.message || ''}`);
const tempAdminId = r.body?.data?.user?.id;
check('created admin has role=admin', r.body?.data?.user?.role === 'admin', r.body?.data?.user?.role);

if (tempAdminId) {
  r = await call('/auth/login', { method: 'POST', body: { email: tempAdminEmail, password: 'TempAdmin@123' } });
  check('new admin can log in -> 200', r.status === 200, `status=${r.status}`);
  const tempToken = r.body?.data?.token;

  r = await call(`/super-admin/dashboard`, { token: tempToken });
  check('new ADMIN blocked from super-admin -> 403', r.status === 403, `status=${r.status}`);

  r = await call(`/admin/dashboard`, { token: tempToken });
  check('new ADMIN can reach admin dashboard -> 200', r.status === 200, `status=${r.status}`);

  r = await call(`/super-admin/admins/${tempAdminId}/status`, { method: 'PATCH', token: SA, body: { status: 'inactive' } });
  check('SUPER_ADMIN can deactivate admin -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);

  r = await call('/auth/login', { method: 'POST', body: { email: tempAdminEmail, password: 'TempAdmin@123' } });
  check('deactivated admin login -> 403', r.status === 403, `status=${r.status} ${r.body?.message || ''}`);

  r = await call(`/super-admin/admins/${tempAdminId}/status`, { method: 'PATCH', token: SA, body: { status: 'active' } });
  check('SUPER_ADMIN can reactivate admin -> 200', r.status === 200, `status=${r.status}`);

  r = await call(`/super-admin/admins/${tempAdminId}`, { method: 'PATCH', token: SA, body: { fullName: 'Temp Admin Renamed' } });
  check('SUPER_ADMIN can edit admin -> 200', r.status === 200, `status=${r.status}`);
  check('edit applied', r.body?.data?.admin?.full_name === 'Temp Admin Renamed', r.body?.data?.admin?.full_name);

  r = await call(`/super-admin/admins/${tempAdminId}`, { method: 'DELETE', token: AD });
  check('ADMIN cannot delete admins -> 403', r.status === 403, `status=${r.status}`);

  r = await call(`/super-admin/admins/${tempAdminId}`, { method: 'DELETE', token: SA });
  check('SUPER_ADMIN deletes temp admin -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);

  r = await call(`/super-admin/admins/${tempAdminId}`, { token: SA });
  check('deleted admin is gone -> 404', r.status === 404, `status=${r.status}`);
}

console.log('\n=== 21. LAST SUPER ADMIN PROTECTION ===');
r = await call('/super-admin/dashboard', { token: SA });
const saId = logins.SUPER_ADMIN?.user?.id;
r = await call(`/super-admin/admins/${saId}/status`, { method: 'PATCH', token: SA, body: { status: 'inactive' } });
check('cannot deactivate last super admin -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);

r = await call(`/admin/users/${saId}/role`, { method: 'PATCH', token: SA, body: { role: 'admin' } });
check('cannot demote super_admin via role API -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);

r = await call(`/admin/users/${saId}/role`, { method: 'PATCH', token: SA, body: { role: 'super_admin' } });
check('cannot grant super_admin via role API -> 400', r.status === 400, `status=${r.status}`);

console.log('\n=== 22. COUPON / OFFER / CATEGORY / REVIEW LIFECYCLE (admin) ===');
const stamp = Date.now();
r = await call('/management/coupons', {
  method: 'POST',
  token: AD,
  body: { code: `TEST${stamp}`.slice(0, 20), description: 'rbac test', discountType: 'percentage', discountValue: 15, minOrderAmount: 100 },
});
check('admin creates coupon -> 201', r.status === 201, `status=${r.status} ${r.body?.message || ''}`);
const couponId = r.body?.data?.coupon?.id;

r = await call('/management/coupons', {
  method: 'POST',
  token: AD,
  body: { code: 'BAD CODE!!', discountType: 'percentage', discountValue: 150 },
});
check('invalid coupon rejected -> 400', r.status === 400, `status=${r.status}`);

if (couponId) {
  r = await call(`/management/coupons/${couponId}`, { method: 'PUT', token: AD, body: { discountValue: 25 } });
  check('admin updates coupon -> 200', r.status === 200, `status=${r.status}`);
  r = await call(`/management/coupons/${couponId}`, { method: 'DELETE', token: AD });
  check('admin deletes coupon -> 200', r.status === 200, `status=${r.status}`);
}

r = await call('/management/offers', {
  method: 'POST',
  token: AD,
  body: { title: `Test Offer ${stamp}`, discountType: 'fixed', discountValue: 50 },
});
check('admin creates offer -> 201', r.status === 201, `status=${r.status} ${r.body?.message || ''}`);
const offerId = r.body?.data?.offer?.id;
if (offerId) {
  r = await call(`/management/offers/${offerId}`, { method: 'DELETE', token: AD });
  check('admin deletes offer -> 200', r.status === 200, `status=${r.status}`);
}

r = await call('/management/categories', {
  method: 'POST',
  token: AD,
  body: { name: `Test Cat ${stamp}`, description: 'rbac test' },
});
check('admin creates category -> 201', r.status === 201, `status=${r.status} ${r.body?.message || ''}`);
const catId = r.body?.data?.category?.id;
if (catId) {
  r = await call(`/management/categories/${catId}`, { method: 'DELETE', token: AD });
  check('admin deletes category -> 200', r.status === 200, `status=${r.status}`);
}

console.log('\n=== 23. INVENTORY UPDATE (admin) ===');
r = await call('/management/inventory/1', { method: 'PATCH', token: AD, body: { stock: 42 } });
check('admin updates stock -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
r = await call('/management/inventory/1', { method: 'PATCH', token: AD, body: { stock: -5 } });
check('negative stock rejected -> 400', r.status === 400, `status=${r.status}`);

console.log('\n=== 24. CUSTOMER CANNOT TOUCH ANOTHER CUSTOMER ORDER ===');
const myOrders = await call('/orders', { token: CU });
const orderId = myOrders.body?.data?.orders?.[0]?.id || myOrders.body?.data?.[0]?.id;
if (orderId) {
  r = await call(`/customer/orders/${orderId}/cancel`, { method: 'POST', token: CU, body: { reason: 'test' } });
  check('customer cancels own order (or valid state error) -> 200/400', r.status === 200 || r.status === 400, `status=${r.status} ${r.body?.message || ''}`);
} else {
  console.log('  SKIP  no order available for customer');
}
r = await call('/customer/orders/99999999/tracking', { token: CU });
check('nonexistent order tracking -> 404', r.status === 404, `status=${r.status}`);

console.log('\n=== 25. ROLES & PERMISSIONS MATRIX ===');
r = await call('/super-admin/roles', { token: SA });
check('roles endpoint -> 200', r.status === 200, `status=${r.status}`);
const roles = r.body?.data?.roles || [];
check('matrix lists 3 roles', roles.length === 3, `got ${roles.length}`);
const sa = roles.find((x) => x.role === 'super_admin');
const ad = roles.find((x) => x.role === 'admin');
const cu = roles.find((x) => x.role === 'customer');
check('super_admin has manage_admins', sa?.permissions?.includes('manage_admins'));
check('admin lacks manage_admins', !ad?.permissions?.includes('manage_admins'));
check('admin has manage_products', ad?.permissions?.includes('manage_products'));
check('customer has no permissions', (cu?.permissions || []).length === 0, JSON.stringify(cu?.permissions));

console.log('\n=== 26. AUDIT LOGS RECORDED ===');
r = await call('/super-admin/audit-logs', { token: SA });
check('audit logs -> 200', r.status === 200, `status=${r.status}`);
const logs = r.body?.logs || [];
check('audit log has entries', logs.length > 0, `count=${logs.length}`);
const actions = new Set(logs.map((l) => l.action));
check('audit captured auth.login', actions.has('auth.login'), [...actions].join(','));
check('audit captured admin.created', actions.has('admin.created'), [...actions].join(','));
check('audit captured auth.logout', actions.has('auth.logout'), [...actions].join(','));
check('audit never contains password', !JSON.stringify(logs).toLowerCase().includes('password_hash'));

console.log('\n=== 27. WEBSITE SETTINGS VALIDATION ===');
r = await call('/super-admin/settings', { method: 'PUT', token: SA, body: { settings: { site_tagline: 'rbac test tagline' } } });
check('super admin updates setting -> 200', r.status === 200, `status=${r.status}`);
check('setting persisted', r.body?.data?.settings?.site_tagline === 'rbac test tagline', r.body?.data?.settings?.site_tagline);
r = await call('/super-admin/settings', { method: 'PUT', token: SA, body: { settings: { site_name: 'Velora' } } });
check('restore site_name -> 200', r.status === 200, `status=${r.status}`);
r = await call('/super-admin/settings', { method: 'PUT', token: SA, body: { settings: { hacked_column: 'x' } } });
check('non-allowlisted setting rejected -> 400', r.status === 400, `status=${r.status}`);

console.log('\n=== 28. GOOGLE OAUTH STILL CONFIGURED (not removed) ===');
r = await call('/auth/google');
const loc = r.status === 302 ? '' : '';
const googleRedirect = await fetch(`${API}/auth/google`, { redirect: 'manual' });
check('GET /auth/google -> 302 (redirects to Google, not 404)', googleRedirect.status === 302, `status=${googleRedirect.status}`);
const location = googleRedirect.headers.get('location') || '';
check('redirect targets accounts.google.com', location.includes('accounts.google.com'), location.slice(0, 120));

console.log('\n=== 29. FORGOT PASSWORD STILL WORKS ===');
r = await call('/auth/forgot-password', { method: 'POST', body: { email: 'customer@shopvanguard.com' } });
check('forgot password -> 200', r.status === 200, `status=${r.status}`);

console.log(`\n${'='.repeat(56)}`);
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log('='.repeat(56));
process.exit(fail > 0 ? 1 : 0);
