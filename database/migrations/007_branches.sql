-- Central branch registry. Branch-dependent relationships are added in later migrations.
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('OUTLET', 'FRANCHISE')),
  address TEXT,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  postal_code TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO branches (code, name, type, city, state, country, is_active)
VALUES
  ('SH-AW-001', 'Andheri West', 'OUTLET', 'Mumbai', 'Maharashtra', 'India', TRUE),
  ('SH-BA-001', 'Bandra', 'FRANCHISE', 'Mumbai', 'Maharashtra', 'India', TRUE),
  ('SH-PO-001', 'Powai', 'OUTLET', 'Mumbai', 'Maharashtra', 'India', TRUE),
  ('SH-JU-001', 'Juhu', 'FRANCHISE', 'Mumbai', 'Maharashtra', 'India', TRUE)
ON CONFLICT (code) DO NOTHING;
