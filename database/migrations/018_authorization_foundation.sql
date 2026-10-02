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

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_location_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_location_check
  CHECK (
    (lower((SELECT name FROM roles WHERE roles.id = users.role_id)) = 'admin' AND branch_id IS NULL)
    OR
    (lower((SELECT name FROM roles WHERE roles.id = users.role_id)) IN ('manager','cook') AND branch_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role_id);
