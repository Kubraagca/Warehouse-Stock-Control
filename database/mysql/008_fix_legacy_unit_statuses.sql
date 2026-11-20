USE barfas_depo;
UPDATE inventory_units u
JOIN legacy_product_units lu ON lu.legacy_id = u.legacy_id
LEFT JOIN locations l ON l.code = 'GENEL'
SET u.status = CASE
    WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'depoda%' THEN 'IN_STOCK'
    WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'sipari%' THEN 'RESERVED'
    WHEN LOWER(COALESCE(lu.status_name, '')) LIKE '%iade%' THEN 'RETURNED'
    ELSE 'IN_STOCK'
  END,
  u.current_location_id = CASE WHEN LOWER(COALESCE(lu.status_name, '')) LIKE 'depoda%' THEN l.id ELSE NULL END;
