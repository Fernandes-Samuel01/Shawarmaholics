-- Add Head Office lifecycle metadata without recreating or deleting categories.
ALTER TABLE menu_categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing category names are normalized before enforcing the new invariant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM menu_categories WHERE btrim(name) = '') THEN
    RAISE EXCEPTION 'Cannot normalize empty menu category names';
  END IF;
END $$;

UPDATE menu_categories
SET name = btrim(name),
    updated_at = NOW()
WHERE name <> btrim(name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'menu_categories'::regclass
      AND conname = 'menu_categories_name_trimmed_check'
  ) THEN
    ALTER TABLE menu_categories
      ADD CONSTRAINT menu_categories_name_trimmed_check
      CHECK (length(btrim(name)) > 0 AND name = btrim(name));
  END IF;
END $$;

-- Preserve the existing case-sensitive constraint and add safe case-insensitive uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_name_lower_uidx
  ON menu_categories (lower(name));
