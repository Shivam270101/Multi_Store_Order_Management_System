CREATE DATABASE IF NOT EXISTS multi_store_orders
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE multi_store_orders;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  store_id VARCHAR(100) NOT NULL,
  total_amount DECIMAL(13, 2) NOT NULL,
  status ENUM('PLACED', 'PREPARING', 'COMPLETED') NOT NULL DEFAULT 'PLACED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_store_id (store_id),
  INDEX idx_orders_created_at (created_at),
  INDEX idx_orders_store_created (store_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(100) NOT NULL,
  qty INT UNSIGNED NOT NULL,
  unit_price DECIMAL(13, 2) NOT NULL,
  INDEX idx_order_items_order_id (order_id),
  INDEX idx_order_items_item_id (item_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dishes (
  item_id VARCHAR(100) NOT NULL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(13, 2) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_dishes_category (category),
  INDEX idx_dishes_available (available)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders_archive (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  store_id VARCHAR(100) NOT NULL,
  total_amount DECIMAL(13, 2) NOT NULL,
  status ENUM('PLACED', 'PREPARING', 'COMPLETED') NOT NULL,
  created_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_archive_store_id (store_id),
  INDEX idx_orders_archive_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS demo_seed_runs (
  seed_key VARCHAR(100) NOT NULL PRIMARY KEY,
  seeded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items_archive (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(100) NOT NULL,
  qty INT UNSIGNED NOT NULL,
  unit_price DECIMAL(13, 2) NOT NULL,
  INDEX idx_order_items_archive_order_id (order_id),
  INDEX idx_order_items_archive_item_id (item_id)
) ENGINE=InnoDB;
