import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Search, Store } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
async function request(path, token, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}
export default function BranchMenuAvailability({ branch, adminToken, onBack }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await request(`/admin/branches/${branch.id}/menu-availability`, adminToken); setItems(data.items || []); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [branch.id, adminToken]);
  useEffect(() => { load(); }, [load]);
  const toggle = async item => {
    setSavingId(item.id); setError(''); setNotice('');
    try {
      const data = await request(`/admin/branches/${branch.id}/menu-availability/${item.id}`, adminToken, { method: 'PATCH', body: JSON.stringify({ is_available: !item.branch_available }) });
      setItems(current => current.map(row => row.id === item.id ? { ...row, branch_available: data.item.is_available } : row));
      setNotice(`${item.name} is now ${data.item.is_available ? 'available' : 'unavailable'} at ${branch.name}.`);
    } catch (e) { setError(e.message); } finally { setSavingId(null); }
  };
  const filtered = items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()) || String(item.category_name || '').toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="admin-branch-module admin-branch-availability">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Branch Dashboard</button>
    <header className="admin-orders-header"><div><span className="admin-panel-eyebrow">BRANCH OPERATIONS · MENU AVAILABILITY</span><h1>Menu Availability</h1><p>Choose which active master menu items can be ordered at {branch.name}. Changes affect this branch only.</p></div><button className="admin-retry-button" type="button" onClick={load}><RefreshCw /> Refresh</button></header>
    {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}
    {notice && <div className="admin-branch-feedback" role="status"><Check /> {notice}</div>}
    <label className="admin-orders-search"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items or categories" /></label>
    {loading ? <div className="admin-branch-feedback">Loading menu availability…</div> : !filtered.length ? <div className="admin-branch-feedback">No menu items found.</div> : <div className="admin-availability-list">{filtered.map(item => <article key={item.id} className="admin-availability-row"><div className="admin-state-icon"><Store /></div><div className="admin-availability-copy"><strong>{item.name}</strong><small>{item.category_name || 'Uncategorized'} · Master status: {item.is_active ? 'Active' : 'Archived'}</small><span className={item.branch_available && item.is_active ? 'admin-branch-status is-active' : 'admin-branch-status is-inactive'}><i />{item.is_active && item.branch_available ? 'Available at branch' : 'Unavailable at branch'}</span></div><button type="button" className="admin-approve-button" disabled={savingId === item.id || !item.is_active} onClick={() => toggle(item)}>{savingId === item.id ? 'Saving…' : item.branch_available ? 'Make unavailable' : 'Make available'}</button></article>)}</div>}
  </section>;
}
