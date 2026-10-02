-- Authorization foundation: the application has exactly three login roles.
-- ADMIN = Head Office, MANAGER = assigned branch, COOK = KDS.
-- Manager and Cook accounts must belong to a branch; Admin belongs to Head Office.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE RESTRICT;

UPDATE roles SET name = 'cook' WHERE lower(name) = 'kitchen' AND NOT EXISTS (
  SELECT 1 FROM roles WHERE lower(name) = 'cook'
);

DELETE FROM roles
WHERE lower(name) = 'kitchen';

CREATE OR REPLACE FUNCTION validate_user_role_location()
RETURNS TRIGGER AS $$
DECLARE
  role_name TEXT;
BEGIN
  SELECT lower(name) INTO role_name FROM roles WHERE id = NEW.role_id;

  IF role_name IS NULL OR role_name NOT IN ('admin','manager','cook') THEN
    RAISE EXCEPTION 'Users may only have admin, manager, or cook roles';
  END IF;

  IF role_name = 'admin' AND NEW.branch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Admin users must belong to Head Office';
  END IF;

  IF role_name IN ('manager','cook') AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Manager and Cook users must belong to a branch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_role_location_trigger ON users;

CREATE TRIGGER users_role_location_trigger
BEFORE INSERT OR UPDATE OF role_id, branch_id ON users
FOR EACH ROW
EXECUTE FUNCTION validate_user_role_location();

CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role_id);
