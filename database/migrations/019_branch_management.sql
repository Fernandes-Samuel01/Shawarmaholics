-- Feature #28: dynamic Head Office branch management.
-- Branch rows are now created by the Head Office branch registry instead of seed data.

CREATE INDEX IF NOT EXISTS branches_active_name_idx ON branches(is_active,name);
CREATE INDEX IF NOT EXISTS branches_type_idx ON branches(type);

CREATE OR REPLACE FUNCTION set_branch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_updated_at_trigger ON branches;
CREATE TRIGGER branches_updated_at_trigger
BEFORE UPDATE ON branches
FOR EACH ROW EXECUTE FUNCTION set_branch_updated_at();
