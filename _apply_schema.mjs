// Applies the role model + new management tables to the live database by
// running the same initDatabase() path the server uses.
import 'dotenv/config';
import { initDatabase, executeQuery } from './backend/config/db.js';

await initDatabase();

const tables = await executeQuery(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
);
console.log('TABLES:', tables.map((t) => t.name).join(', '));

const users = await executeQuery(
  'SELECT id, full_name, email, role, status, email_verified FROM users ORDER BY id'
);
console.log('\nUSERS:');
console.table(users);

const cols = await executeQuery('PRAGMA table_info(users)');
console.log('\nusers.role column type:', cols.find((c) => c.name === 'role')?.type);
