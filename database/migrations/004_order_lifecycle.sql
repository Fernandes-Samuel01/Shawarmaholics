-- Persistent lifecycle fields. Existing status values remain compatible with the
-- current kiosk/KDS flow; the fields below provide the richer lifecycle data.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_time_seconds INT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_prep_seconds INT NOT NULL DEFAULT 480;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS was_delayed BOOLEAN NOT NULL DEFAULT false;

-- Normalize historical rows without deleting or changing order/inventory data.
UPDATE orders SET received_at=COALESCE(received_at,created_at);
UPDATE orders SET activated_at=COALESCE(activated_at,preparation_started_at)
WHERE preparation_started_at IS NOT NULL;
UPDATE orders SET target_prep_seconds=480 WHERE target_prep_seconds IS NULL OR target_prep_seconds<=0;
UPDATE orders
SET prep_time_seconds=GREATEST(0,EXTRACT(EPOCH FROM (completed_at-activated_at))::int),
    was_delayed=GREATEST(0,EXTRACT(EPOCH FROM (completed_at-activated_at))::int)>target_prep_seconds
WHERE status='completed' AND completed_at IS NOT NULL AND activated_at IS NOT NULL AND prep_time_seconds IS NULL;

ALTER TABLE orders ALTER COLUMN received_at SET DEFAULT NOW();
