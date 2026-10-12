-- Branch-specific menu availability. Missing rows inherit the master menu's availability.
CREATE TABLE IF NOT EXISTS branch_menu_availability (
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (branch_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_branch_menu_availability_item ON branch_menu_availability(menu_item_id);
