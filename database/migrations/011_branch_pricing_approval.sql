CREATE TABLE IF NOT EXISTS branch_menu_prices(
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  effective_price NUMERIC(10,2) NOT NULL CHECK(effective_price>=0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(branch_id,menu_item_id)
);

CREATE TABLE IF NOT EXISTS branch_price_proposals(
  id BIGSERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  proposed_price NUMERIC(10,2) NOT NULL CHECK(proposed_price>=0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED')),
  proposed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  master_price_at_proposal NUMERIC(10,2) NOT NULL CHECK(master_price_at_proposal>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_price_one_pending_idx
  ON branch_price_proposals(branch_id,menu_item_id)
  WHERE status='PENDING';

CREATE INDEX IF NOT EXISTS branch_price_proposals_status_idx
  ON branch_price_proposals(status,proposed_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
