import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, IndianRupee, LoaderCircle, RefreshCw, X } from 'lucide-react';

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

export default function MasterPricing({ adminToken, onBack }) {
  const [items, setItems] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const token = adminToken;
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('PENDING');

  const load = async activeToken => {
    setStatus('loading');
    setError('');
    try {
      const master = await request('/admin/menu/items');
      setItems(master.items || []);
      if (activeToken) {
        const data = await request('/admin/branch-pricing/proposals', {}, activeToken);
        setProposals(data.proposals || []);
      } else {
        setProposals([]);
      }
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  useEffect(() => { load(token); }, [token]);

  const visible = useMemo(() => proposals.filter(item => filter === 'ALL' || item.status === filter), [proposals, filter]);
  const pendingCount = proposals.filter(item => item.status === 'PENDING').length;

  const review = async (id, decision, rejectionReason = '') => {
    setReviewingId(id);
    setError('');
    try {
      await request(`/admin/branch-pricing/proposals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, ...(decision === 'REJECT' ? { reason: rejectionReason } : {}) })
      }, token);
      setRejectingId(null);
      setReason('');
      await load(token);
    } catch (e) {
      setError(e.message);
    } finally {
      setReviewingId(null);
    }
  };

  return <section className="admin-pricing-page" aria-labelledby="master-pricing-title">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Head Office</button>
    <header className="admin-pricing-header">
      <div>
        <span className="admin-panel-eyebrow">HEAD OFFICE · PRICING</span>
        <h1 id="master-pricing-title">Master Pricing</h1>
        <p>Control master prices and review branch price proposals before they become effective.</p>
      </div>
      <button className="admin-retry-button" type="button" onClick={() => load(token)}><RefreshCw /> Refresh</button>
    </header>

    <section className="admin-pricing-section">
      <div className="admin-section-heading"><span className="admin-panel-eyebrow">MASTER PRICES</span><h2>Official menu prices</h2><p>These are the centrally controlled prices used as the branch pricing floor.</p></div>
      {status === 'loading' && <div className="admin-branch-feedback"><LoaderCircle className="admin-spin" /> Loading prices...</div>}
      {items.length > 0 && <div className="admin-pricing-table-wrap"><table className="admin-pricing-table"><thead><tr><th>Menu item</th><th>Master price</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.name}</td><td><IndianRupee size={15} /> {money(item.price)}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="admin-pricing-section">
      <div className="admin-section-heading"><span className="admin-panel-eyebrow">BRANCH APPROVALS</span><h2>Price proposals {pendingCount > 0 && <span className="admin-pricing-count">{pendingCount}</span>}</h2><p>Approve or reject proposals. A proposal changes the branch's effective price only after approval.</p></div>

      {!token && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">Head Office admin authentication is required.</div>}

      {token && <div className="admin-pricing-tabs">{['PENDING','APPROVED','REJECTED','ALL'].map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'PENDING' ? `Pending ${pendingCount ? `(${pendingCount})` : ''}` : value.charAt(0) + value.slice(1).toLowerCase()}</button>)}</div>}

      {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}

      {token && status !== 'loading' && visible.length === 0 && <div className="admin-branch-feedback" role="status">{filter === 'PENDING' ? 'No pending branch price proposals.' : 'No proposals in this view.'}</div>}

      {token && visible.length > 0 && <div className="admin-proposal-list">{visible.map(proposal => <article className="admin-proposal-card" key={proposal.id}>
        <div className="admin-proposal-main">
          <div><span className="admin-panel-eyebrow">{proposal.branch_code} · {proposal.branch_name}</span><h3>{proposal.menu_item_name}</h3></div>
          <span className={`admin-proposal-status status-${proposal.status.toLowerCase()}`}>{proposal.status}</span>
        </div>
        <div className="admin-proposal-values"><div><small>Master</small><strong>{money(proposal.current_master_price)}</strong></div><div><small>Current branch</small><strong>{money(proposal.effective_price)}</strong></div><div><small>Proposed</small><strong>{money(proposal.proposed_price)}</strong></div></div>
        {proposal.status === 'PENDING' && <div className="admin-proposal-actions">
          <button type="button" className="admin-approve-button" disabled={reviewingId === proposal.id} onClick={() => review(proposal.id, 'APPROVE')}><Check /> {reviewingId === proposal.id ? 'Approving...' : 'Approve'}</button>
          {rejectingId === proposal.id ? <div className="admin-reject-form"><input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" /><button type="button" disabled={reviewingId === proposal.id} onClick={() => review(proposal.id, 'REJECT', reason)}><X /> Reject</button></div> : <button type="button" className="admin-reject-button" disabled={reviewingId === proposal.id} onClick={() => setRejectingId(proposal.id)}><X /> Reject</button>}
        </div>}
        {proposal.status === 'REJECTED' && proposal.rejection_reason && <p className="admin-proposal-reason">Reason: {proposal.rejection_reason}</p>}
      </article>)}</div>}
    </section>
  </section>;
}
