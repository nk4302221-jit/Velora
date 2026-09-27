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

for (const t of ['order_items', 'orders', 'payments', 'products', 'reviews']) {
  const [cols] = await pool.query(`SHOW COLUMNS FROM ${t}`);
  console.log(`${t}: ${cols.map((c) => c.Field).join(', ')}\n`);
}

await pool.end();
process.exit(0);
