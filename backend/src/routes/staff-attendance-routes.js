const { findActiveStaff, getOpenAttendance, verifyAndPunch } = require('../services/attendance-service');
const { issueOtp, normalizePhone, validPhone } = require('../services/otp-service');

const formatIndiaTimestamp = value => {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).reduce((result, part) => { result[part.type] = part.value; return result }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+05:30`;
};
const serializeAttendance = attendance => attendance ? { id: attendance.id, attendance_date: attendance.attendance_date, punch_in: attendance.punch_in, punch_out: attendance.punch_out, punch_in_ist: formatIndiaTimestamp(attendance.punch_in), punch_out_ist: formatIndiaTimestamp(attendance.punch_out), total_work_seconds: attendance.total_work_seconds } : undefined;

module.exports = function registerStaffAttendanceRoutes(app, { query, db }) {
  app.post('/api/staff-attendance/request-otp', async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!validPhone(phone)) return res.status(400).json({ success: false, message: 'Enter a valid phone number' });
    try {
      const staff = await findActiveStaff(query, phone);
      const result = await issueOtp({ query, phone });
      const attendance = await getOpenAttendance(query, staff.id);
      res.json({ success: true, message: 'OTP sent successfully', expires_in_seconds: result.expiresInSeconds, action: attendance?.punch_in && !attendance?.punch_out ? 'punch_out' : 'punch_in', attendance: serializeAttendance(attendance) });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error('Attendance OTP request failed:', error.message);
      res.status(500).json({ success: false, message: 'Unable to request OTP' });
    }
  });

  app.post('/api/staff-attendance/verify-otp', async (req, res) => {
    try {
      const result = await verifyAndPunch({ db, phone: req.body?.phone, otp: req.body?.otp });
      const { staff, attendance, action } = result;
      res.json({ success: true, action, staff: { id: staff.id, name: staff.name, role: staff.role }, attendance: serializeAttendance(attendance) });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message, staff: error.staff ? { id: error.staff.id, name: error.staff.name, role: error.staff.role } : undefined, attendance: serializeAttendance(error.attendance) });
      console.error('Attendance verification failed:', error.message);
      res.status(500).json({ success: false, message: 'Unable to verify attendance' });
    }
  });
};
