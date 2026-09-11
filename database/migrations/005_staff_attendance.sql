CREATE TABLE IF NOT EXISTS staff(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  branch_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_attendance(
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  branch_id TEXT,
  attendance_date DATE NOT NULL,
  punch_in TIMESTAMPTZ NOT NULL,
  punch_out TIMESTAMPTZ,
  total_work_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_attendance_total_non_negative CHECK(total_work_seconds IS NULL OR total_work_seconds>=0),
  CONSTRAINT staff_attendance_punch_order CHECK(punch_out IS NULL OR punch_out>=punch_in),
  CONSTRAINT staff_attendance_staff_day_unique UNIQUE(staff_id,attendance_date)
);

CREATE TABLE IF NOT EXISTS otp_verifications(
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_attendance_date_idx ON staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS otp_verifications_lookup_idx ON otp_verifications(phone,purpose,created_at DESC);
