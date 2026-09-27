import 'dotenv/config';
import jwt from 'jsonwebtoken';

const mk = (id, email) =>
  jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });

const SA = mk(1, 'admin@shopvanguard.com');
const CU = mk(2, 'customer@shopvanguard.com');

const calls = [
  ['GET', '/api/admin/dashboard', SA],
  ['GET', '/api/admin/users', SA],
  ['GET', '/api/admin/users?limit=100', SA],
  ['GET', '/api/admin/orders', SA],
  ['GET', '/api/admin/orders?limit=100', SA],
  ['GET', '/api/admin/users/2', SA],
  ['GET', '/api/admin/payments/razorpay', SA],
  ['GET', '/api/admin/dashboard', CU],
  ['GET', '/api/admin/users', CU],
  ['GET', '/api/admin/orders', CU],
];

for (const [method, p, tok] of calls) {
  const r = await fetch(`http://127.0.0.1:5000${p}`, {
    method,
    headers: { Authorization: `Bearer ${tok}` },
  });
  const t = await r.text();
  const who = tok === SA ? 'super_admin' : 'customer ';
  console.log(
    `${who} ${r.status} ${method} ${p} :: ${t.slice(0, 110).replace(/\s+/g, ' ')}`
  );
}
