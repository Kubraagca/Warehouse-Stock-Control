USE barfas_depo;
ALTER TABLE inventory_movements ADD COLUMN supplier_id BIGINT UNSIGNED NULL AFTER note_text;
ALTER TABLE inventory_movements ADD CONSTRAINT fk_movements_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
