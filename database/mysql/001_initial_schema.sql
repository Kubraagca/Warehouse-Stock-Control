CREATE DATABASE IF NOT EXISTS barfas_depo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_turkish_ci;
USE barfas_depo;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  full_name VARCHAR(100) NOT NULL,
  role_name VARCHAR(50) NOT NULL DEFAULT 'DEPO_PERSONELI',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id SMALLINT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT NULL UNIQUE,
  category_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  stock_code VARCHAR(100) NULL UNIQUE,
  unit_name VARCHAR(50) NOT NULL DEFAULT 'Adet',
  minimum_stock DECIMAL(18,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE warehouses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  address_text VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE locations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_location_code (warehouse_id, code),
  CONSTRAINT fk_locations_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
) ENGINE=InnoDB;

CREATE TABLE inventory_units (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL,
  code_type ENUM('QR','BARCODE') NOT NULL DEFAULT 'QR',
  code_value VARCHAR(150) NOT NULL UNIQUE,
  serial_number VARCHAR(150) NULL UNIQUE,
  status ENUM('IN_STOCK','RESERVED','ASSIGNED','OUT_OF_STOCK','RETURNED','SCRAPPED') NOT NULL DEFAULT 'IN_STOCK',
  current_location_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_units_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_units_location FOREIGN KEY (current_location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movement_no VARCHAR(40) NOT NULL UNIQUE,
  movement_type ENUM('IN','OUT','RETURN','TRANSFER_OUT','TRANSFER_IN','COUNT_ADJUSTMENT') NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  inventory_unit_id BIGINT UNSIGNED NULL,
  from_location_id BIGINT UNSIGNED NULL,
  to_location_id BIGINT UNSIGNED NULL,
  quantity DECIMAL(18,3) NOT NULL,
  reason_text VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(150) NULL,
  recipient_unit VARCHAR(150) NULL,
  document_no VARCHAR(100) NULL,
  note_text TEXT NULL,
  performed_by_user_id BIGINT UNSIGNED NULL,
  performed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_movements_unit FOREIGN KEY (inventory_unit_id) REFERENCES inventory_units(id),
  CONSTRAINT fk_movements_from_location FOREIGN KEY (from_location_id) REFERENCES locations(id),
  CONSTRAINT fk_movements_to_location FOREIGN KEY (to_location_id) REFERENCES locations(id),
  CONSTRAINT fk_movements_user FOREIGN KEY (performed_by_user_id) REFERENCES users(id),
  INDEX idx_movements_product_date (product_id, performed_at),
  INDEX idx_movements_unit_date (inventory_unit_id, performed_at)
) ENGINE=InnoDB;

CREATE TABLE stock_balances (
  product_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(18,3) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, location_id),
  CONSTRAINT fk_balances_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_balances_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

-- Eski SQL Server kayıtları içe aktarıldığında kaynak kimlikler legacy_id alanlarında korunur.
-- Sipariş, iade ve tedarik geçmişi sonraki dönüşüm adımında legacy_* tablolara aktarılır.
