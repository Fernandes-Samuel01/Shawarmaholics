-- Staff management foundation.
-- Normalize staff location references to the central branch registry while keeping
-- Head Office staff represented by NULL.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM staff s
    WHERE s.branch_id IS NOT NULL
      AND btrim(s.branch_id) <> ''
      AND (
        (s.branch_id !~ '^\d+$' AND NOT EXISTS (
          SELECT 1 FROM branches b WHERE b.code = s.branch_id
        ))
        OR
        (s.branch_id ~ '^\d+$' AND NOT EXISTS (
          SELECT 1 FROM branches b WHERE b.id = s.branch_id::INTEGER
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Staff migration found an unmapped branch_id value. Resolve the staff location before applying migration 015.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM staff_attendance sa
    WHERE sa.branch_id IS NOT NULL
      AND btrim(sa.branch_id) <> ''
      AND (
        (sa.branch_id !~ '^\d+$' AND NOT EXISTS (
          SELECT 1 FROM branches b WHERE b.code = sa.branch_id
        ))
        OR
        (sa.branch_id ~ '^\d+$' AND NOT EXISTS (
          SELECT 1 FROM branches b WHERE b.id = sa.branch_id::INTEGER
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Staff attendance migration found an unmapped branch_id value. Resolve the attendance location before applying migration 015.';
  END IF;
END $$;

ALTER TABLE staff ADD COLUMN branch_id_new INTEGER;

UPDATE staff s
SET branch_id_new = CASE
  WHEN s.branch_id IS NULL OR btrim(s.branch_id) = '' THEN NULL
  WHEN s.branch_id ~ '^\d+$' THEN s.branch_id::INTEGER
  ELSE b.id
END
FROM branches b
WHERE s.branch_id IS NOT NULL
  AND (
    (s.branch_id ~ '^\d+$' AND b.id = s.branch_id::INTEGER)
    OR
    (s.branch_id !~ '^\d+$' AND b.code = s.branch_id)
  );

ALTER TABLE staff DROP COLUMN branch_id;
ALTER TABLE staff RENAME COLUMN branch_id_new TO branch_id;

ALTER TABLE staff
  ADD CONSTRAINT staff_branch_fk
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE staff_attendance ADD COLUMN branch_id_new INTEGER;

UPDATE staff_attendance sa
SET branch_id_new = CASE
  WHEN sa.branch_id IS NULL OR btrim(sa.branch_id) = '' THEN NULL
  WHEN sa.branch_id ~ '^\d+$' THEN sa.branch_id::INTEGER
  ELSE b.id
END
FROM branches b
WHERE sa.branch_id IS NOT NULL
  AND (
    (sa.branch_id ~ '^\d+$' AND b.id = sa.branch_id::INTEGER)
    OR
    (sa.branch_id !~ '^\d+$' AND b.code = sa.branch_id)
  );

ALTER TABLE staff_attendance DROP COLUMN branch_id;
ALTER TABLE staff_attendance RENAME COLUMN branch_id_new TO branch_id;

ALTER TABLE staff_attendance
  ADD CONSTRAINT staff_attendance_branch_fk
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique_idx
  ON staff(email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_branch_idx
  ON staff(branch_id);

CREATE INDEX IF NOT EXISTS staff_active_idx
  ON staff(is_active);

CREATE INDEX IF NOT EXISTS staff_name_idx
  ON staff(name);
