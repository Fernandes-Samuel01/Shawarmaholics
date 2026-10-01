-- Feature #13: multi-branch inventory foundation.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE inventory_items SET sku = COALESCE(NULLIF(sku,''), 'INV-' || LPAD(id::text, 5, '0')) WHERE sku IS NULL OR sku='';
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_sku_idx ON inventory_items(sku);

CREATE TABLE IF NOT EXISTS branch_inventory_balances (
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(branch_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','WASTE','RETURN')),
  quantity NUMERIC(12,3) NOT NULL CHECK(quantity > 0),
  unit_cost NUMERIC(12,2) CHECK(unit_cost IS NULL OR unit_cost >= 0),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_movements_branch_item_idx ON inventory_movements(branch_id, inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_created_idx ON inventory_movements(created_at DESC);

CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movements are append-only'; END;
$$;
DROP TRIGGER IF EXISTS inventory_movements_immutable ON inventory_movements;
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
