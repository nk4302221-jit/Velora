import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: 'Z',
});

const [cols] = await pool.query('SHOW COLUMNS FROM users');
console.log(
  'users columns:',
  cols.map((c) => `${c.Field}:${c.Type}`).join(', ')
);

const [rows] = await pool.query(
  `SELECT id, email, role, status, email_verified,
          HEX(role) AS role_hex, LENGTH(role) AS role_len
     FROM users
    WHERE email LIKE '%shopvanguard.com' OR role <> 'customer'`
);
console.log('\nmatching users:');
console.log(JSON.stringify(rows, null, 2));

const [counts] = await pool.query(
  'SELECT role, COUNT(*) AS c FROM users GROUP BY role'
);
console.log('\nrole counts:', JSON.stringify(counts));

const [enumRows] = await pool.query(
  `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
  [process.env.DB_NAME]
);
console.log('\nrole column type:', JSON.stringify(enumRows));

await pool.end();
