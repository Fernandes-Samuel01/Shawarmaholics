const { OTP_PURPOSE, hashOtp, safeEqualHash, normalizePhone, validPhone } = require('./otp-service');

function errorWithStatus(message, status) { const error = new Error(message); error.status = status; return error; }

async function findActiveStaff(query, phone) {
  const { rows } = await query('SELECT id,name,phone,role,branch_id,is_active FROM staff WHERE phone=$1 LIMIT 1', [phone]);
  if (!rows[0]) throw errorWithStatus('Staff member not found', 404);
  if (!rows[0].is_active) throw errorWithStatus('This staff member is inactive', 403);
  return rows[0];
}

async function getOpenAttendance(query, staffId) {
  const { rows } = await query('SELECT id,attendance_date,punch_in,punch_out,total_work_seconds FROM staff_attendance WHERE staff_id=$1 AND punch_out IS NULL ORDER BY punch_in DESC LIMIT 1', [staffId]);
  return rows[0] || null;
}

async function verifyAndPunch({ db, phone, otp }) {
  const normalized = normalizePhone(phone);
  if (!validPhone(normalized)) throw errorWithStatus('Enter a valid phone number', 400);
  if (!/^\d{6}$/.test(String(otp || ''))) throw errorWithStatus('Enter a valid 6-digit OTP', 400);
  const client = await db.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const { rows: staffRows } = await client.query('SELECT id,name,phone,role,branch_id,is_active FROM staff WHERE phone=$1 FOR SHARE', [normalized]);
    if (!staffRows[0]) throw errorWithStatus('Staff member not found', 404);
    if (!staffRows[0].is_active) throw errorWithStatus('This staff member is inactive', 403);
    const staff = staffRows[0];
    const { rows: otpRows } = await client.query("SELECT * FROM otp_verifications WHERE phone=$1 AND purpose=$2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [normalized, OTP_PURPOSE]);
    const record = otpRows[0];
    if (!record) throw errorWithStatus('OTP is invalid or has already been used', 401);
    if (new Date(record.expires_at).getTime() <= Date.now()) throw errorWithStatus('OTP has expired. Request a new OTP.', 401);
    if (!safeEqualHash(record.otp_hash, hashOtp(String(otp)))) throw errorWithStatus('Invalid OTP', 401);
    await client.query('UPDATE otp_verifications SET verified_at=NOW(),used_at=NOW() WHERE id=$1', [record.id]);
    const { rows: attendanceRows } = await client.query('SELECT * FROM staff_attendance WHERE staff_id=$1 AND punch_out IS NULL ORDER BY punch_in DESC LIMIT 1 FOR UPDATE', [staff.id]);
    const attendance = attendanceRows[0];
    if (!attendance) {
      const { rows: [created] } = await client.query("INSERT INTO staff_attendance(staff_id,branch_id,attendance_date,punch_in) VALUES($1,$2,(timezone('Asia/Kolkata',NOW()))::date,NOW()) RETURNING *", [staff.id, staff.branch_id || null]);
      await client.query('COMMIT'); committed = true;
      return { action: 'punch_in', staff, attendance: created };
    }
    const { rows: [updated] } = await client.query("UPDATE staff_attendance SET punch_out=NOW(),total_work_seconds=GREATEST(0,EXTRACT(EPOCH FROM (NOW()-punch_in))::int),updated_at=NOW() WHERE id=$1 RETURNING *", [attendance.id]);
    await client.query('COMMIT'); committed = true;
    return { action: 'punch_out', staff, attendance: updated };
  } catch (error) { if (!committed) await client.query('ROLLBACK'); throw error } finally { client.release() }
}

module.exports = { findActiveStaff, getOpenAttendance, verifyAndPunch };
