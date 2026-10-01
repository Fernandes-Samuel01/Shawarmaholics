import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, IndianRupee, LoaderCircle, RefreshCw, XCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const request = async (path, options = {}, token = '') => {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};
const money = value => `₹${Number(value || 0).toFixed(2)}`;

export default function BranchPricing({ branch, onBack }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('shawarmaholics_admin_token') || '');
  const [email, setEmail] = useState('admin@shawarmaholics.in');
  const [password, setPassword] = useState('');
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [prices, setPrices] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const load = async activeToken => {
    setStatus('loading'); setError('');
    try {
      const data = await request(`/branches/${branch.id}/pricing`, {}, activeToken);
      setItems(data.items || []); setHistory(data.history || []); setStatus('ready');
    } catch (e) { setError(e.message); setStatus('error'); }
  };
  useEffect(() => { if (token) load(token); else setStatus('ready'); }, [token, branch.id]);

  const pendingCount = useMemo(() => items.filter(item => item.pending_proposal_id).length, [items]);

  const login = async event => {
    event.preventDefault(); setLoginBusy(true); setError('');
    try {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (!['admin', 'manager'].includes(data.user?.role)) throw new Error('This screen requires an authorized branch manager or Head Office admin account');
      if (data.user.role === 'manager' && Number(data.user.branch_id) !== Number(branch.id)) throw new Error('This account is not assigned to this branch');
      sessionStorage.setItem('shawarmaholics_admin_token', data.token);
      setToken(data.token); setPassword('');
    } catch (e) { setError(e.message); } finally { setLoginBusy(false); }
  };

  const propose = async item => {
    const value = Number(prices[item.menu_item_id]);
    if (!Number.isFinite(value) || value < Number(item.master_price)) {
      setError(`Enter a price of at least ${money(item.master_price)} for ${item.name}.`);
      return;
    }
    setBusyId(item.menu_item_id); setError('');
    try {
      await request(`/branches/${branch.id}/pricing/proposals`, {
        method: 'POST',
        body: JSON.stringify({ menuItemId: item.menu_item_id, proposedPrice: Number(value.toFixed(2)) })
      }, token);
      setPrices(current => ({ ...current, [item.menu_item_id]: '' }));
      await load(token);
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  if (!token) return <section className="admin-branch-module admin-branch-pricing" aria-labelledby="branch-pricing-title">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Branch Dashboard</button>
    <header className="admin-branch-module-header"><span className="admin-panel-eyebrow">BRANCH PRICING</span><h1 id="branch-pricing-title">{branch.name}</h1><p>Propose branch selling prices. Head Office approval is required before a proposal becomes effective.</p></header>
    <form className="admin-pricing-login" onSubmit={login}>
      <div><strong>Sign in to manage branch pricing</strong><p>Use the branch manager account for this branch, or a Head Office admin account.</p></div>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Account email" required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
      <button type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in...' : 'Sign in'}</button>
    </form>
    {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}
  </section>;

  return <section className="admin-branch-module admin-branch-pricing" aria-labelledby="branch-pricing-title">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Branch Dashboard</button>
    <header className="admin-branch-module-header">
      <div><span className="admin-panel-eyebrow">BRANCH PRICING · {branch.code}</span><h1 id="branch-pricing-title">{branch.name}</h1><p>Propose selling prices for this branch. Pending proposals never change the live price.</p></div>
      <button className="admin-retry-button" type="button" onClick={() => load(token)}><RefreshCw /> Refresh</button>
    </header>
    {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}
    {status === 'loading' && <div className="admin-branch-feedback"><LoaderCircle className="admin-spin" /> Loading branch pricing...</div>}
    {status === 'ready' && <><div className="admin-pricing-summary"><div><small>Menu items</small><strong>{items.length}</strong></div><div><small>Pending proposals</small><strong>{pendingCount}</strong></div></div>
      <div className="admin-pricing-table-wrap"><table className="admin-pricing-table"><thead><tr><th>Menu item</th><th>Master</th><th>Current effective</th><th>Proposed</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(item => <tr key={item.menu_item_id}>
        <td><strong>{item.name}</strong></td><td><IndianRupee size={14} /> {money(item.master_price)}</td><td><IndianRupee size={14} /> {money(item.effective_price)}</td>
        <td>{item.pending_proposal_id ? <span>{money(item.pending_price)}</span> : <input className="admin-pricing-inline-input" type="number" min={Number(item.master_price)} step="0.01" value={prices[item.menu_item_id] ?? ''} onChange={e => setPrices(current => ({ ...current, [item.menu_item_id]: e.target.value }))} placeholder={Number(item.effective_price).toFixed(2)} />}</td>
        <td>{item.pending_proposal_id ? <span className="admin-proposal-status status-pending"><Clock3 /> Pending</span> : <span className="admin-proposal-status status-approved"><CheckCircle2 /> Effective</span>}</td>
        <td>{item.pending_proposal_id ? <span className="admin-pricing-muted">Awaiting Head Office</span> : <button className="admin-primary-action admin-pricing-submit" type="button" disabled={busyId === item.menu_item_id || prices[item.menu_item_id] === '' || prices[item.menu_item_id] == null} onClick={() => propose(item)}>{busyId === item.menu_item_id ? 'Submitting...' : 'Submit'}</button>}</td>
      </tr>)}</tbody></table></div>
      <section className="admin-pricing-history"><div className="admin-section-heading"><span className="admin-panel-eyebrow">PROPOSAL HISTORY</span><h2>Recent proposals</h2></div>
      {!history.length ? <div className="admin-branch-feedback">No proposals submitted for this branch yet.</div> : <div className="admin-proposal-list">{history.map(item => <article className="admin-proposal-card" key={item.id}><div className="admin-proposal-main"><div><span className="admin-panel-eyebrow">{item.menu_item_name}</span><h3>{money(item.proposed_price)}</h3></div><span className={`admin-proposal-status status-${item.status.toLowerCase()}`}>{item.status === 'APPROVED' ? <CheckCircle2 /> : item.status === 'REJECTED' ? <XCircle /> : <Clock3 />} {item.status}</span></div>{item.rejection_reason && <p className="admin-proposal-reason">Reason: {item.rejection_reason}</p>}</article>)}</div>}
      </section></>}
  </section>;
}
