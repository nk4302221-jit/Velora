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

const dataSql = `
      SELECT
        u.id,
        u.full_name as name,
        u.email,
        u.phone,
        u.role,
        u.status,
        u.email_verified,
        u.avatar_url,
        u.created_at,
        p.name as membership_plan,
        s.expiry_time as membership_expiry,
        s.status as membership_status,
        (
          SELECT COUNT(*)
          FROM orders
          WHERE user_id = u.id
        ) as order_count
      FROM users u
      LEFT JOIN subscriptions s
        ON s.user_id = u.id
        AND s.status = 'active'
      LEFT JOIN plans p
        ON p.id = s.plan_id
      GROUP BY
        u.id, u.full_name, u.email, u.phone, u.role, u.status,
        u.email_verified, u.avatar_url, u.created_at,
        p.name, s.expiry_time, s.status
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
`;

const variants = [
  ['no filter', []],
  ['role filter', [' AND u.role = ?'.slice(0), 'admin']],
];

// plain
try {
  const [rows] = await pool.query(dataSql, [100, 0]);
  console.log('OK no-filter rows =', rows.length);
  console.log('sample:', JSON.stringify(rows.slice(0, 2), null, 2));
} catch (err) {
  console.log('FAILED:', err.code, err.message);
}

// with a role filter, to prove params still bind
try {
  const [rows] = await pool.query(
    dataSql.replace('GROUP BY', 'WHERE u.role = ? GROUP BY'),
    ['admin', 100, 0]
  );
  console.log('OK role-filter rows =', rows.length);
} catch (err) {
  console.log('role-filter FAILED:', err.code, err.message);
}

// membership filter path (references p.slug)
try {
  const [rows] = await pool.query(
    dataSql.replace(
      'GROUP BY',
      `WHERE (s.id IS NULL OR s.status != "active" OR s.expiry_time <= CURRENT_TIMESTAMP) GROUP BY`
    ),
    [100, 0]
  );
  console.log('OK membership-filter rows =', rows.length);
} catch (err) {
  console.log('membership-filter FAILED:', err.code, err.message);
}

await pool.end();
