// Cleanup for data created by the RBAC test harness. Run explicitly, not
// automatically: it only removes rows matching the test markers below.

// Load the project-root .env BEFORE importing db.js. db.js silently falls back
// to the embedded SQLite file when DB_HOST is unset, so without this the script
// happily "cleans" a database the running server never touches.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { executeQuery, getDialect } = await import('./backend/config/db.js');

const run = async () => {
  const dialect = await getDialect();
  console.log(`[DB] cleaning dialect=${dialect}`);

  if (dialect !== 'mysql') {
    console.warn(
      '[DB] WARNING: not connected to MySQL. The running server uses MySQL, so\n' +
        '            this cleanup would not touch the live data. Start MySQL and\n' +
        '            re-run, or set DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.'
    );
  }

  const testUsers = await executeQuery(
    `SELECT id, email, role FROM users
      WHERE email LIKE 'tmp.%'
         OR email LIKE 'temp@%'
         OR email LIKE 'temp_admin_%'
         OR email LIKE 'rbac_%'
         OR email LIKE 'deleted_admin_%'
         OR email LIKE 'revoked_%'
         OR email LIKE 'forged_%'`
  );
  console.log('test users found:', JSON.stringify(testUsers));

  for (const u of testUsers) {
    await executeQuery('DELETE FROM users WHERE id = ?', [u.id]);
  }

  const reviews = await executeQuery('SELECT id, comment FROM reviews');
  console.log('reviews:', JSON.stringify(reviews));

  const coupons = await executeQuery(
    "SELECT id, code FROM coupons WHERE code LIKE 'RBAC%' OR code LIKE 'TEST%' OR code LIKE 'rbac%'"
  );
  console.log('test coupons:', JSON.stringify(coupons));
  for (const c of coupons) {
    await executeQuery('DELETE FROM coupons WHERE id = ?', [c.id]);
  }

  const offers = await executeQuery(
    "SELECT id, title FROM offers WHERE title LIKE '%RBAC%' OR title LIKE '%rbac%' OR title LIKE '%Test%'"
  );
  console.log('test offers:', JSON.stringify(offers));
  for (const o of offers) {
    await executeQuery('DELETE FROM offers WHERE id = ?', [o.id]);
  }

  const cats = await executeQuery(
    "SELECT id, name FROM categories WHERE name LIKE '%RBAC%' OR name LIKE '%rbac%' OR name LIKE '%Test%'"
  );
  console.log('test categories:', JSON.stringify(cats));
  for (const c of cats) {
    await executeQuery('DELETE FROM categories WHERE id = ?', [c.id]);
  }

  const rets = await executeQuery('SELECT id, reason FROM returns');
  console.log('returns:', JSON.stringify(rets));

  // Early probe scripts left accounts behind. Real accounts (OAuth sign-ins,
  // manual sign-ups) are deliberately left untouched.
  const probes = await executeQuery(
    "SELECT id, email FROM users WHERE email LIKE 'apitest_%' OR email LIKE 'probe_%'"
  );
  console.log('probe accounts:', JSON.stringify(probes));
  for (const p of probes) {
    await executeQuery('DELETE FROM users WHERE id = ?', [p.id]);
  }

  // Revocation rows are throwaway once their tokens have expired.
  await executeQuery('DELETE FROM revoked_tokens');
  console.log('cleared revoked_tokens');

  // The harness mutates product 1's stock and writes a marker setting, so put
  // both back. These only ever ran against SQLite before, which is why MySQL
  // kept drifting further from the seeded values on every test run.
  const CANONICAL_STOCK = { 1: 45 };
  for (const [id, stock] of Object.entries(CANONICAL_STOCK)) {
    await executeQuery('UPDATE products SET stock = ? WHERE id = ?', [
      stock,
      id,
    ]);
  }
  console.log('restored canonical stock for product ids', Object.keys(CANONICAL_STOCK).join(', '));

  await executeQuery(
    "DELETE FROM website_settings WHERE setting_value LIKE '%rbac test%' OR setting_value LIKE '%RBAC test%'"
  );
  console.log('removed test website_settings values');

  console.log(
    'users remaining:',
    JSON.stringify(await executeQuery('SELECT id, email, role FROM users'))
  );

  console.log(
    'product 1 stock:',
    JSON.stringify(await executeQuery('SELECT id, stock FROM products WHERE id = 1'))
  );
  console.log(
    'settings:',
    JSON.stringify(await executeQuery('SELECT * FROM website_settings'))
  );

  process.exit(0);
};

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
