USE barfas_depo;

-- Geçmiş ürünleri yeni stok kartlarına aktarır. Kaynak tabloları değiştirmez.
INSERT INTO categories (legacy_id, name, created_at, archived_at)
SELECT legacy_id, name, COALESCE(added_on, CURRENT_TIMESTAMP), deleted_on
FROM legacy_categories
ON DUPLICATE KEY UPDATE name = VALUES(name), archived_at = VALUES(archived_at);

INSERT INTO products (legacy_id, category_id, name, stock_code, unit_name, created_at, updated_at, archived_at)
SELECT p.legacy_id, c.id, p.name, NULLIF(LEFT(p.stock_code, 100), ''), COALESCE(NULLIF(p.unit_name, ''), 'Adet'),
       COALESCE(p.added_on, CURRENT_TIMESTAMP), COALESCE(p.updated_on, CURRENT_TIMESTAMP), p.deleted_on
FROM legacy_products p
LEFT JOIN categories c ON c.legacy_id = p.legacy_category_id
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id), name = VALUES(name), stock_code = VALUES(stock_code),
  unit_name = VALUES(unit_name), updated_at = VALUES(updated_at), archived_at = VALUES(archived_at);

INSERT INTO warehouses (code, name) VALUES ('ANA-DEPO', 'Ana Depo')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO locations (warehouse_id, code, name)
SELECT id, 'GENEL', 'Genel Stok Alanı' FROM warehouses WHERE code = 'ANA-DEPO'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO stock_balances (product_id, location_id, quantity)
SELECT p.id, l.id, COALESCE(lp.quantity, 0)
FROM legacy_products lp
JOIN products p ON p.legacy_id = lp.legacy_id
JOIN warehouses w ON w.code = 'ANA-DEPO'
JOIN locations l ON l.warehouse_id = w.id AND l.code = 'GENEL'
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

INSERT INTO inventory_units (legacy_id, product_id, code_type, code_value, status, created_at)
SELECT lu.legacy_id, p.id, 'QR', CONCAT('BRF-LEGACY-', lu.legacy_id),
       CASE
         WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'depoda%' THEN 'IN_STOCK'
         WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'sipari%' THEN 'RESERVED'
         WHEN LOWER(COALESCE(lu.status_name, '')) LIKE '%iade%' THEN 'RETURNED'
         ELSE 'IN_STOCK'
       END,
       COALESCE(lu.added_on, CURRENT_TIMESTAMP)
FROM legacy_product_units lu
JOIN products p ON p.legacy_id = lu.legacy_product_id
ON DUPLICATE KEY UPDATE status = VALUES(status);

UPDATE inventory_units u
JOIN legacy_product_units lu ON lu.legacy_id = u.legacy_id
LEFT JOIN locations l ON l.code = 'GENEL'
SET u.current_location_id = CASE WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'depoda%' THEN l.id ELSE NULL END;
