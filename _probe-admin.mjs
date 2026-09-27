import 'dotenv/config';
import jwt from 'jsonwebtoken';

const ACCOUNTS = {
  super_admin: { id: 1, email: 'admin@shopvanguard.com' },
  customer: { id: 2, email: 'customer@shopvanguard.com' },
};

const which = process.env.PROBE_ROLE || 'super_admin';
const acct = ACCOUNTS[which];
if (!acct) throw new Error(`unknown PROBE_ROLE ${which}`);

const token = jwt.sign(
  { id: acct.id, email: acct.email, role: which },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

export default async function run(page, ui) {
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[AdminRoute]') || t.includes('[Auth]') || t.includes('[AdminAPI]')) {
      logs.push(`${m.type()}: ${t}`);
    }
  });

  // Establish the origin, then plant the real signed JWT.
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['shopvanguard_token', token]
  );

  await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });

  // Wait for the guard to resolve, not a blind delay.
  await page
    .waitForFunction(
      () =>
        document.body.innerText.includes('Administrator') ||
        document.body.innerText.includes('Access Denied') ||
        document.body.innerText.includes('Dashboard'),
      { timeout: 20000 }
    )
    .catch(() => {});

  await page.waitForTimeout(2500);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 700));

  const probe = await page.evaluate(async () => {
    const t = localStorage.getItem('shopvanguard_token');
    const out = {};
    for (const p of [
      '/api/auth/me',
      '/api/admin/dashboard',
      '/api/admin/users',
      '/api/admin/orders',
      '/api/products/categories',
    ]) {
      try {
        const r = await fetch(p, { headers: { Authorization: `Bearer ${t}` } });
        out[p] = r.status;
      } catch (e) {
        out[p] = `ERR ${e.message}`;
      }
    }
    return out;
  });

  return {
    account: which,
    finalUrl: page.url(),
    probeStatus: probe,
    adminRouteLogs: logs,
    visibleText: bodyText,
  };
}
