import 'dotenv/config';
import { executeQuery } from './backend/config/db.js';

const tables = await executeQuery(
  "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
);
console.log('TABLES:', tables.map((t) => t.t).join(', '));

const users = await executeQuery(
  'SELECT id, full_name, email, role, status, email_verified FROM users ORDER BY id'
);
console.log('\nUSERS:');
console.table(users);

const roleCol = await executeQuery(
  "SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'"
);
console.log('users.role column_type:', roleCol[0]?.column_type);
