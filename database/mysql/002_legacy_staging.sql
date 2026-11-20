USE barfas_depo;

-- Bu tablolar eski SQL Server verisinin alan kaybı olmadan saklandığı salt geçmiş katmanıdır.
CREATE TABLE legacy_categories (
  legacy_id SMALLINT NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  added_on DATE NULL,
  updated_on DATE NULL,
  deleted_on DATE NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_customers (
  legacy_id INT NOT NULL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description_text TEXT NULL,
  added_on DATE NULL,
  updated_on DATE NULL,
  deleted_on DATE NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_products (
  legacy_id INT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  legacy_category_id SMALLINT NOT NULL,
  quantity DECIMAL(18,3) NULL,
  qr_code_blob LONGBLOB NULL,
  stock_code TEXT NULL,
  unit_name VARCHAR(50) NULL,
  added_on DATE NULL,
  updated_on DATE NULL,
  deleted_on DATE NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_product_units (
  legacy_id INT NOT NULL PRIMARY KEY,
  legacy_product_id INT NULL,
  product_name VARCHAR(50) NULL,
  product_stock_code TEXT NULL,
  qr_code_blob LONGBLOB NULL,
  added_on DATE NULL,
  deleted_on DATE NULL,
  updated_on DATE NULL,
  status_name VARCHAR(50) NULL,
  printed BOOLEAN NULL,
  legacy_supply_id INT NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_supplies (
  legacy_id INT NOT NULL PRIMARY KEY,
  supplier_name VARCHAR(50) NULL,
  legacy_product_id INT NULL,
  supplied_at DATETIME NULL,
  added_on DATE NULL,
  deleted_on DATE NULL,
  updated_on DATE NULL,
  quantity DECIMAL(18,3) NULL,
  unit_name VARCHAR(50) NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_orders (
  legacy_id INT NOT NULL PRIMARY KEY,
  ordered_on DATE NULL,
  legacy_customer_id INT NULL,
  description_text TEXT NULL,
  added_on DATE NULL,
  updated_on DATE NULL,
  deleted_on DATE NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_order_lines (
  legacy_id INT NOT NULL PRIMARY KEY,
  legacy_order_id INT NULL,
  legacy_product_id INT NULL,
  ordered_on DATE NULL,
  unit_name VARCHAR(50) NULL,
  quantity DECIMAL(18,3) NULL,
  added_on DATE NULL,
  deleted_on DATE NULL,
  updated_on DATE NULL,
  description_text TEXT NULL,
  legacy_product_unit_id INT NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_returns (
  legacy_id INT NOT NULL PRIMARY KEY,
  added_on DATE NULL,
  updated_on DATE NULL,
  deleted_on DATE NULL,
  description_text TEXT NOT NULL,
  returned_on DATE NULL,
  legacy_customer_id INT NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_return_lines (
  legacy_id INT NOT NULL PRIMARY KEY,
  legacy_return_id INT NULL,
  legacy_product_id INT NULL,
  returned_on DATE NULL,
  unit_name VARCHAR(50) NULL,
  quantity DECIMAL(18,3) NULL,
  added_on DATE NULL,
  deleted_on DATE NULL,
  updated_on DATE NULL,
  description_text TEXT NULL,
  legacy_product_unit_id INT NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_sales (
  legacy_id INT NOT NULL PRIMARY KEY,
  legacy_product_id INT NOT NULL,
  legacy_customer_id INT NOT NULL,
  quantity TINYINT NOT NULL,
  price DECIMAL(18,2) NULL
) ENGINE=InnoDB;

CREATE TABLE legacy_users (
  legacy_id INT NOT NULL PRIMARY KEY,
  username VARCHAR(50) NULL,
  password_value TEXT NULL,
  role_name VARCHAR(50) NULL,
  full_name VARCHAR(50) NULL
) ENGINE=InnoDB;
