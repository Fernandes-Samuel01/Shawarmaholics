-- Feature #13 refinement: separate Head Office inventory from branch inventory.
CREATE TABLE IF NOT EXISTS head_office_inventory_balances (
  inventory_item_id INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS head_office_inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('RECEIPT','ADJUSTMENT_IN','ADJUSTMENT_OUT','WASTE','RETURN')),
  quantity NUMERIC(12,3) NOT NULL CHECK(quantity > 0),
  unit_cost NUMERIC(12,2) CHECK(unit_cost IS NULL OR unit_cost >= 0),
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS head_office_inventory_movements_item_idx
  ON head_office_inventory_movements(inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS head_office_inventory_movements_created_idx
  ON head_office_inventory_movements(created_at DESC);

INSERT INTO head_office_inventory_balances(inventory_item_id, quantity)
SELECT id, 0 FROM inventory_items
ON CONFLICT (inventory_item_id) DO NOTHING;

DROP TRIGGER IF EXISTS head_office_inventory_movements_immutable ON head_office_inventory_movements;
CREATE TRIGGER head_office_inventory_movements_immutable
BEFORE UPDATE OR DELETE ON head_office_inventory_movements
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
