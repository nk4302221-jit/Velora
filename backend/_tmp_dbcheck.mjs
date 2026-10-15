import mysql from "mysql2/promise";
const c = await mysql.createConnection({host:"localhost",port:3306,user:"root",password:"123456",database:"ecommerce_db"});
const [users] = await c.query("SELECT id, full_name, email, role, status, email_verified FROM users ORDER BY id LIMIT 50");
console.log("USERS:"); console.table(users);
const [orders] = await c.query("SELECT id, order_number, user_id, order_status, payment_status FROM orders ORDER BY id DESC LIMIT 20");
console.log("ORDERS:"); console.table(orders);
await c.end();
