// Read-only check that admin_permissions exists and the schema matches.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [rows] = await pool.query('SHOW COLUMNS FROM admin_permissions');
console.log('columns:', rows.map((r) => `${r.Field} ${r.Type} null=${r.Null} key=${r.Key} default=${r.Default}`));

const [idx] = await pool.query('SHOW INDEX FROM admin_permissions');
console.log('indexes:', idx.map((r) => `${r.Key_name}#${r.Seq_in_index}(${r.Column_name}) unique=${r.Non_unique === 0}`));

const [n] = await pool.query('SELECT COUNT(*) AS c FROM admin_permissions');
console.log('row count:', n[0].c);

await pool.end();