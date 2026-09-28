import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

let pool = null;
let sqliteDb = null;
let isSqlite = false;

// Ensure local data and uploads directory exist
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function initDatabase() {
  const dbHost = process.env.DB_HOST;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME || 'ecommerce_db';
  const dbPort = Number(process.env.DB_PORT) || 3306;

  // Try MySQL if explicitly configured and reachable
  if (dbHost && dbUser && dbHost !== 'none') {
    try {
      const tempPool = mysql.createPool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        timezone: 'Z',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 2000,
      });

      // Test connection
      await tempPool.query('SELECT 1');
      await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      tempPool.end();

      pool = mysql.createPool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        timezone: 'Z',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // Create the schema tables if this is a fresh MySQL database so that the
      // embedded SQLite path and the MySQL path stay feature-identical. The DDL
      // mirrors the SQLite schema from below (cross-engine compatible, no ENUM
      // restrictions so providers like 'razorpay' / 'cod' are always accepted).
      const ddlStatements = getMySqlSchemaStatements();
      for (const ddl of ddlStatements) {
        await pool.query(ddl);
      }

      // Seed demo data + apply the same best-effort migrations as SQLite.
      await seedInitialData();
      await migrateSchema();
      await ensureSuperAdmin();

      console.log(`[DB] Connected successfully to MySQL (${dbHost}:${dbPort}/${dbName})`);
      isSqlite = false;
      return;
    } catch (err) {
      console.warn(`[DB] MySQL not reachable at ${dbHost}:${dbPort}. Falling back to embedded relational SQLite database for zero-config operation:`, err.message);
    }
  }

  // SQLite relational fallback (native Node.js v22 DatabaseSync)
  isSqlite = true;
  const dbPath = path.join(dataDir, 'ecommerce.db');
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  console.log(`[DB] Using embedded relational database at ${dbPath}`);

  // Create SQLite tables matching schema
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      email_verified INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      active_plan_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      -- Optional OTP/PIN sign-in support. The phone column above is already the
      -- account's mobile number and is what mobile OTP/PIN login resolves
      -- against, so no separate mobile_number column is needed. Every column here
      -- is nullable or defaulted, so an account created before this feature keeps
      -- working unchanged and simply has no PIN.
      mobile_verified INTEGER NOT NULL DEFAULT 0,
      pin_hash TEXT,
      pin_enabled INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(provider, provider_user_id)
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      -- OTP bookkeeping. The token column holds the SHA-256 of the emailed
      -- 6-digit code (never the code itself) and expires_at is its 10-minute
      -- expiry, so the only columns this flow still needed are the attempt
      -- counter and the send timestamp that drives the 60s resend cooldown.
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      otp_last_sent_at DATETIME DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- =====================================================
    -- OTP / PIN SIGN-IN SUPPORT (optional login methods)
    --
    -- These three tables back the *additional* sign-in methods only. The
    -- existing email+password, Google and email-verification flows keep using
    -- their own tables and are untouched by anything stored here.
    -- =====================================================

      -- One-time codes for signing in (as opposed to verifying an address).
      -- The token column holds the SHA-256 of the 6-digit code, never the code
      -- itself, and is namespaced by user id + channel so a code sent to one
      -- destination can never verify another. One outstanding code per
      -- (user, channel).
    CREATE TABLE IF NOT EXISTS login_otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      otp_last_sent_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Brute-force brake for PIN sign-in, mirroring the OTP attempt counter.
    CREATE TABLE IF NOT EXISTS pin_login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until DATETIME DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Single-use, 10-minute permission to create a PIN. Issued only after a
    -- successful OTP verification, so a PIN can never be created from a session
    -- that was not proven with a one-time code. Shaped like
    -- password_reset_tokens: a random token, its hash, an expiry and a used flag.
    CREATE TABLE IF NOT EXISTS pin_setup_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category_id INTEGER,
      category_name TEXT NOT NULL,
      brand TEXT NOT NULL,
      price REAL NOT NULL,
      discount_price REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      product_image TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 0.0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(cart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlist(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(wishlist_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'United States',
      postal_code TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      address_id INTEGER,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0.0,
      shipping REAL NOT NULL DEFAULT 0.0,
      total_amount REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      order_status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT DEFAULT NULL,
      order_number TEXT DEFAULT NULL,
      stripe_session_id TEXT,
      stripe_payment_id TEXT,
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      currency TEXT NOT NULL DEFAULT 'INR',
      paid_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      provider TEXT NOT NULL DEFAULT 'stripe',
      payment_intent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0.0,
      duration_hours INTEGER NOT NULL,
      benefits TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiry_time DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      payment_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payment_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      key_id TEXT,
      key_secret_encrypted TEXT,
      environment TEXT NOT NULL DEFAULT 'test',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_email TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      user_id INTEGER,
      revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(product_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percentage',
      discount_value REAL NOT NULL DEFAULT 0,
      min_order_amount REAL NOT NULL DEFAULT 0,
      max_discount REAL DEFAULT NULL,
      usage_limit INTEGER DEFAULT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      starts_at DATETIME DEFAULT NULL,
      expires_at DATETIME DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      banner_image TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percentage',
      discount_value REAL NOT NULL DEFAULT 0,
      starts_at DATETIME DEFAULT NULL,
      ends_at DATETIME DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      refund_amount REAL DEFAULT NULL,
      admin_note TEXT,
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME DEFAULT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS website_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await seedInitialData();
  await migrateSchema();
  await ensureSuperAdmin();
}

/**
 * MySQL schema used for fresh databases. It mirrors the SQLite DDL below so both
 * engines expose the exact same tables/columns. Explicit ids are never stored,
 * AUTO_INCREMENT is used, and all enum-ish columns stay VARCHAR to keep every
 * value written by the application code valid across engines.
 */
function getMySqlSchemaStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(191) NOT NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      phone VARCHAR(32) NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer',
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      avatar_url TEXT NULL,
      active_plan_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      -- Optional OTP/PIN sign-in support. The phone column above is already the
      -- account's mobile number and is what mobile OTP/PIN login resolves
      -- against, so no separate mobile_number column is needed. Every column here
      -- is nullable or defaulted, so an account created before this feature keeps
      -- working unchanged and simply has no PIN.
      mobile_verified TINYINT(1) NOT NULL DEFAULT 0,
      pin_hash VARCHAR(255) NULL,
      pin_enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS social_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(30) NOT NULL,
      provider_user_id VARCHAR(191) NOT NULL,
      email VARCHAR(191) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_provider_uid (provider, provider_user_id),
      CONSTRAINT fk_social_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      otp_attempts INT NOT NULL DEFAULT 0,
      otp_last_sent_at DATETIME NULL DEFAULT NULL,
      CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // =====================================================
    // OTP / PIN SIGN-IN SUPPORT (optional login methods)
    // Mirrors the SQLite DDL above. The existing email+password, Google and
    // email-verification flows keep using their own tables untouched.
    // =====================================================

    `CREATE TABLE IF NOT EXISTS login_otp_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      channel VARCHAR(10) NOT NULL DEFAULT 'email',
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      otp_attempts INT NOT NULL DEFAULT 0,
      otp_last_sent_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_otp_user (user_id, channel),
      CONSTRAINT fk_loc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS pin_login_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      failed_attempts INT NOT NULL DEFAULT 0,
      locked_until DATETIME NULL DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pla_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS pin_setup_grants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_psg_user (user_id),
      CONSTRAINT fk_psg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT NULL,
      image_url TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      category_id INT NULL,
      category_name VARCHAR(100) NOT NULL,
      brand VARCHAR(100) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      discount_price DECIMAL(10, 2) NULL,
      stock INT NOT NULL DEFAULT 0,
      product_image TEXT NOT NULL,
      rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
      rating_count INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS cart (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cart_product (cart_id, product_id),
      CONSTRAINT fk_cartitems_cart FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
      CONSTRAINT fk_cartitems_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wishlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS wishlist_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      wishlist_id INT NOT NULL,
      product_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_wishlist_product (wishlist_id, product_id),
      CONSTRAINT fk_wishlistitems_wishlist FOREIGN KEY (wishlist_id) REFERENCES wishlist(id) ON DELETE CASCADE,
      CONSTRAINT fk_wishlistitems_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      full_name VARCHAR(191) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      address_line1 VARCHAR(255) NOT NULL,
      address_line2 VARCHAR(255) NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      country VARCHAR(100) NOT NULL DEFAULT 'United States',
      postal_code VARCHAR(20) NOT NULL,
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      address_id INT NULL,
      subtotal DECIMAL(10, 2) NOT NULL,
      discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      shipping DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(10, 2) NOT NULL,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      order_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_method VARCHAR(20) NULL,
      order_number VARCHAR(32) NULL,
      stripe_session_id VARCHAR(255) NULL,
      stripe_payment_id VARCHAR(255) NULL,
      razorpay_order_id VARCHAR(255) NULL,
      razorpay_payment_id VARCHAR(255) NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      paid_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_order_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      total DECIMAL(10, 2) NOT NULL,
      image_url TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_orderitems_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_orderitems_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NULL,
      user_id INT NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      provider VARCHAR(20) NOT NULL DEFAULT 'stripe',
      payment_intent_id VARCHAR(255) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      metadata TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      slug VARCHAR(50) NOT NULL UNIQUE,
      price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      duration_hours INT NOT NULL,
      benefits TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT NOT NULL,
      start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiry_time TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      payment_id VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS payment_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(50) NOT NULL UNIQUE,
      key_id TEXT NULL,
      key_secret_encrypted TEXT NULL,
      environment VARCHAR(20) NOT NULL DEFAULT 'test',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_id INT NULL,
      actor_email VARCHAR(191) NULL,
      actor_role VARCHAR(20) NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NULL,
      entity_id VARCHAR(64) NULL,
      details TEXT NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_actor (actor_id),
      INDEX idx_audit_action (action),
      INDEX idx_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti VARCHAR(64) NOT NULL,
      user_id INT NULL,
      revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      PRIMARY KEY (jti),
      INDEX idx_revoked_user (user_id),
      INDEX idx_revoked_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      user_id INT NOT NULL,
      rating INT NOT NULL,
      title VARCHAR(191) NULL,
      comment TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_review_product_user (product_id, user_id),
      CONSTRAINT fk_review_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_review_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
      min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
      max_discount DECIMAL(10, 2) NULL,
      usage_limit INT NULL,
      used_count INT NOT NULL DEFAULT 0,
      starts_at DATETIME NULL,
      expires_at DATETIME NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS offers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(191) NOT NULL,
      description TEXT NULL,
      banner_image TEXT NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0,
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      user_id INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'requested',
      refund_amount DECIMAL(10, 2) NULL,
      admin_note TEXT NULL,
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      CONSTRAINT fk_return_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_return_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_return_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS website_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
}

async function seedInitialData() {
  const usersCount = (await executeQuery('SELECT COUNT(*) as count FROM users'))[0]?.count || 0;
  if (usersCount > 0) return; // already seeded

  console.log('[DB] Seeding initial production data...');

  const adminHash = await bcrypt.hash('Admin@123', 10);
  const customerHash = await bcrypt.hash('Customer@123', 10);
  const superAdminHash = await bcrypt.hash('SuperAdmin@123', 10);

  // Seed Plans
  await executeQuery(
    `INSERT INTO plans (id, name, slug, price, duration_hours, benefits, status) VALUES 
     (1, 'Free Tier', 'free', 0.00, 1, ?, 'active'),
     (2, 'Silver Pass', 'silver', 9.99, 6, ?, 'active'),
     (3, 'Gold VIP Access', 'gold', 19.99, 12, ?, 'active')`,
    [
      JSON.stringify(['Standard browsing', 'Standard checkout', 'Community support', '1 hour active trial']),
      JSON.stringify(['Priority same-day processing', 'Extra 5% discount on all products', 'Exclusive early drops', '6 hours active duration']),
      JSON.stringify(['Zero shipping fees on all orders', 'Extra 12% discount on checkout', 'VIP 24/7 priority support', '12 hours elite duration', 'Reserved flash sales'])
    ]
  );

  // Seed Users
  // id 4 is the SUPER_ADMIN bootstrap account. Only a Super Admin may create
  // further admin accounts (POST /api/admin/users/admin).
  await executeQuery(
    `INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified, avatar_url, active_plan_id, status) VALUES 
     (1, 'System Administrator', 'admin@shopvanguard.com', ?, '+1 (555) 019-2834', 'admin', 1, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', 3, 'active'),
     (2, 'Sarah Jenkins', 'customer@shopvanguard.com', ?, '+1 (555) 449-7120', 'customer', 1, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80', 2, 'active'),
     (3, 'Marcus Vance', 'marcus@example.com', ?, '+1 (555) 782-9901', 'customer', 1, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', NULL, 'active'),
     (4, 'Velora Super Admin', 'superadmin@velora.com', ?, '+1 (555) 900-0001', 'super_admin', 1, 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80', 3, 'active')`,
    [adminHash, customerHash, customerHash, superAdminHash]
  );

  // Seed Categories
  await executeQuery(
    `INSERT INTO categories (id, name, slug, description, image_url) VALUES 
     (1, 'Electronics', 'electronics', 'Cutting-edge gadgets, computing, displays and audio tools', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'),
     (2, 'Audio & Sound', 'audio-sound', 'Studio headphones, high-fidelity earbuds, and spatial speakers', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80'),
     (3, 'Fashion & Apparel', 'fashion-apparel', 'Premium streetwear, minimal outerwear, and timeless everyday essentials', 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=800&auto=format&fit=crop&q=80'),
     (4, 'Fitness & Smart Gear', 'fitness-gear', 'Precision fitness trackers, smartwatches, and recovery equipment', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80'),
     (5, 'Home & Workspace', 'home-workspace', 'Ergonomic seating, studio ambient lighting, and minimalist desk gear', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80'),
     (6, 'Photography & Optic', 'photography', 'Mirrorless camera bodies, cinema lenses, and stabilizer gimbals', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80')`
  );

  // Seed Products (22 realistic products)
  const products = [
    [1, 'Sony WH-1000XM5 Noise Cancelling Headphones', 'Industry-leading noise cancellation optimized to your environment. 30-hour battery life with ultra-comfortable lightweight design and crystal-clear hands-free calling.', 2, 'Audio & Sound', 'Sony', 399.99, 349.99, 45, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80', 4.90, 312],
    [2, 'Apple MacBook Air 15-inch M3', 'Incredibly thin and fast laptop featuring the Apple M3 chip, stunning Liquid Retina display, up to 18 hours of battery life, 1080p FaceTime HD camera, and MagSafe 3 charging.', 1, 'Electronics', 'Apple', 1299.00, 1199.00, 28, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80', 4.95, 480],
    [3, 'Bose QuietComfort Ultra Earbuds', 'World-class spatial audio and breakthrough active noise cancellation engineered for immersive personalized listening in any environment.', 2, 'Audio & Sound', 'Bose', 299.00, 249.00, 60, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80', 4.82, 195],
    [4, 'Garmin Epix Pro Gen 2 Sapphire', 'High-performance GPS adventure smartwatch with a brilliant AMOLED display, built-in LED flashlight, multi-band GNSS, and endurance score tracking.', 4, 'Fitness & Smart Gear', 'Garmin', 899.99, 799.99, 18, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80', 4.88, 142],
    [5, 'Sony Alpha 7 IV Mirrorless Body', 'Groundbreaking 33MP full-frame Exmor R CMOS sensor, 4K 60p recording, 10-bit 4:2:2 color, and Real-time Eye AF for humans, animals, and birds.', 6, 'Photography & Optic', 'Sony', 2499.00, 2299.00, 12, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80', 4.92, 98],
    [6, 'Minimalist Matte Ceramic Table Lamp', 'Warm ambient architectural lighting with integrated stepless brass touch dimmer, linen shade, and warm 2700K optical LED cluster.', 5, 'Home & Workspace', 'Lumina', 149.00, 119.00, 50, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80', 4.75, 87],
    [7, 'Keychron Q1 Pro Wireless Mechanical Keyboard', 'CNC machined aluminum body, gasket mount design, hot-swappable switches, PBT keycaps, and customizable QMK/VIA key mappings.', 1, 'Electronics', 'Keychron', 199.00, 179.00, 35, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80', 4.85, 210],
    [8, 'Nike Air Zoom Pegasus 40', 'Engineered mesh upper with responsive React foam and dual Zoom Air units for a springy, energized feel across everyday distance miles.', 3, 'Fashion & Apparel', 'Nike', 140.00, 109.99, 85, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80', 4.78, 540],
    [9, 'Ergonomic Mesh Task Chair Pro', 'Dynamic lumbar support, 4D adjustable armrests, breathable elastomeric mesh, and heavy-duty synchronized tilt mechanism for all-day focus.', 5, 'Home & Workspace', 'HermanMiller Ref', 499.00, 429.00, 22, 'https://images.unsplash.com/photo-1580481077195-c328ad4f0612?w=800&auto=format&fit=crop&q=80', 4.91, 164],
    [10, 'Apple Watch Ultra 2 GPS + Cellular', 'Rugged 49mm titanium case, precision dual-frequency GPS, customizable Action button, 100m water resistance, and 3000-nit Retina display.', 4, 'Fitness & Smart Gear', 'Apple', 799.00, 749.00, 30, 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80', 4.94, 380],
    [11, 'Peak Design Everyday Backpack 20L', 'Award-winning versatile everyday pack featuring weatherproof 400D nylon canvas, dual side access, MagLatch hardware, and modular FlexFold dividers.', 3, 'Fashion & Apparel', 'Peak Design', 279.95, 249.95, 40, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80', 4.89, 290],
    [12, 'Dyson V15 Detect Cordless Vacuum', 'Engineered for deep whole-home cleaning with laser illumination that reveals invisible dust, piezo acoustic sensor, and 60 minutes run time.', 5, 'Home & Workspace', 'Dyson', 749.99, 649.99, 19, 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800&auto=format&fit=crop&q=80', 4.86, 175],
    [13, 'Logitech MX Master 3S Wireless Mouse', 'Iconic ergonomic performance mouse with quiet clicks, 8,000 DPI track-on-glass sensor, and MagSpeed electromagnetic scrolling wheel.', 1, 'Electronics', 'Logitech', 99.99, 89.99, 95, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&auto=format&fit=crop&q=80', 4.96, 620],
    [14, 'Theragun Pro G5 Percussive Therapy', 'Quiet commercial-grade deep muscle treatment device with OLED screen, 16mm amplitude, and 5 ergonomic speed settings for athletic recovery.', 4, 'Fitness & Smart Gear', 'Therabody', 599.00, 499.00, 16, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&auto=format&fit=crop&q=80', 4.79, 112],
    [15, 'DJI Mini 4 Pro Drone Fly More Combo', 'Sub-249g ultra-lightweight drone with omnidirectional obstacle sensing, 4K 60fps HDR video, 20km video transmission, and 34-min flight time.', 6, 'Photography & Optic', 'DJI', 1099.00, 999.00, 14, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80', 4.93, 230],
    [16, 'Sonos Move 2 Portable Smart Speaker', 'Upgraded acoustic architecture delivers spacious stereo sound anywhere. Up to 24 hours of continuous playback, IP56 weather resistance, and Wi-Fi/Bluetooth.', 2, 'Audio & Sound', 'Sonos', 449.00, 399.00, 26, 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80', 4.84, 150],
    [17, 'Patagonia Nano Puff Insulated Jacket', 'Warm, windproof, water-resistant jacket made with lightweight 60g PrimaLoft Gold Insulation Eco and 100% recycled polyester ripstop shell.', 3, 'Fashion & Apparel', 'Patagonia', 239.00, 199.00, 48, 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80', 4.87, 340],
    [18, 'Samsung 34-inch Odyssey OLED G8', 'Curved ultra-wide gaming monitor with 175Hz refresh rate, 0.03ms response time, Neo Quantum Processor, and mesmerizing CoreSync ambient lighting.', 1, 'Electronics', 'Samsung', 1199.99, 999.99, 15, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80', 4.88, 185],
    [19, 'Breville Barista Touch Espresso Machine', 'Automated touchscreen coffee machine with pre-programmed cafe drinks, thermoJet 3-second heat up, integrated conical burr grinder, and microfoam texturing.', 5, 'Home & Workspace', 'Breville', 999.95, 899.95, 10, 'https://images.unsplash.com/photo-1517668808822-9ebb02ae2a0e?w=800&auto=format&fit=crop&q=80', 4.90, 275],
    [20, 'Fujifilm X100V Compact Camera', 'Iconic everyday prime digital camera featuring the 26.1MP X-Trans CMOS 4 sensor, redesigned 23mm F2 lens, hybrid optical/electronic viewfinder.', 6, 'Photography & Optic', 'Fujifilm', 1399.00, 1349.00, 8, 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&auto=format&fit=crop&q=80', 4.97, 410],
    [21, 'Stanley Quencher H2.0 FlowState 40oz', 'Double-wall vacuum insulated stainless steel tumbler with ergonomic handle, reusable straw, and advanced FlowState lid for all-day hydration.', 4, 'Fitness & Smart Gear', 'Stanley', 45.00, 39.99, 120, 'https://images.unsplash.com/photo-1577705998148-6da4f3963bc8?w=800&auto=format&fit=crop&q=80', 4.76, 850],
    [22, 'Bellroy Transit Workpack 20L', 'Streamlined commuter daypack with dedicated 16-inch laptop pocket, quick-access sunglasses pocket, breathable contoured back panel, and water-resistant fabric.', 3, 'Fashion & Apparel', 'Bellroy', 189.00, 169.00, 38, 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800&auto=format&fit=crop&q=80', 4.83, 160]
  ];

  for (const p of products) {
    await executeQuery(
      `INSERT INTO products (id, name, description, category_id, category_name, brand, price, discount_price, stock, product_image, rating, rating_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      p
    );
  }

  // Seed default address for customer
  await executeQuery(
    `INSERT INTO addresses (id, user_id, full_name, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, is_default)
     VALUES (1, 2, 'Sarah Jenkins', '+1 (555) 449-7120', '742 Evergreen Terrace', 'Apt 4B', 'Springfield', 'Oregon', 'United States', '97477', 44.0462000, -123.0220000, 1)`
  );

  // Seed active Silver subscription for customer (expires 6 hours from now)
  const now = new Date();
  const expiry = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  await executeQuery(
    `INSERT INTO subscriptions (id, user_id, plan_id, start_time, expiry_time, status, payment_id)
     VALUES (1, 2, 2, CURRENT_TIMESTAMP, ?, 'active', 'sub_stripe_mock_seed_123')`,
    [expiry]
  );

  // Seed default cart & wishlist
  await executeQuery('INSERT INTO cart (id, user_id) VALUES (1, 2)');
  await executeQuery('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (1, 1, 1)');
  await executeQuery('INSERT INTO wishlist (id, user_id) VALUES (1, 2)');
  await executeQuery('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (1, 2)');

  console.log('[DB] Seeding completed successfully!');
}

/**
 * Guarantees the platform always has at least one SUPER_ADMIN account.
 *
 * Databases created before the 3-role model only ever had `admin` rows, so a
 * fresh install would otherwise have no way to reach the Super Admin portal.
 * This is idempotent and never demotes or modifies an existing account: it
 * only inserts when no super admin row exists yet.
 *
 * Set SEED_SUPER_ADMIN=false in .env to disable the bootstrap account in
 * environments where a super admin is provisioned out of band.
 */
async function ensureSuperAdmin() {
  try {
    // =====================================================
    // BOOTSTRAP GUARD
    //
    // This creates a real SUPER_ADMIN with a KNOWN default password, so it must
    // never switch itself on by accident. It runs only when explicitly opted in
    // with SEED_SUPER_ADMIN=true, and outside development it additionally
    // requires an explicit SEED_SUPER_ADMIN_PASSWORD so a deployment can never
    // end up with a publicly guessable super admin.
    // =====================================================
    if (String(process.env.SEED_SUPER_ADMIN).toLowerCase() !== 'true') {
      return;
    }

    const isProduction =
      String(process.env.NODE_ENV).toLowerCase() === 'production';

    const configuredPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;

    if (isProduction && !configuredPassword) {
      console.warn(
        '[DB] Super Admin bootstrap refused: NODE_ENV=production requires an explicit ' +
          'SEED_SUPER_ADMIN_PASSWORD. Provision the first Super Admin out of band instead.'
      );
      return;
    }

    const existing = await executeQuery(
      "SELECT id FROM users WHERE LOWER(TRIM(role)) = 'super_admin' LIMIT 1"
    );

    if (existing && existing.length > 0) {
      return;
    }

    const email = (process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@velora.com')
      .toLowerCase()
      .trim();
    const password = configuredPassword || 'SuperAdmin@123';

    const alreadyTaken = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (alreadyTaken && alreadyTaken.length > 0) {
      console.warn(
        `[DB] Super Admin bootstrap skipped - ${email} already exists but is not a super_admin. ` +
          'Promote it manually with: UPDATE users SET role = \'super_admin\' WHERE email = ?'
      );
      return;
    }

    const hash = await bcrypt.hash(password, 10);

    await executeQuery(
      `INSERT INTO users (full_name, email, password_hash, phone, role, email_verified, avatar_url, active_plan_id, status)
       VALUES (?, ?, ?, ?, 'super_admin', 1, ?, 3, 'active')`,
      [
        'Velora Super Admin',
        email,
        hash,
        '+1 (555) 900-0001',
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
      ]
    );

    console.log(
      `[DB] Bootstrapped SUPER_ADMIN account "${email}". ` +
        'Change this password immediately in a production deployment.'
    );
  } catch (err) {
    console.warn('[DB] Super Admin bootstrap warning:', err.message);
  }
}

/**
 * Best-effort schema migration for databases created before this schema
 * version added payment_method / order_number / razorpay columns to orders,
 * before email verification moved from a long token to a 6-digit OTP, and
 * before the optional OTP/PIN sign-in columns were added to users.
 */
async function migrateSchema() {
  try {
    // SQLite requires per-column introspection via PRAGMA
    if (isSqlite) {
      const cols = await executeQuery('PRAGMA table_info(orders)');
      const names = cols.map((c) => c.name);
      const sqliteAdditions = [];
      if (!names.includes('payment_method')) sqliteAdditions.push("ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT NULL");
      if (!names.includes('order_number')) sqliteAdditions.push("ALTER TABLE orders ADD COLUMN order_number TEXT DEFAULT NULL");
      if (!names.includes('razorpay_order_id')) sqliteAdditions.push("ALTER TABLE orders ADD COLUMN razorpay_order_id TEXT DEFAULT NULL");
      if (!names.includes('razorpay_payment_id')) sqliteAdditions.push("ALTER TABLE orders ADD COLUMN razorpay_payment_id TEXT DEFAULT NULL");
      if (!names.includes('currency')) sqliteAdditions.push("ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'");
      if (!names.includes('paid_at')) sqliteAdditions.push('ALTER TABLE orders ADD COLUMN paid_at DATETIME DEFAULT NULL');
      for (const stmt of sqliteAdditions) {
        await executeQuery(stmt);
        console.log(`[DB] Migration: applied -> ${stmt}`);
      }

      // Email verification OTP bookkeeping. The stored code itself reuses the
      // existing `token` / `expires_at` / `used` columns, so only the attempt
      // counter and the cooldown timestamp are new.
      const evtCols = (await executeQuery('PRAGMA table_info(email_verification_tokens)')).map((c) => c.name);
      const evtAdditions = [];
      if (!evtCols.includes('otp_attempts')) evtAdditions.push('ALTER TABLE email_verification_tokens ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0');
      if (!evtCols.includes('otp_last_sent_at')) evtAdditions.push('ALTER TABLE email_verification_tokens ADD COLUMN otp_last_sent_at DATETIME DEFAULT NULL');
      for (const stmt of evtAdditions) {
        await executeQuery(stmt);
        console.log(`[DB] Migration: applied -> ${stmt}`);
      }

      // Optional OTP/PIN sign-in columns on users. Every addition is nullable or
      // carries a default, so existing rows are left exactly as they are and keep
      // signing in with email+password / Google exactly as before. `phone` is
      // deliberately reused as the mobile number rather than adding a duplicate
      // mobile_number column.
      const userCols = (await executeQuery('PRAGMA table_info(users)')).map((c) => c.name);
      const userAdditions = [];
      if (!userCols.includes('mobile_verified')) userAdditions.push('ALTER TABLE users ADD COLUMN mobile_verified INTEGER NOT NULL DEFAULT 0');
      if (!userCols.includes('pin_hash')) userAdditions.push('ALTER TABLE users ADD COLUMN pin_hash TEXT');
      if (!userCols.includes('pin_enabled')) userAdditions.push('ALTER TABLE users ADD COLUMN pin_enabled INTEGER NOT NULL DEFAULT 0');
      for (const stmt of userAdditions) {
        await executeQuery(stmt);
        console.log(`[DB] Migration: applied -> ${stmt}`);
      }

      return;
    }

    // MySQL engine: probe then add columns if missing
    const mysqlMigrations = [
      ['payment_method', 'VARCHAR(20) DEFAULT NULL'],
      ['order_number', 'VARCHAR(32) DEFAULT NULL'],
      ['razorpay_order_id', 'VARCHAR(255) DEFAULT NULL'],
      ['razorpay_payment_id', 'VARCHAR(255) DEFAULT NULL'],
      ['currency', "VARCHAR(10) NOT NULL DEFAULT 'INR'"],
      ['paid_at', 'TIMESTAMP NULL DEFAULT NULL'],
    ];
    for (const [col, ddl] of mysqlMigrations) {
      try {
        await executeQuery(`SELECT ${col} FROM orders LIMIT 1`);
      } catch {
        await executeQuery(`ALTER TABLE orders ADD COLUMN ${col} ${ddl}`);
        console.log(`[DB] Migration: added orders.${col}`);
      }
    }

    // Same probe-then-add for the verification table. Existing rows keep their
    // data: the new columns are nullable / defaulted, and rows written before
    // the OTP flow have otp_last_sent_at = NULL, which the OTP lookup treats as
    // "not an OTP row" so a stale long token can never be matched by a code.
    const otpMigrations = [
      ['otp_attempts', 'INT NOT NULL DEFAULT 0'],
      ['otp_last_sent_at', 'DATETIME NULL DEFAULT NULL'],
    ];
    for (const [col, ddl] of otpMigrations) {
      try {
        await executeQuery(`SELECT ${col} FROM email_verification_tokens LIMIT 1`);
      } catch {
        await executeQuery(`ALTER TABLE email_verification_tokens ADD COLUMN ${col} ${ddl}`);
        console.log(`[DB] Migration: added email_verification_tokens.${col}`);
      }
    }

    // Optional OTP/PIN sign-in columns on users. Same probe-then-add as above:
    // every addition is nullable or carries a default, so existing rows keep
    // their data and keep signing in with email+password / Google exactly as
    // before. `phone` is deliberately reused as the mobile number rather than
    // adding a duplicate mobile_number column.
    const userColumnMigrations = [
      ['mobile_verified', 'TINYINT(1) NOT NULL DEFAULT 0'],
      ['pin_hash', 'VARCHAR(255) NULL DEFAULT NULL'],
      ['pin_enabled', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ];
    for (const [col, ddl] of userColumnMigrations) {
      try {
        await executeQuery(`SELECT ${col} FROM users LIMIT 1`);
      } catch {
        await executeQuery(`ALTER TABLE users ADD COLUMN ${col} ${ddl}`);
        console.log(`[DB] Migration: added users.${col}`);
      }
    }

    // A users.role column created as ENUM('customer','admin') silently rejects
    // 'super_admin'. Widen it to the full 3-role set before anything writes it.
    try {
      const [roleRows] = await pool.query(
        "SELECT COLUMN_TYPE as column_type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'",
        [process.env.DB_NAME || 'ecommerce_db']
      );

      const columnType = String(roleRows?.[0]?.column_type || '');

      if (/^enum/i.test(columnType) && !/super_admin/i.test(columnType)) {
        await pool.query(
          "ALTER TABLE users MODIFY COLUMN role ENUM('customer','admin','super_admin') NOT NULL DEFAULT 'customer'"
        );
        console.log('[DB] Migration: widened users.role ENUM to include super_admin');
      }
    } catch (err) {
      console.warn('[DB] users.role migration warning:', err.message);
    }

    return;
  } catch (err) {
    console.warn('[DB] Schema migration warning:', err.message);
  }
}

/**
 * Which engine is actually in use, resolved by connecting if needed.
 *
 * db.js silently falls back to the embedded SQLite file when MySQL is
 * unreachable. Scripts that report on "the database" must be able to tell the
 * two apart, otherwise they will cheerfully clean or verify a store the server
 * never reads.
 */
export async function getDialect() {
  if (!pool && !sqliteDb) {
    await initDatabase();
  }

  return isSqlite ? 'sqlite' : 'mysql';
}

/**
 * Executes a parameterized SQL query across MySQL or SQLite seamlessly.
 * Always returns an array of result objects for SELECT queries,
 * or an object with insertId/affectedRows for INSERT/UPDATE/DELETE.
 */
export async function executeQuery(sql, params = []) {
  if (!pool && !sqliteDb) {
    await initDatabase();
  }

  if (pool && !isSqlite) {
    // MySQL query
    const [result] = await pool.query(sql, params);
    return result;
  }

  // SQLite execution
  try {
    const trimmedSql = sql.trim();
    const isSelect = /^(SELECT|PRAGMA)/i.test(trimmedSql);

    // Normalize parameter placeholders: MySQL uses ? which SQLite DatabaseSync also supports!
    const stmt = sqliteDb.prepare(trimmedSql);

    if (isSelect) {
      return stmt.all(...params);
    } else {
      const info = stmt.run(...params);
      return {
        insertId: Number(info.lastInsertRowid),
        affectedRows: Number(info.changes),
      };
    }
  } catch (error) {
    console.error('[DB Query Error]:', error.message, 'SQL:', sql, 'Params:', params);
    throw error;
  }
}

export { isSqlite };
export default { executeQuery, initDatabase };
