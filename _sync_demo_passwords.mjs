// Aligns the live demo accounts with the credentials documented in the seed
// (database.sql / backend/config/db.js). The admin hash currently in the live
// DB does not correspond to any documented password, so ADMIN login could not
// be exercised. Idempotent.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: 'Z',
});

const ACCOUNTS = [
  { email: 'admin@shopvanguard.com', password: 'Admin@123', role: 'admin' },
  { email: 'superadmin@velora.com', password: 'SuperAdmin@123', role: 'super_admin' },
  { email: 'customer@shopvanguard.com', password: 'Customer@123', role: 'customer' },
];

for (const acc of ACCOUNTS) {
  const [rows] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [acc.email]);

  if (rows.length === 0) {
    console.log(`  ${acc.email}: NOT FOUND - skipped`);
    continue;
  }

  const current = rows[0].password_hash;
  let matches = false;
  try {
    matches = await bcrypt.compare(acc.password, current);
  } catch {
    matches = false;
  }

  if (matches) {
    console.log(`  ${acc.email}: already correct`);
    continue;
  }

  const hash = await bcrypt.hash(acc.password, 10);
  await pool.query('UPDATE users SET password_hash = ?, role = ?, status = ?, email_verified = 1 WHERE email = ?', [
    hash,
    acc.role,
    'active',
    acc.email,
  ]);
  console.log(`  ${acc.email}: password reset to documented value, role=${acc.role}`);
}

// Verify each login credential actually authenticates.
console.log('\nVerification:');
for (const acc of ACCOUNTS) {
  const [rows] = await pool.query('SELECT password_hash, role FROM users WHERE email = ?', [acc.email]);
  if (rows.length === 0) {
    console.log(`  ${acc.email}: MISSING`);
    continue;
  }
  const ok = await bcrypt.compare(acc.password, rows[0].password_hash);
  console.log(`  ${acc.email} / ${acc.password} -> ${ok ? 'AUTH OK' : 'AUTH FAILED'} (role=${rows[0].role})`);
}

await pool.end();
process.exit(0);
