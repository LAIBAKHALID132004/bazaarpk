-- BazaarPK E-Commerce Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS bazaarpk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bazaarpk;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(191)  NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('customer','admin','seller') NOT NULL DEFAULT 'customer',
  is_verified   TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url    VARCHAR(500),
  city          VARCHAR(80),
  province      VARCHAR(60),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  name_ur     VARCHAR(80),                -- Urdu name
  slug        VARCHAR(100) NOT NULL UNIQUE,
  icon        VARCHAR(50),
  parent_id   INT UNSIGNED,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO categories (name, name_ur, slug, icon, sort_order) VALUES
('Groceries',   'گروسری',       'groceries',   'ti-shopping-bag',    1),
('Clothing',    'لباس',         'clothing',    'ti-shirt',           2),
('Electronics', 'الیکٹرونکس',   'electronics', 'ti-device-mobile',   3),
('Home',        'گھر',          'home',        'ti-home',            4),
('Sports',      'کھیل',         'sports',      'ti-ball-football',   5),
('Books',       'کتابیں',       'books',       'ti-book',            6),
('Beauty',      'خوبصورتی',     'beauty',      'ti-sparkles',        7);

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────
CREATE TABLE products (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED NOT NULL,
  seller_id     INT UNSIGNED NOT NULL,
  name          VARCHAR(200) NOT NULL,
  name_ur       VARCHAR(200),
  slug          VARCHAR(220) NOT NULL UNIQUE,
  description   TEXT,
  description_ur TEXT,
  price         DECIMAL(10,2) NOT NULL,
  sale_price    DECIMAL(10,2),
  cost_price    DECIMAL(10,2),
  sku           VARCHAR(80) UNIQUE,
  stock         INT NOT NULL DEFAULT 0,
  weight_kg     DECIMAL(6,3),
  images        JSON,                    -- array of image URLs
  tags          JSON,                    -- array of tag strings
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  is_featured   TINYINT(1) NOT NULL DEFAULT 0,
  views         INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (seller_id)   REFERENCES users(id),
  INDEX idx_category  (category_id),
  INDEX idx_active    (is_active),
  INDEX idx_featured  (is_featured),
  FULLTEXT idx_search (name, description)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────────
CREATE TABLE reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  order_id    INT UNSIGNED,
  rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  UNIQUE KEY uq_user_product (user_id, product_id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- ADDRESSES
-- ─────────────────────────────────────────────
CREATE TABLE addresses (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  label       VARCHAR(40) NOT NULL DEFAULT 'Home',
  full_name   VARCHAR(120) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  street      VARCHAR(300) NOT NULL,
  city        VARCHAR(80)  NOT NULL,
  province    VARCHAR(60)  NOT NULL,
  postal_code VARCHAR(10),
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  address_id       INT UNSIGNED,
  order_number     VARCHAR(20) NOT NULL UNIQUE,
  status           ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                   NOT NULL DEFAULT 'pending',
  payment_method   ENUM('cod','easypaisa','jazzcash','bank_transfer','card') NOT NULL,
  payment_status   ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  payment_ref      VARCHAR(100),
  subtotal         DECIMAL(10,2) NOT NULL,
  discount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total            DECIMAL(10,2) NOT NULL,
  promo_code       VARCHAR(30),
  notes            TEXT,
  shipping_name    VARCHAR(120),
  shipping_phone   VARCHAR(20),
  shipping_street  VARCHAR(300),
  shipping_city    VARCHAR(80),
  shipping_province VARCHAR(60),
  tracking_number  VARCHAR(80),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status  (status)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE order_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  quantity    SMALLINT UNSIGNED NOT NULL,
  unit_price  DECIMAL(10,2) NOT NULL,
  total       DECIMAL(10,2) NOT NULL,
  snapshot    JSON,            -- product name/image at time of purchase
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- PROMO CODES
-- ─────────────────────────────────────────────
CREATE TABLE promo_codes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(30) NOT NULL UNIQUE,
  type            ENUM('percent','fixed') NOT NULL,
  value           DECIMAL(8,2) NOT NULL,
  min_order       DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_discount    DECIMAL(10,2),
  usage_limit     INT,
  used_count      INT NOT NULL DEFAULT 0,
  expires_at      DATETIME,
  is_active       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

INSERT INTO promo_codes (code, type, value, min_order, max_discount, usage_limit) VALUES
('BAZAAR10', 'percent', 10, 1000, 500, 1000),
('SAVE200',  'fixed',  200, 2000, 200,  500),
('WELCOME',  'percent', 15, 500,  300,  null);

-- ─────────────────────────────────────────────
-- CART (server-side for logged-in users)
-- ─────────────────────────────────────────────
CREATE TABLE cart_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  quantity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_product (user_id, product_id),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- WISHLIST
-- ─────────────────────────────────────────────
CREATE TABLE wishlist (
  user_id     INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
-- ORDER STATUS HISTORY
-- ─────────────────────────────────────────────
CREATE TABLE order_status_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  status      VARCHAR(30) NOT NULL,
  note        TEXT,
  changed_by  INT UNSIGNED,
  changed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
