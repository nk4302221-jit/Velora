-- ============================================================
-- Velora E-Commerce Database Schema
-- Compatible with MySQL 8.0+ / MariaDB / Relational SQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS ecommerce_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ecommerce_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    phone VARCHAR(20) NULL,
    role ENUM('customer', 'admin', 'super_admin') NOT NULL DEFAULT 'customer',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT NULL,
    active_plan_id INT NULL,
    -- 'blocked' is what PATCH /api/admin/users/:id/status and
    -- PATCH /api/super-admin/admins/:id/status accept (both validate against
    -- active|inactive|blocked), so a fresh install must be able to store it.
    status ENUM('active', 'inactive', 'blocked', 'suspended') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_email (email),
    INDEX idx_user_role (role),
    INDEX idx_user_status (status)
) ENGINE=InnoDB;

-- 2. Social Accounts Table (Google / Facebook OAuth)
CREATE TABLE IF NOT EXISTS social_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider ENUM('google', 'facebook') NOT NULL,
    provider_user_id VARCHAR(191) NOT NULL,
    email VARCHAR(191) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_provider_uid (provider, provider_user_id),
    INDEX idx_social_user (user_id)
) ENGINE=InnoDB;

-- 3. Email Verification Tokens Table
-- `token` stores the SHA-256 hash of the emailed 6-digit OTP - never the code
-- itself - and `expires_at` is its 10-minute lifetime. `otp_attempts` caps
-- wrong guesses at 5, `otp_last_sent_at` drives the 60-second resend cooldown.
-- Rows with otp_last_sent_at = NULL were written by the previous long-token
-- flow and are ignored by the OTP lookup.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    otp_attempts INT NOT NULL DEFAULT 0,
    otp_last_sent_at DATETIME NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token)
) ENGINE=InnoDB;

-- 3b. Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token_hash)
) ENGINE=InnoDB;

-- 4. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    image_url TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. Products Table
CREATE TABLE IF NOT EXISTS products (
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
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_product_category (category_name),
    INDEX idx_product_brand (brand),
    INDEX idx_product_price (price),
    INDEX idx_product_status (status)
) ENGINE=InnoDB;

-- 6. Cart Table
CREATE TABLE IF NOT EXISTS cart (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Cart Items Table
CREATE TABLE IF NOT EXISTS cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cart_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_cart_product (cart_id, product_id)
) ENGINE=InnoDB;

-- 8. Wishlist Table
CREATE TABLE IF NOT EXISTS wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. Wishlist Items Table
CREATE TABLE IF NOT EXISTS wishlist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wishlist_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wishlist_id) REFERENCES wishlist(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_wishlist_product (wishlist_id, product_id)
) ENGINE=InnoDB;

-- 10. Delivery Addresses Table (with Google Maps Lat/Lng)
CREATE TABLE IF NOT EXISTS addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255) NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'United States',
    postal_code VARCHAR(20) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_address_user (user_id)
) ENGINE=InnoDB;

-- 11. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    address_id INT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    shipping DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    order_status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
    payment_method ENUM('razorpay', 'stripe', 'cod') NOT NULL DEFAULT 'razorpay',
    order_number VARCHAR(32) NULL,
    stripe_session_id VARCHAR(255) NULL,
    stripe_payment_id VARCHAR(255) NULL,
    razorpay_order_id VARCHAR(255) NULL,
    razorpay_payment_id VARCHAR(255) NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    paid_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL,
    INDEX idx_order_user (user_id),
    INDEX idx_order_status (order_status),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB;

-- 12. Order Items Table (stores price at moment of purchase)
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    image_url TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    INDEX idx_order_item_order (order_id)
) ENGINE=InnoDB;

-- 13. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    provider VARCHAR(20) NOT NULL DEFAULT 'razorpay',
    payment_intent_id VARCHAR(255) NULL,
    status ENUM('pending', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
    metadata TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_payment_order (order_id)
) ENGINE=InnoDB;

-- 14. Membership / Pricing Plans Table
CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    duration_hours INT NOT NULL,
    benefits TEXT NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 15. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_time TIMESTAMP NOT NULL,
    status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
    payment_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
    INDEX idx_sub_user (user_id),
    INDEX idx_sub_status (status),
    INDEX idx_sub_expiry (expiry_time)
) ENGINE=InnoDB;

-- 16. Payment Gateway Configuration (Razorpay/Stripe keys stored encrypted server-side)
CREATE TABLE IF NOT EXISTS payment_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL UNIQUE,
    key_id TEXT NULL,
    key_secret_encrypted TEXT NULL,
    environment VARCHAR(20) NOT NULL DEFAULT 'test',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 17. Audit Logs Table (Super Admin visibility into privileged actions)
CREATE TABLE IF NOT EXISTS audit_logs (
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
) ENGINE=InnoDB;

-- 18. Product Reviews & Ratings
CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL,
    title VARCHAR(191) NULL,
    comment TEXT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_review_product_user (product_id, user_id)
) ENGINE=InnoDB;

-- 19. Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    max_discount DECIMAL(10, 2) NULL,
    usage_limit INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    starts_at DATETIME NULL,
    expires_at DATETIME NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 20. Offers / Promotions Table
CREATE TABLE IF NOT EXISTS offers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(191) NOT NULL,
    description TEXT NULL,
    banner_image TEXT NULL,
    discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 21. Return / Refund Requests
CREATE TABLE IF NOT EXISTS returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    user_id INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('requested', 'approved', 'rejected', 'refunded') NOT NULL DEFAULT 'requested',
    refund_amount DECIMAL(10, 2) NULL,
    admin_note TEXT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_return_order (order_id)
) ENGINE=InnoDB;

-- 22. Website Settings (editable by Super Admin only)
CREATE TABLE IF NOT EXISTS website_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Categories
INSERT INTO categories (id, name, slug, description, image_url) VALUES
(1, 'Electronics', 'electronics', 'Cutting-edge gadgets, audio, laptops and smart displays', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'),
(2, 'Audio & Sound', 'audio-sound', 'Studio headphones, high-fidelity earbuds, and spatial speakers', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80'),
(3, 'Fashion & Apparel', 'fashion-apparel', 'Premium streetwear, minimal outerwear, and timeless everyday essentials', 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?w=800&auto=format&fit=crop&q=80'),
(4, 'Fitness & Smart Gear', 'fitness-gear', 'Precision fitness trackers, smartwatches, and recovery equipment', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80'),
(5, 'Home & Workspace', 'home-workspace', 'Ergonomic seating, studio ambient lighting, and minimalist desk gear', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80'),
(6, 'Photography & Optic', 'photography', 'Mirrorless camera bodies, cinema lenses, and stabilizer gimbals', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Plans (Free: 1 hr, Silver: 6 hrs, Gold: 12 hrs)
INSERT INTO plans (id, name, slug, price, duration_hours, benefits, status) VALUES
(1, 'Free Tier', 'free', 0.00, 1, '["Standard product browsing", "Standard checkout", "Community support", "1 hour active trial"]', 'active'),
(2, 'Silver Pass', 'silver', 9.99, 6, '["Priority same-day processing", "Extra 5% discount on all products", "Exclusive early-drop catalog access", "6 hours active premium"]', 'active'),
(3, 'Gold VIP Access', 'gold', 19.99, 12, '["Zero shipping fees on all orders", "Extra 12% discount on checkout", "VIP 24/7 dedicated support", "12 hours elite access", "Early flash sale reservations"]', 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Default Users (Passwords hashed with bcrypt, cost 10)
--  - superadmin@velora.com  / SuperAdmin@123   (SUPER_ADMIN - highest privilege)
--  - admin@shopvanguard.com / Admin@123        (ADMIN)
--  - customer@shopvanguard.com / Customer@123  (CUSTOMER)
-- Only a SUPER_ADMIN may create further admin accounts (POST /api/admin/users/admin).
INSERT INTO users (id, full_name, email, password_hash, phone, role, email_verified, avatar_url, active_plan_id, status) VALUES
(1, 'System Administrator', 'admin@shopvanguard.com', '$2b$10$VUfq.guZ57f4KScBZ/kbZe5wbDzO7VxrF5q9AdRZJzstfO6XlHoOW', '+1 (555) 019-2834', 'admin', 1, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', 3, 'active'),
(2, 'Sarah Jenkins', 'customer@shopvanguard.com', '$2b$10$wDviEOsCXTOe0Wpg37K0Q.NYV8oWPywBRS89.53eFT/pIeywxZ3DS', '+1 (555) 449-7120', 'customer', 1, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80', 2, 'active'),
(3, 'Marcus Vance', 'marcus@example.com', '$2b$10$wDviEOsCXTOe0Wpg37K0Q.NYV8oWPywBRS89.53eFT/pIeywxZ3DS', '+1 (555) 782-9901', 'customer', 1, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', NULL, 'active'),
(4, 'Velora Super Admin', 'superadmin@velora.com', '$2b$10$kz5ZR3./hW20WJoAQ9Dsz.Srs0nSu74vE82c87NcqGVAuU96QagQq', '+1 (555) 900-0001', 'super_admin', 1, 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80', 3, 'active')
ON DUPLICATE KEY UPDATE email=VALUES(email);

-- Products (At least 20 realistic products with rich fields)
INSERT INTO products (id, name, description, category_id, category_name, brand, price, discount_price, stock, product_image, rating, rating_count, status) VALUES
(1, 'Sony WH-1000XM5 Noise Cancelling Headphones', 'Industry-leading noise cancellation optimized to your environment. 30-hour battery life with ultra-comfortable lightweight design and crystal-clear hands-free calling.', 2, 'Audio & Sound', 'Sony', 399.99, 349.99, 45, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80', 4.90, 312, 'active'),
(2, 'Apple MacBook Air 15-inch M3', 'Incredibly thin and fast laptop featuring the Apple M3 chip, stunning Liquid Retina display, up to 18 hours of battery life, 1080p FaceTime HD camera, and MagSafe 3 charging.', 1, 'Electronics', 'Apple', 1299.00, 1199.00, 28, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80', 4.95, 480, 'active'),
(3, 'Bose QuietComfort Ultra Earbuds', 'World-class spatial audio and breakthrough active noise cancellation engineered for immersive personalized listening in any environment.', 2, 'Audio & Sound', 'Bose', 299.00, 249.00, 60, 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80', 4.82, 195, 'active'),
(4, 'Garmin Epix Pro Gen 2 Sapphire', 'High-performance GPS adventure smartwatch with a brilliant AMOLED display, built-in LED flashlight, multi-band GNSS, and endurance score tracking.', 4, 'Fitness & Smart Gear', 'Garmin', 899.99, 799.99, 18, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80', 4.88, 142, 'active'),
(5, 'Sony Alpha 7 IV Mirrorless Body', 'Groundbreaking 33MP full-frame Exmor R CMOS sensor, 4K 60p recording, 10-bit 4:2:2 color, and Real-time Eye AF for humans, animals, and birds.', 6, 'Photography & Optic', 'Sony', 2499.00, 2299.00, 12, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80', 4.92, 98, 'active'),
(6, 'Minimalist Matte Ceramic Table Lamp', 'Warm ambient architectural lighting with integrated stepless brass touch dimmer, linen shade, and warm 2700K optical LED cluster.', 5, 'Home & Workspace', 'Lumina', 149.00, 119.00, 50, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80', 4.75, 87, 'active'),
(7, 'Keychron Q1 Pro Wireless Mechanical Keyboard', 'CNC machined aluminum body, gasket mount design, hot-swappable switches, PBT keycaps, and customizable QMK/VIA key mappings.', 1, 'Electronics', 'Keychron', 199.00, 179.00, 35, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80', 4.85, 210, 'active'),
(8, 'Nike Air Zoom Pegasus 40', 'Engineered mesh upper with responsive React foam and dual Zoom Air units for a springy, energized feel across everyday distance miles.', 3, 'Fashion & Apparel', 'Nike', 140.00, 109.99, 85, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80', 4.78, 540, 'active'),
(9, 'Ergonomic Mesh Task Chair Pro', 'Dynamic lumbar support, 4D adjustable armrests, breathable elastomeric mesh, and heavy-duty synchronized tilt mechanism for all-day focus.', 5, 'Home & Workspace', 'HermanMiller Ref', 499.00, 429.00, 22, 'https://images.unsplash.com/photo-1580481077195-c328ad4f0612?w=800&auto=format&fit=crop&q=80', 4.91, 164, 'active'),
(10, 'Apple Watch Ultra 2 GPS + Cellular', 'Rugged 49mm titanium case, precision dual-frequency GPS, customizable Action button, 100m water resistance, and 3000-nit Retina display.', 4, 'Fitness & Smart Gear', 'Apple', 799.00, 749.00, 30, 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80', 4.94, 380, 'active'),
(11, 'Peak Design Everyday Backpack 20L', 'Award-winning versatile everyday pack featuring weatherproof 400D nylon canvas, dual side access, MagLatch hardware, and modular FlexFold dividers.', 3, 'Fashion & Apparel', 'Peak Design', 279.95, 249.95, 40, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80', 4.89, 290, 'active'),
(12, 'Dyson V15 Detect Cordless Vacuum', 'Engineered for deep whole-home cleaning with laser illumination that reveals invisible dust, piezo acoustic sensor, and 60 minutes run time.', 5, 'Home & Workspace', 'Dyson', 749.99, 649.99, 19, 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800&auto=format&fit=crop&q=80', 4.86, 175, 'active'),
(13, 'Logitech MX Master 3S Wireless Mouse', 'Iconic ergonomic performance mouse with quiet clicks, 8,000 DPI track-on-glass sensor, and MagSpeed electromagnetic scrolling wheel.', 1, 'Electronics', 'Logitech', 99.99, 89.99, 95, 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&auto=format&fit=crop&q=80', 4.96, 620, 'active'),
(14, 'Theragun Pro G5 Percussive Therapy', 'Quiet commercial-grade deep muscle treatment device with OLED screen, 16mm amplitude, and 5 ergonomic speed settings for athletic recovery.', 4, 'Fitness & Smart Gear', 'Therabody', 599.00, 499.00, 16, 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&auto=format&fit=crop&q=80', 4.79, 112, 'active'),
(15, 'DJI Mini 4 Pro Drone Fly More Combo', 'Sub-249g ultra-lightweight drone with omnidirectional obstacle sensing, 4K 60fps HDR video, 20km video transmission, and 34-min flight time.', 6, 'Photography & Optic', 'DJI', 1099.00, 999.00, 14, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80', 4.93, 230, 'active'),
(16, 'Sonos Move 2 Portable Smart Speaker', 'Upgraded acoustic architecture delivers spacious stereo sound anywhere. Up to 24 hours of continuous playback, IP56 weather resistance, and Wi-Fi/Bluetooth.', 2, 'Audio & Sound', 'Sonos', 449.00, 399.00, 26, 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80', 4.84, 150, 'active'),
(17, 'Patagonia Nano Puff Insulated Jacket', 'Warm, windproof, water-resistant jacket made with lightweight 60g PrimaLoft Gold Insulation Eco and 100% recycled polyester ripstop shell.', 3, 'Fashion & Apparel', 'Patagonia', 239.00, 199.00, 48, 'https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80', 4.87, 340, 'active'),
(18, 'Samsung 34-inch Odyssey OLED G8', 'Curved ultra-wide gaming monitor with 175Hz refresh rate, 0.03ms response time, Neo Quantum Processor, and mesmerizing CoreSync ambient lighting.', 1, 'Electronics', 'Samsung', 1199.99, 999.99, 15, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80', 4.88, 185, 'active'),
(19, 'Breville Barista Touch Espresso Machine', 'Automated touchscreen coffee machine with pre-programmed cafe drinks, thermoJet 3-second heat up, integrated conical burr grinder, and microfoam texturing.', 5, 'Home & Workspace', 'Breville', 999.95, 899.95, 10, 'https://images.unsplash.com/photo-1517668808822-9ebb02ae2a0e?w=800&auto=format&fit=crop&q=80', 4.90, 275, 'active'),
(20, 'Fujifilm X100V Compact Camera', 'Iconic everyday prime digital camera featuring the 26.1MP X-Trans CMOS 4 sensor, redesigned 23mm F2 lens, hybrid optical/electronic viewfinder.', 6, 'Photography & Optic', 'Fujifilm', 1399.00, 1349.00, 8, 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&auto=format&fit=crop&q=80', 4.97, 410, 'active'),
(21, 'Stanley Quencher H2.0 FlowState 40oz', 'Double-wall vacuum insulated stainless steel tumbler with ergonomic handle, reusable straw, and advanced FlowState lid for all-day hydration.', 4, 'Fitness & Smart Gear', 'Stanley', 45.00, 39.99, 120, 'https://images.unsplash.com/photo-1577705998148-6da4f3963bc8?w=800&auto=format&fit=crop&q=80', 4.76, 850, 'active'),
(22, 'Bellroy Transit Workpack 20L', 'Streamlined commuter daypack with dedicated 16-inch laptop pocket, quick-access sunglasses pocket, breathable contoured back panel, and water-resistant fabric.', 3, 'Fashion & Apparel', 'Bellroy', 189.00, 169.00, 38, 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800&auto=format&fit=crop&q=80', 4.83, 160, 'active')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Default delivery address for customer
INSERT INTO addresses (id, user_id, full_name, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, is_default) VALUES
(1, 2, 'Sarah Jenkins', '+1 (555) 449-7120', '742 Evergreen Terrace', 'Apt 4B', 'Springfield', 'Oregon', 'United States', '97477', 44.0462000, -123.0220000, 1)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

-- Active subscription for customer
INSERT INTO subscriptions (id, user_id, plan_id, start_time, expiry_time, status, payment_id) VALUES
(1, 2, 2, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), 'active', 'sub_stripe_mock_seed_123')
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- ============================================================
-- MIGRATION: EXISTING INSTALLATIONS (pre 3-role model)
-- Run once against a database created before SUPER_ADMIN existed.
-- Safe to re-run.
-- ============================================================

-- 1. Widen users.role so 'super_admin' is a legal value.
--    (On databases already using VARCHAR role this is a no-op change that
--    simply documents the allowed values.)
ALTER TABLE users MODIFY COLUMN role ENUM('customer','admin','super_admin') NOT NULL DEFAULT 'customer';

-- 2. Bootstrap a Super Admin so the Super Admin portal is reachable.
--    The hash below is the bcrypt of the demo password `SuperAdmin@123`.
--    CHANGE IT (and the email) before running this in production.
INSERT INTO users (full_name, email, password_hash, role, email_verified, status)
VALUES ('Velora Super Admin', 'superadmin@velora.com',
        '$2b$10$kz5ZR3./hW20WJoAQ9Dsz.Srs0nSu74vE82c87NcqGVAuU96QagQq',
        'super_admin', 1, 'active')
ON DUPLICATE KEY UPDATE role = 'super_admin';

-- ============================================================
-- SESSION REVOCATION
-- Populated by POST /api/auth/logout. A JWT stays cryptographically valid
-- until it expires, so logout records the token's `jti` here and
-- `authenticate` rejects it. Rows are only useful until `expires_at`.
-- ============================================================
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti VARCHAR(64) NOT NULL,
  user_id INT NULL,
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  PRIMARY KEY (jti),
  INDEX idx_revoked_user (user_id),
  INDEX idx_revoked_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
