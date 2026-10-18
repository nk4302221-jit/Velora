// Applies the homepage category-navigation catalog seed to the configured
// database (MySQL, or the embedded SQLite fallback if MySQL is unreachable).
//
// Usage (from the backend directory):
//   node scripts/seed-nav-catalog.mjs
//
// Safe to run any number of times: seedNavCatalog() only inserts categories
// and products that are not already present, so it never duplicates rows.
import 'dotenv/config';
import { initDatabase } from '../config/db.js';

await initDatabase();
console.log('[Seed] Category-navigation catalog seed complete.');
process.exit(0);
