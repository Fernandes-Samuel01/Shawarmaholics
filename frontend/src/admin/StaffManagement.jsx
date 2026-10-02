import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, Clock3, Edit3, Eye, Plus, Search, UserCheck, UserRound, UserX, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const ROLE_LABELS = {
  MANAGER: 'Manager',
  SUPERVISOR: 'Supervisor',
  KITCHEN: 'Kitchen',
  CASHIER: 'Cashier',
  STAFF: 'General Staff'
};

const api = (path, token, opts = {}) => fetch(API + path, {
  ...opts,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...opts.headers }
}).then(async response => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
});

const emptyForm = { name: '', phone: '', email: '', role: 'STAFF', branch_id: 'HEAD_OFFICE', is_active: true };

const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date
    ? value
    : new Date(`${String(value).slice(0, 10)}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function StaffManagement({ adminToken, onBack }) {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState(Object.keys(ROLE_LABELS));
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [attendanceStaff, setAttendanceStaff] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [attendanceFrom, setAttendanceFrom] = useState(monthStart);
  const [attendanceTo, setAttendanceTo] = useState(today);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [staffData, branchData] = await Promise.all([
        api('/admin/staff', adminToken),
        fetch(API + '/branches').then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Unable to load branches');
          return data;
        })
      ]);
      setStaff(staffData.staff || []);
      setRoles(staffData.roles?.length ? staffData.roles : Object.keys(ROLE_LABELS));
      setBranches(branchData.branches || []);
    } catch (err) {
      setError(err.message || 'Unable to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter(person => {
      const matchesSearch = !term || [person.name, person.phone, person.email, person.role, person.branch_name].some(value => String(value || '').toLowerCase().includes(term));
      const matchesLocation = locationFilter === 'ALL'
        || (locationFilter === 'HEAD_OFFICE' ? !person.branch_id : String(person.branch_id) === locationFilter);
      const matchesStatus = statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' ? person.is_active : !person.is_active);
      return matchesSearch && matchesLocation && matchesStatus;
    });
  }, [staff, search, locationFilter, statusFilter]);

  const activeCount = staff.filter(person => person.is_active).length;
  const branchCount = new Set(staff.filter(person => person.branch_id).map(person => person.branch_id)).size;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const openEdit = person => {
    setEditing(person);
    setForm({
      name: person.name || '',
      phone: person.phone || '',
      email: person.email || '',
      role: person.role || 'STAFF',
      branch_id: person.branch_id ? String(person.branch_id) : 'HEAD_OFFICE',
      is_active: Boolean(person.is_active)
    });
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim(),
        role: form.role,
        branch_id: form.branch_id,
        is_active: form.is_active
      };
      const data = editing
        ? await api('/admin/staff/' + editing.id, adminToken, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api('/admin/staff', adminToken, { method: 'POST', body: JSON.stringify(payload) });
      setStaff(current => editing
        ? current.map(person => person.id === data.staff.id ? data.staff : person)
        : [...current, data.staff]);
      setFormOpen(false);
      setEditing(null);
      setNotice(editing ? 'Staff profile updated successfully.' : 'Staff member created successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save staff member');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async person => {
    setError('');
    setNotice('');
    try {
      const data = await api('/admin/staff/' + person.id, adminToken, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !person.is_active })
      });
      setStaff(current => current.map(item => item.id === data.staff.id ? data.staff : item));
      setNotice(data.staff.is_active ? 'Staff member activated.' : 'Staff member deactivated.');
    } catch (err) {
      setError(err.message || 'Unable to update staff status');
    }
  };

  const openAttendance = async person => {
    setAttendanceStaff(person);
    setAttendanceData(null);
    setAttendanceError('');
    setAttendanceFrom(monthStart());
    setAttendanceTo(today());
    setAttendanceLoading(true);
    try {
      const data = await api(`/admin/staff/${person.id}/attendance?from=${monthStart()}&to=${today()}`, adminToken);
      setAttendanceData(data);
    } catch (err) {
      setAttendanceError(err.message || 'Unable to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const refreshAttendance = async event => {
    event?.preventDefault();
    if (!attendanceStaff) return;
    setAttendanceLoading(true);
    setAttendanceError('');
    try {
      if (attendanceFrom > attendanceTo) throw new Error('Start date cannot be after end date');
      const data = await api(`/admin/staff/${attendanceStaff.id}/attendance?from=${attendanceFrom}&to=${attendanceTo}`, adminToken);
      setAttendanceData(data);
    } catch (err) {
      setAttendanceError(err.message || 'Unable to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  };

  return <section className="admin-staff-page" aria-labelledby="staff-management-title">
    <div className="admin-staff-header">
      <div>
        <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Head Office</button>
        <span className="admin-panel-eyebrow">PEOPLE & OPERATIONS</span>
        <h1 id="staff-management-title">Staff Management</h1>
        <p>Manage staff roles, primary locations and active access from Head Office.</p>
      </div>
      <button className="admin-primary-action" type="button" onClick={openCreate}><Plus /> Add Staff</button>
    </div>

    <div className="admin-staff-metrics">
      <article><span>TOTAL STAFF</span><strong>{staff.length}</strong><small>All profiles</small></article>
      <article><span>ACTIVE STAFF</span><strong>{activeCount}</strong><small>Currently active</small></article>
      <article><span>LOCATIONS</span><strong>{branchCount}</strong><small>Branches with staff</small></article>
    </div>

    {notice && <div className="admin-staff-notice"><Check /> {notice}</div>}
    {error && <div className="admin-staff-error" role="alert">{error}</div>}

    <div className="admin-staff-toolbar">
      <label className="admin-staff-search">
        <Search />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone, email or role" />
      </label>
      <label>
        <span>LOCATION</span>
        <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)}>
          <option value="ALL">All locations</option>
          <option value="HEAD_OFFICE">Head Office</option>
          {branches.map(branch => <option value={String(branch.id)} key={branch.id}>{branch.name}</option>)}
        </select>
      </label>
      <label>
        <span>STATUS</span>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ALL">All</option>
        </select>
      </label>
    </div>

    <div className="admin-staff-table-wrap">
      {loading ? <div className="admin-staff-empty"><UserRound /><h2>Loading staff...</h2><p>Synchronizing the staff directory.</p></div>
        : filtered.length === 0 ? <div className="admin-staff-empty"><UserRound /><h2>No staff found</h2><p>{search ? 'Try a different search.' : 'Create the first staff profile from Head Office.'}</p></div>
        : <table className="admin-staff-table">
          <thead><tr><th>STAFF MEMBER</th><th>ROLE</th><th>PRIMARY LOCATION</th><th>CONTACT</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>{filtered.map(person => <tr key={person.id}>
            <td data-label="Staff member"><strong>{person.name}</strong><small>Staff ID #{person.id}</small></td>
            <td data-label="Role"><span className="admin-staff-role">{roleLabel(person.role)}</span></td>
            <td data-label="Primary location"><b>{person.branch_name}</b>{person.branch_code && <small>{person.branch_code}</small>}</td>
            <td data-label="Contact"><span>{person.phone}</span><small>{person.email || 'No email added'}</small></td>
            <td data-label="Status"><span className={'admin-staff-status ' + (person.is_active ? 'active' : 'inactive')}><i />{person.is_active ? 'Active' : 'Inactive'}</span></td>
            <td data-label="Actions"><div className="admin-staff-actions">
              <button type="button" title="View attendance" onClick={() => openAttendance(person)}><Eye /> Attendance</button>
              <button type="button" title="Edit staff" onClick={() => openEdit(person)}><Edit3 /> Edit</button>
              <button type="button" className={person.is_active ? 'danger' : 'restore'} onClick={() => toggleStatus(person)}>{person.is_active ? <UserX /> : <UserCheck />}{person.is_active ? 'Deactivate' : 'Activate'}</button>
            </div></td>
          </tr>)}</tbody>
        </table>}
    </div>

    {formOpen && <div className="admin-staff-modal-backdrop" role="presentation">
      <section className="admin-staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
        <header><div><span className="admin-panel-eyebrow">{editing ? 'EDIT STAFF' : 'NEW STAFF'}</span><h2 id="staff-form-title">{editing ? 'Edit staff profile' : 'Add staff member'}</h2></div><button type="button" className="admin-staff-close" onClick={() => setFormOpen(false)} aria-label="Close"><X /></button></header>
        <form onSubmit={save}>
          <div className="admin-staff-form-grid">
            <label><span>FULL NAME *</span><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Staff member name" required /></label>
            <label><span>PHONE *</span><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} inputMode="numeric" placeholder="10-digit mobile" required /></label>
            <label><span>EMAIL</span><input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="staff@example.com" /></label>
            <label><span>ROLE *</span><select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{roles.map(role => <option value={role} key={role}>{roleLabel(role)}</option>)}</select></label>
            <label><span>PRIMARY LOCATION *</span><select value={form.branch_id} onChange={event => setForm(current => ({ ...current, branch_id: event.target.value }))}><option value="HEAD_OFFICE">Head Office</option>{branches.map(branch => <option value={String(branch.id)} key={branch.id}>{branch.name}</option>)}</select></label>
            {editing && <label className="admin-staff-checkbox"><span>STATUS</span><button type="button" onClick={() => setForm(current => ({ ...current, is_active: !current.is_active }))} className={form.is_active ? 'selected' : ''} aria-pressed={form.is_active}>{form.is_active ? 'ACTIVE' : 'INACTIVE'}</button></label>}
          </div>
          <p className="admin-staff-form-note">A staff profile has one primary operating location. Branch-specific management screens and permissions will be connected in the later branch/manager phase.</p>
          <div className="admin-staff-modal-actions"><button type="button" className="admin-secondary-action" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="admin-primary-action" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Staff'}</button></div>
        </form>
      </section>
    </div>}

    {attendanceStaff && <div className="admin-staff-modal-backdrop" role="presentation">
      <section className="admin-staff-modal admin-staff-attendance-modal" role="dialog" aria-modal="true" aria-labelledby="staff-attendance-title">
        <header>
          <div><span className="admin-panel-eyebrow">ATTENDANCE HISTORY</span><h2 id="staff-attendance-title">{attendanceStaff.name}</h2><p>{roleLabel(attendanceStaff.role)} · {attendanceStaff.branch_name}</p></div>
          <button type="button" className="admin-staff-close" onClick={() => { setAttendanceStaff(null); setAttendanceData(null) }} aria-label="Close"><X /></button>
        </header>

        <form className="admin-staff-attendance-filters" onSubmit={refreshAttendance}>
          <label><span>FROM</span><input type="date" value={attendanceFrom} onChange={event => setAttendanceFrom(event.target.value)} /></label>
          <label><span>TO</span><input type="date" value={attendanceTo} onChange={event => setAttendanceTo(event.target.value)} /></label>
          <button type="submit" className="admin-primary-action" disabled={attendanceLoading}><CalendarDays /> {attendanceLoading ? 'Loading...' : 'View'}</button>
        </form>

        {attendanceError && <div className="admin-staff-error" role="alert">{attendanceError}</div>}

        {attendanceLoading && !attendanceData ? <div className="admin-staff-empty"><Clock3 /><h2>Loading attendance...</h2><p>Reading punch-in and punch-out records.</p></div>
          : attendanceData && <>
            <div className="admin-staff-attendance-summary">
              <article><span>DAYS PRESENT</span><strong>{attendanceData.summary.days_present}</strong><small>Attendance records</small></article>
              <article><span>COMPLETED SHIFTS</span><strong>{attendanceData.summary.completed_days}</strong><small>With punch out</small></article>
              <article><span>TOTAL HOURS</span><strong>{formatDuration(attendanceData.summary.total_work_seconds)}</strong><small>For selected period</small></article>
            </div>
            <div className="admin-staff-attendance-table-wrap">
              {attendanceData.attendance.length ? <table className="admin-staff-attendance-table">
                <thead><tr><th>DATE</th><th>PUNCH IN</th><th>PUNCH OUT</th><th>WORKED</th></tr></thead>
                <tbody>{attendanceData.attendance.map(row => <tr key={row.id}>
                  <td><b>{formatDate(row.attendance_date)}</b></td>
                  <td>{formatTime(row.punch_in)}</td>
                  <td>{formatTime(row.punch_out)}</td>
                  <td><strong>{formatDuration(row.total_work_seconds)}</strong></td>
                </tr>)}</tbody>
              </table> : <div className="admin-staff-empty"><CalendarDays /><h2>No attendance records</h2><p>No punch-in records were found for this period.</p></div>}
            </div>
          </>}
      </section>
    </div>}
  </section>;
}
