const STAFF_ROLES = ['MANAGER', 'SUPERVISOR', 'KITCHEN', 'CASHIER', 'STAFF'];

const parseId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeOptionalText = value => {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const serializeStaff = row => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email || null,
  role: row.role,
  branch_id: row.branch_id || null,
  branch_name: row.branch_name || 'Head Office',
  branch_code: row.branch_code || null,
  is_active: row.is_active,
  created_at: row.created_at,
  updated_at: row.updated_at
});

module.exports = function registerStaffRoutes(app, { query, db, auth }) {
  app.get('/api/admin/staff', auth(['admin']), async (req, res) => {
    try {
      const branchId = req.query.branchId === 'HEAD_OFFICE' || req.query.branchId === 'head-office'
        ? 'HEAD_OFFICE'
        : req.query.branchId ? parseId(req.query.branchId) : null;
      const activeOnly = req.query.active === 'true';
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      if (req.query.branchId && branchId !== 'HEAD_OFFICE' && !branchId) return res.status(400).json({ message: 'Invalid branch ID' });

      const conditions = [];
      const params = [];
      if (branchId === 'HEAD_OFFICE') {
        conditions.push('s.branch_id IS NULL');
      } else if (branchId) {
        params.push(branchId);
        conditions.push(`s.branch_id=$${params.length}`);
      }
      if (activeOnly) conditions.push('s.is_active=true');
      if (search) {
        params.push(`%${search.replace(/[%_\\]/g, '\\$&')}%`);
        conditions.push(`(s.name ILIKE $${params.length} ESCAPE '\\\\' OR s.phone ILIKE $${params.length} ESCAPE '\\\\' OR COALESCE(s.email,'') ILIKE $${params.length} ESCAPE '\\\\')`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await query(
        `SELECT s.id,s.name,s.phone,s.email,s.role,s.branch_id,s.is_active,s.created_at,s.updated_at,b.name branch_name,b.code branch_code
         FROM staff s
         LEFT JOIN branches b ON b.id=s.branch_id
         ${where}
         ORDER BY s.is_active DESC,s.name ASC,s.id ASC`,
        params
      );
      res.json({ staff: rows.map(serializeStaff), roles: STAFF_ROLES });
    } catch (error) {
      console.error('Admin staff list failed:', error.message);
      res.status(500).json({ message: 'Unable to load staff' });
    }
  });

  app.post('/api/admin/staff', auth(['admin']), async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    const email = normalizeOptionalText(body.email);
    const role = typeof body.role === 'string' ? body.role.trim().toUpperCase() : '';
    const branchId = body.branch_id == null || body.branch_id === '' || body.branch_id === 'HEAD_OFFICE'
      ? null
      : parseId(body.branch_id);

    if (!name) return res.status(400).json({ message: 'Staff name is required' });
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit phone number' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (!STAFF_ROLES.includes(role)) return res.status(400).json({ message: 'Select a valid staff role' });
    if (body.branch_id != null && body.branch_id !== '' && body.branch_id !== 'HEAD_OFFICE' && !branchId) return res.status(400).json({ message: 'Select a valid location' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (branchId) {
        const { rows } = await client.query('SELECT id FROM branches WHERE id=$1 AND is_active=true FOR SHARE', [branchId]);
        if (!rows[0]) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Selected branch is not active' });
        }
      }
      const { rows: existingPhone } = await client.query('SELECT id FROM staff WHERE phone=$1', [phone]);
      if (existingPhone[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'A staff member with this phone number already exists' });
      }
      if (email) {
        const { rows: existingEmail } = await client.query('SELECT id FROM staff WHERE lower(email)=lower($1)', [email]);
        if (existingEmail[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: 'A staff member with this email already exists' });
        }
      }
      const { rows: [created] } = await client.query(
        `INSERT INTO staff(name,phone,email,role,branch_id,is_active,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,true,NOW(),NOW()) RETURNING id`,
        [name, phone, email, role, branchId]
      );
      const { rows: [staff] } = await client.query(
        `SELECT s.id,s.name,s.phone,s.email,s.role,s.branch_id,s.is_active,s.created_at,s.updated_at,b.name branch_name,b.code branch_code
         FROM staff s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1`,
        [created.id]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: 'Staff member created successfully', staff: serializeStaff(staff) });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('Admin staff create failed:', error.message);
      res.status(500).json({ message: 'Unable to create staff member' });
    } finally {
      client.release();
    }
  });

  app.patch('/api/admin/staff/:id', auth(['admin']), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid staff ID' });
    const body = req.body || {};
    const allowed = ['name', 'phone', 'email', 'role', 'branch_id', 'is_active'];
    const unknown = Object.keys(body).filter(key => !allowed.includes(key));
    if (unknown.length) return res.status(400).json({ message: 'Request contains unsupported fields' });
    if (!Object.keys(body).length) return res.status(400).json({ message: 'At least one staff field is required' });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [existing] } = await client.query('SELECT * FROM staff WHERE id=$1 FOR UPDATE', [id]);
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Staff member not found' });
      }

      const updates = {};
      if (Object.prototype.hasOwnProperty.call(body, 'name')) {
        if (typeof body.name !== 'string' || !body.name.trim()) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Staff name is required' }); }
        updates.name = body.name.trim();
      }
      if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
        const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
        if (!/^\d{10}$/.test(phone)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Enter a valid 10-digit phone number' }); }
        const { rows } = await client.query('SELECT id FROM staff WHERE phone=$1 AND id<>$2', [phone, id]);
        if (rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A staff member with this phone number already exists' }); }
        updates.phone = phone;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'email')) {
        const email = normalizeOptionalText(body.email);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Enter a valid email address' }); }
        if (email) {
          const { rows } = await client.query('SELECT id FROM staff WHERE lower(email)=lower($1) AND id<>$2', [email, id]);
          if (rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A staff member with this email already exists' }); }
        }
        updates.email = email;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'role')) {
        const role = typeof body.role === 'string' ? body.role.trim().toUpperCase() : '';
        if (!STAFF_ROLES.includes(role)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Select a valid staff role' }); }
        updates.role = role;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'branch_id')) {
        const branchId = body.branch_id == null || body.branch_id === '' || body.branch_id === 'HEAD_OFFICE' ? null : parseId(body.branch_id);
        if (body.branch_id != null && body.branch_id !== '' && body.branch_id !== 'HEAD_OFFICE' && !branchId) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Select a valid location' }); }
        if (branchId) {
          const { rows } = await client.query('SELECT id FROM branches WHERE id=$1 AND is_active=true FOR SHARE', [branchId]);
          if (!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Selected branch is not active' }); }
        }
        updates.branch_id = branchId;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
        if (typeof body.is_active !== 'boolean') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'is_active must be boolean' }); }
        updates.is_active = body.is_active;
      }

      const columns = Object.keys(updates);
      const values = columns.map(column => updates[column]);
      const assignments = columns.map((column, index) => `${column}=$${index + 1}`).join(',');
      const { rows: [updated] } = await client.query(
        `UPDATE staff SET ${assignments},updated_at=NOW() WHERE id=$${values.length + 1} RETURNING id`,
        [...values, id]
      );
      const { rows: [staff] } = await client.query(
        `SELECT s.id,s.name,s.phone,s.email,s.role,s.branch_id,s.is_active,s.created_at,s.updated_at,b.name branch_name,b.code branch_code
         FROM staff s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1`,
        [updated.id]
      );
      await client.query('COMMIT');
      res.json({ message: 'Staff member updated successfully', staff: serializeStaff(staff) });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('Admin staff update failed:', error.message);
      res.status(500).json({ message: 'Unable to update staff member' });
    } finally {
      client.release();
    }
  });
  app.get('/api/admin/staff/:id/attendance', auth(['admin']), async (req, res) => {
    const staffId = parseId(req.params.id);
    if (!staffId) return res.status(400).json({ message: 'Invalid staff ID' });

    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const defaultTo = now.toISOString().slice(0, 10);
    const from = req.query.from ? String(req.query.from) : defaultFrom;
    const to = req.query.to ? String(req.query.to) : defaultTo;

    if (!validDate(from) || !validDate(to)) return res.status(400).json({ message: 'Use YYYY-MM-DD dates' });
    if (from > to) return res.status(400).json({ message: 'Attendance start date cannot be after end date' });

    try {
      const { rows: [staff] } = await query(
        `SELECT s.id,s.name,s.phone,s.role,s.branch_id,s.is_active,b.name branch_name,b.code branch_code
         FROM staff s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1`,
        [staffId]
      );
      if (!staff) return res.status(404).json({ message: 'Staff member not found' });

      const { rows } = await query(
        `SELECT id,attendance_date,punch_in,punch_out,total_work_seconds
         FROM staff_attendance
         WHERE staff_id=$1 AND attendance_date BETWEEN $2::date AND $3::date
         ORDER BY attendance_date DESC,punch_in DESC`,
        [staffId, from, to]
      );

      const totalWorkSeconds = rows.reduce((sum, row) => sum + Number(row.total_work_seconds || 0), 0);
      const completedDays = rows.filter(row => row.punch_out).length;
      const openDays = rows.filter(row => !row.punch_out).length;

      res.json({
        staff: serializeStaff(staff),
        range: { from, to },
        summary: {
          days_present: rows.length,
          completed_days: completedDays,
          open_days: openDays,
          total_work_seconds: totalWorkSeconds
        },
        attendance: rows.map(row => ({
          id: row.id,
          attendance_date: row.attendance_date,
          punch_in: row.punch_in,
          punch_out: row.punch_out,
          punch_in_ist: row.punch_in ? new Date(row.punch_in).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : null,
          punch_out_ist: row.punch_out ? new Date(row.punch_out).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) : null,
          total_work_seconds: row.total_work_seconds
        }))
      });
    } catch (error) {
      console.error('Admin staff attendance failed:', error.message);
      res.status(500).json({ message: 'Unable to load staff attendance' });
    }
  });

};
