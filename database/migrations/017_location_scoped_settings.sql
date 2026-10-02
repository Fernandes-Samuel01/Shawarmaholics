-- Location-scoped operational settings.
-- Head Office uses branch_id NULL. Every branch receives its own settings copy.

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'HEAD_OFFICE'
    CHECK (location_type IN ('HEAD_OFFICE','BRANCH')),
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE;

UPDATE system_settings
SET location_type = 'HEAD_OFFICE',
    branch_id = NULL
WHERE location_type IS NULL OR location_type <> 'BRANCH' OR branch_id IS NULL;

ALTER TABLE system_settings
  DROP CONSTRAINT IF EXISTS system_settings_location_scope_check;

ALTER TABLE system_settings
  ADD CONSTRAINT system_settings_location_scope_check
  CHECK (
    (location_type = 'HEAD_OFFICE' AND branch_id IS NULL)
    OR
    (location_type = 'BRANCH' AND branch_id IS NOT NULL)
  );

-- The original migration made setting_key globally unique. Location-scoped
-- settings need uniqueness per location instead.
ALTER TABLE system_settings
  DROP CONSTRAINT IF EXISTS system_settings_setting_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_scope_unique_idx
  ON system_settings(setting_key, COALESCE(branch_id, 0));

CREATE INDEX IF NOT EXISTS system_settings_branch_idx
  ON system_settings(branch_id);

-- Clone Head Office defaults into every existing branch.
INSERT INTO system_settings
  (setting_key, category, label, description, value, value_type, is_public, location_type, branch_id)
SELECT
  s.setting_key, s.category, s.label, s.description, s.value, s.value_type, s.is_public,
  'BRANCH', b.id
FROM system_settings s
CROSS JOIN branches b
WHERE s.location_type = 'HEAD_OFFICE'
ON CONFLICT (setting_key, COALESCE(branch_id, 0)) DO NOTHING;

-- Operational settings are intentionally readable by the local kiosk/KDS.
UPDATE system_settings
SET is_public = true
WHERE setting_key IN (
  'orders.eat_here_enabled',
  'orders.take_parcel_enabled',
  'orders.cash_enabled',
  'orders.upi_enabled',
  'kiosk.enabled',
  'kiosk.show_bestseller',
  'kiosk.show_vegetarian',
  'kiosk.show_preparation_time',
  'kiosk.allow_customizations',
  'kds.max_active_orders',
  'kds.show_preparation_timer',
  'kds.sound_alerts',
  'kds.new_order_alerts',
  'inventory.low_stock_alerts',
  'inventory.out_of_stock_alerts'
);
