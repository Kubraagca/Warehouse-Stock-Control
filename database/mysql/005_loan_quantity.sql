USE barfas_depo;
ALTER TABLE loan_records ADD COLUMN quantity DECIMAL(18,3) NOT NULL DEFAULT 1 AFTER recipient_unit;
