ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_branch_created_idx
  ON orders(branch_id,created_at DESC);
