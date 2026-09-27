// One-time local data correction + verification for the 3-role model.
//  - restores admin@shopvanguard.com to its original seeded 'admin' role
//  - ensures a dedicated super_admin account exists
//  - ensures a dedicated plain 'admin' account exists for role testing
// Idempotent: safe to re-run.
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

async function upsertAccount({ fullName, email, password, role, phone }) {
  const [existing] = await pool.query('SELECT id, role FROM users WHERE email = ?', [email]);

  if (existing.length > 0) {
    await pool.query('UPDATE users SET role = ?, status = ?, email_verified = 1 WHERE email = ?', [
      role,
      'active',
      email,
    ]);
    console.log(`  updated existing ${email} -> role=${role}`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, phone, role, email_verified, status)
     VALUES (?, ?, ?, ?, ?, 1, 'active')`,
    [fullName, email, hash, phone, role]
  );
  console.log(`  created ${email} -> role=${role}`);
}

console.log('Ensuring one account per role:');
await upsertAccount({
  fullName: 'System Administrator',
  email: 'admin@shopvanguard.com',
  password: 'Admin@123',
  role: 'admin',
  phone: '+1 (555) 019-2834',
});
await upsertAccount({
  fullName: 'Velora Super Admin',
  email: 'superadmin@velora.com',
  password: 'SuperAdmin@123',
  role: 'super_admin',
  phone: '+1 (555) 900-0001',
});
await upsertAccount({
  fullName: 'Sarah Jenkins',
  email: 'customer@shopvanguard.com',
  password: 'Customer@123',
  role: 'customer',
  phone: '+1 (555) 449-7120',
});

const [cols] = await pool.query('SHOW COLUMNS FROM users');
console.log('\nusers.role column type:', cols.find((c) => c.Field === 'role')?.Type);

const [rows] = await pool.query(
  "SELECT id, email, role, status FROM users WHERE role <> 'customer' ORDER BY id"
);
console.log('\nPrivileged accounts:');
console.table(rows);

const [counts] = await pool.query('SELECT role, COUNT(*) AS c FROM users GROUP BY role ORDER BY role');
console.log('role counts:', JSON.stringify(counts));

await pool.end();
process.exit(0);
