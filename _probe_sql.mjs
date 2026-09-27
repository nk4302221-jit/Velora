import 'dotenv/config';
import { executeQuery, initDatabase } from './backend/config/db.js';

await initDatabase();

const probes = [
  ['returns select', 'SELECT id, order_id, status FROM returns'],
  ['returns join', `SELECT r.id, o.order_number, u.full_name AS customer_name
       FROM returns r
       JOIN orders o ON o.id = r.order_id
       JOIN users u ON u.id = r.user_id
      ORDER BY r.requested_at DESC LIMIT 5`],
  ['returns count', 'SELECT COUNT(*) AS total FROM returns r'],
  ['reviews join', `SELECT r.id, p.name, u.full_name FROM reviews r
       JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id`],
  ['inventory summary', `SELECT COALESCE(SUM(stock),0) AS total_units, COUNT(*) AS n FROM products`],
  ['category counts', `SELECT c.id, c.name, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count FROM categories c`],
  ['revenue by category', `SELECT p.category_name AS category, COALESCE(SUM(oi.quantity*oi.price),0) AS revenue
       FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.category_name`],
  ['payments join', `SELECT p.id, u.full_name, o.order_number FROM payments p
       JOIN users u ON u.id = p.user_id LEFT JOIN orders o ON o.id = p.order_id LIMIT 5`],
  ['revenue by day', `SELECT DATE(created_at) AS day, COALESCE(SUM(total_amount),0) AS revenue
       FROM orders WHERE payment_status='paid' GROUP BY DATE(created_at) ORDER BY day ASC LIMIT 5`],
  ['audit select', 'SELECT id, action, actor_email FROM audit_logs ORDER BY id DESC LIMIT 5'],
  ['settings', 'SELECT setting_key, setting_value FROM website_settings'],
  ['low stock', 'SELECT id, name, stock FROM products WHERE stock <= 10 LIMIT 5'],
  ['order status breakdown', 'SELECT order_status, COUNT(*) AS count FROM orders GROUP BY order_status'],
  ['top products', `SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS units_sold
       FROM order_items oi GROUP BY oi.product_id, oi.product_name ORDER BY units_sold DESC LIMIT 3`],
  ['superadmin dash totals', `SELECT (SELECT COUNT(*) FROM users) AS tu, (SELECT COUNT(*) FROM audit_logs) AS ae`],
  ['membership join', `SELECT c.id, c.name, c.slug FROM categories c ORDER BY c.name ASC`],
];

for (const [label, sql] of probes) {
  try {
    const rows = await executeQuery(sql);
    console.log(`OK   ${label} (${rows.length} rows)`);
  } catch (e) {
    console.log(`FAIL ${label}: ${e.message}`);
  }
}

process.exit(0);
