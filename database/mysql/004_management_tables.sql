USE barfas_depo;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  contact_text VARCHAR(255) NULL,
  note_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  note_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NULL,
  order_date DATE NOT NULL,
  status ENUM('OPEN','PREPARING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  note_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(18,3) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loan_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movement_id BIGINT UNSIGNED NOT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL,
  inventory_unit_id BIGINT UNSIGNED NULL,
  recipient_name VARCHAR(150) NOT NULL,
  recipient_unit VARCHAR(150) NULL,
  quantity DECIMAL(18,3) NOT NULL DEFAULT 1,
  status ENUM('ACTIVE','RETURNED') NOT NULL DEFAULT 'ACTIVE',
  lent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME NULL,
  note_text TEXT NULL,
  CONSTRAINT fk_loans_movement FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
  CONSTRAINT fk_loans_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_loans_unit FOREIGN KEY (inventory_unit_id) REFERENCES inventory_units(id)
) ENGINE=InnoDB;

INSERT INTO customers (legacy_id, name, note_text)
SELECT legacy_id, name, description_text FROM legacy_customers
ON DUPLICATE KEY UPDATE name = VALUES(name), note_text = VALUES(note_text);

INSERT INTO suppliers (name, note_text)
SELECT DISTINCT supplier_name, 'Eski tedarik kaydından aktarıldı'
FROM legacy_supplies
WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE inventory_movements ADD COLUMN supplier_id BIGINT UNSIGNED NULL AFTER note_text;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_movements_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
