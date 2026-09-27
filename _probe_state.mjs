import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/ecommerce.db');

const users = db
  .prepare('SELECT id, full_name, email, role, status, email_verified FROM users')
  .all();
console.log('USERS:');
console.table(users);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log('TABLES:', tables.join(', '));

console.log('\nusers columns:', db.prepare('PRAGMA table_info(users)').all().map((c) => `${c.name}:${c.type}`).join(', '));
