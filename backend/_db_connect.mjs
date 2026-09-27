import fs from 'fs';
import mysql from 'mysql2/promise';

// Minimal .env parser (so we don't depend on dotenv being present)
function loadEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(String.raw`C:\Users\Nirbhay Kumar\OneDrive\Desktop\remix-nexus-e-commerce-engine (1)\.env`);
const pool = mysql.createPool({
  host: env.DB_HOST || 'localhost',
  port: Number(env.DB_PORT) || 3306,
  user: env.DB_USER || 'root',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'ecommerce_db',
  waitForConnections: true,
  connectionLimit: 2,
  connectTimeout: 5000,
  multipleStatements: true,
});

(async () => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok, DATABASE() AS db, VERSION() AS version');
    console.log('CONNECT OK -> db=' + rows[0].db + ' ver=' + rows[0].version);

    const [tables] = await pool.query(`SHOW TABLES LIKE 'payment_configs'`);
    console.log('payment_configs table exists:', tables.length > 0);

    const [ordersCols] = await pool.query(`SHOW COLUMNS FROM orders LIKE 'payment_method'`);
    const [orderNumCols] = await pool.query(`SHOW COLUMNS FROM orders LIKE 'order_number'`);
    console.log('orders.payment_method column:', ordersCols.length > 0);
    console.log('orders.order_number column:', orderNumCols.length > 0 conn ok);

    await pool.end();
    process.exit(ordersCols.length > 0 && orderNumCols.length > 0 && tables.length > 0 ? 0 : 3);
  } catch (e) {
    console.error('CONNECT FAILED:', e.code || e.message);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
})();
