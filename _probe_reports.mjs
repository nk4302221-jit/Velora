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

const [rows] = await pool.query(
  "SELECT id, email, role, password_hash FROM users WHERE email IN ('admin@shopvanguard.com','customer@shopvanguard.com')"
);

for (const u of rows) {
  console.log(`\n${u.email} (${u.role}) hash=${u.password_hash}`);
  for (const candidate of ['Admin@123', 'Customer@123', 'password', 'admin123']) {
    let match = false;
    try {
      match = await bcrypt.compare(candidate, u.password_hash);
    } catch (e) {
      console.log('  compare error:', e.message);
    }
    if (match) console.log(`  --> plaintext is "${candidate}"`);
  }
}

// Reproduce the failing reports queries one at a time.
const queries = [
  ['revenue', "SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE payment_status = 'paid'"],
  ['revenueByDay', `SELECT DATE(created_at) AS day, COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE payment_status = 'paid' GROUP BY DATE(created_at) ORDER BY day ASC LIMIT 30`],
  ['revenueByCategory', `SELECT p.category_name AS category, COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue, COALESCE(SUM(oi.quantity), 0) AS units FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category_name ORDER BY revenue DESC`],
  ['topProducts', `SELECT oi.product_id, oi.product_name, oi.product_image, COALESCE(SUM(oi.quantity), 0) AS units_sold, COALESCE(SUM(oi.total), 0) AS revenue FROM order_items oi GROUP BY oi.product_id, oi.product_name, oi.product_image ORDER BY units_sold DESC LIMIT 10`],
  ['customerStats', 'SELECT role, COUNT(*) AS count FROM users GROUP BY role'],
  ['orderStatusBreakdown', 'SELECT order_status, COUNT(*) AS count FROM orders GROUP BY order_status'],
  ['lowStock', `SELECT id, name, brand, stock, status FROM products WHERE stock <= 10 ORDER BY stock ASC LIMIT 10`],
];

for (const [label, sql] of queries) {
  try {
    const [res] = await pool.query(sql);
    console.log(`OK   ${label} (${res.length} rows)`);
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
  }
}

await pool.end();
process.exit(0);
