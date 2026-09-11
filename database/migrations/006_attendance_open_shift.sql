-- Attendance is an open shift until punch_out is recorded.
-- Keep all historical rows, but prevent more than one open shift per staff member.
ALTER TABLE staff_attendance
  DROP CONSTRAINT IF EXISTS staff_attendance_staff_day_unique;

CREATE UNIQUE INDEX IF NOT EXISTS staff_attendance_one_open_shift_idx
  ON staff_attendance(staff_id)
  WHERE punch_out IS NULL;
