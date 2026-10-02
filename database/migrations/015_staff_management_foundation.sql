-- Staff management foundation.
-- Normalize staff location references to the central branch registry while keeping
-- Head Office staff represented by NULL.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS branch_id_new INTEGER;
UPDATE staff s
SET branch_id_new = CASE
  WHEN s.branch_id IS NULL OR btrim(s.branch_id) = '' THEN NULL
  WHEN s.branch_id ~ '^\\d+$' THEN s.branch_id::INTEGER
  ELSE b.id
END
FROM branches b
WHERE s.branch_id IS NOT NULL
  AND b.code = s.branch_id;

UPDATE staff
SET branch_id_new = NULL
WHERE branch_id IS NULL OR btrim(branch_id) = '';

UPDATE staff
SET branch_id_new = branch_id::INTEGER
WHERE branch_id IS NOT NULL
  AND btrim(branch_id) ~ '^\\d+$'
  AND branch_id_new IS NULL;

ALTER TABLE staff DROP COLUMN branch_id;
ALTER TABLE staff RENAME COLUMN branch_id_new TO branch_id;
ALTER TABLE staff
  ADD CONSTRAINT staff_branch_fk
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS branch_id_new INTEGER;
UPDATE staff_attendance sa
SET branch_id_new = s.branch_id
FROM staff s
WHERE sa.staff_id = s.id
  AND sa.branch_id_new IS NULL;

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
