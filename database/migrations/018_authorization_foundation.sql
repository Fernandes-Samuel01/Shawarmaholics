-- Authorization foundation: exactly three application roles.
-- ADMIN = Head Office, MANAGER = assigned branch, COOK = assigned branch/KDS.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT;

INSERT INTO roles(name) VALUES ('admin'), ('manager'), ('cook')
ON CONFLICT (name) DO NOTHING;

UPDATE roles
SET name = 'cook'
WHERE lower(name) = 'kitchen'
  AND NOT EXISTS (SELECT 1 FROM roles WHERE lower(name) = 'cook');

DELETE FROM roles
WHERE lower(name) = 'kitchen';

CREATE OR REPLACE FUNCTION enforce_user_role_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name TEXT;
BEGIN
  SELECT lower(name) INTO role_name FROM roles WHERE id = NEW.role_id;

  IF role_name IS NULL THEN
    RAISE EXCEPTION 'A valid application role is required';
  END IF;

  IF role_name = 'admin' AND NEW.branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Admin accounts must belong to Head Office';
  END IF;

  IF role_name IN ('manager', 'cook') AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Manager and Cook accounts must be assigned to a branch';
  END IF;

  IF role_name NOT IN ('admin', 'manager', 'cook') THEN
    RAISE EXCEPTION 'Only admin, manager and cook roles are allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_role_location_trigger ON users;

CREATE TRIGGER users_role_location_trigger
BEFORE INSERT OR UPDATE OF role_id, branch_id ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_user_role_location();

CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role_id);

-- Validate existing users after the trigger/function is installed.
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE lower(r.name) NOT IN ('admin','manager','cook')
     OR (lower(r.name) = 'admin' AND u.branch_id IS NOT NULL)
     OR (lower(r.name) IN ('manager','cook') AND u.branch_id IS NULL);

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Existing users contain invalid role/location assignments. Resolve them before continuing.';
  END IF;
END;
$$;
