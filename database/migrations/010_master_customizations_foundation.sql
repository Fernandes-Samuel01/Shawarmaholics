CREATE TABLE IF NOT EXISTS menu_customization_groups(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK(group_type IN('SAUCE','EXTRA','ADD_ON')),
  position INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_customization_groups_name_check CHECK(btrim(name)<>'' AND name=btrim(name)),
  CONSTRAINT menu_customization_groups_code_check CHECK(btrim(code)<>'' AND code=btrim(code))
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_customization_groups_name_lower_uidx
  ON menu_customization_groups(lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS menu_customization_groups_code_lower_uidx
  ON menu_customization_groups(lower(code));

CREATE TABLE IF NOT EXISTS menu_customization_options(
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES menu_customization_groups(id),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK(price>=0),
  position INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_customization_options_name_check CHECK(btrim(name)<>'' AND name=btrim(name))
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_customization_options_group_name_lower_uidx
  ON menu_customization_options(group_id,lower(name));
CREATE INDEX IF NOT EXISTS menu_customization_options_group_idx
  ON menu_customization_options(group_id);
CREATE INDEX IF NOT EXISTS menu_customization_options_active_group_idx
  ON menu_customization_options(group_id,is_active,position);

CREATE TABLE IF NOT EXISTS menu_item_customization_groups(
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  group_id INTEGER NOT NULL REFERENCES menu_customization_groups(id),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  min_selections INTEGER NOT NULL DEFAULT 0 CHECK(min_selections>=0),
  max_selections INTEGER NOT NULL DEFAULT 1 CHECK(max_selections>=0 AND max_selections>=min_selections),
  position INTEGER NOT NULL,
  PRIMARY KEY(menu_item_id,group_id)
);

CREATE INDEX IF NOT EXISTS menu_item_customization_groups_item_idx
  ON menu_item_customization_groups(menu_item_id,position);
CREATE INDEX IF NOT EXISTS menu_item_customization_groups_group_idx
  ON menu_item_customization_groups(group_id);
