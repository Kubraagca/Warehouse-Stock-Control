USE barfas_depo;

INSERT INTO orders (order_no, customer_id, order_date, status, note_text)
SELECT CONCAT('LEGACY-', o.legacy_id), c.id, COALESCE(o.ordered_on, CURRENT_DATE), 'COMPLETED', o.description_text
FROM legacy_orders o
LEFT JOIN customers c ON c.legacy_id = o.legacy_customer_id
ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id), order_date = VALUES(order_date), note_text = VALUES(note_text);

INSERT INTO order_items (order_id, product_id, quantity)
SELECT ord.id, p.id, COALESCE(line.quantity, 0)
FROM legacy_order_lines line
JOIN orders ord ON ord.order_no = CONCAT('LEGACY-', line.legacy_order_id)
JOIN products p ON p.legacy_id = line.legacy_product_id
WHERE NOT EXISTS (
  SELECT 1 FROM order_items existing
  WHERE existing.order_id = ord.id AND existing.product_id = p.id
);
