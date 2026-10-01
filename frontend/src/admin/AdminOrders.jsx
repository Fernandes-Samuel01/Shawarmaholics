import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock3, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';

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
const statusLabel = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const paymentLabel = value => value === 'paid' ? 'Paid' : 'Awaiting payment';
const formatTime = value => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const statuses = ['ALL', 'awaiting_payment', 'confirmed', 'new', 'preparing', 'completed', 'cancelled'];

export default function AdminOrders({ adminToken, onBack }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [branchId, setBranchId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (branchId !== 'ALL') params.set('branchId', branchId);
      if (search.trim()) params.set('search', search.trim());
      const [orderData, branchData] = await Promise.all([
        request(`/admin/orders?${params.toString()}`, {}, adminToken),
        branches.length ? Promise.resolve({ branches }) : request('/branches')
      ]);
      setOrders(orderData.orders || []);
      if (!branches.length) setBranches(branchData.branches || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status, branchId]);

  const selected = useMemo(() => orders.find(order => Number(order.id) === Number(selectedId)) || null, [orders, selectedId]);

  const runStatus = async (order, nextStatus) => {
    setActionId(order.id);
    setError('');
    try {
      const data = await request(`/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      }, adminToken);
      setOrders(current => current.map(item => Number(item.id) === Number(order.id) ? { ...item, ...data.order } : item));
    } catch (e) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  const itemCustomizations = item => {
    const groups = item.customizations?.groups || [];
    const names = groups.flatMap(group => (group.options || []).map(option => option.name));
    return names.join(' · ');
  };

  return <section className="admin-orders-page" aria-labelledby="admin-orders-title">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Head Office</button>

    <header className="admin-orders-header">
      <div>
        <span className="admin-panel-eyebrow">HEAD OFFICE · OPERATIONS</span>
        <h1 id="admin-orders-title">Orders Management</h1>
        <p>View orders across all branches, inspect order details and advance active orders through the existing workflow.</p>
      </div>
      <button className="admin-retry-button" type="button" onClick={load}><RefreshCw /> Refresh</button>
    </header>

    {!adminToken && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">Head Office admin authentication is required.</div>}

    {adminToken && <section className="admin-orders-toolbar" aria-label="Order filters">
      <label className="admin-orders-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} placeholder="Search order number" aria-label="Search order number" /></label>
      <label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(value => <option value={value} key={value}>{value === 'ALL' ? 'All statuses' : statusLabel(value)}</option>)}</select></label>
      <label><span>Branch</span><select value={branchId} onChange={event => setBranchId(event.target.value)}><option value="ALL">All branches</option>{branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
    </section>}

    {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}

    {adminToken && <section className={`admin-orders-content${selected ? ' has-detail' : ''}`}>
      <div className="admin-orders-list-wrap">
        <div className="admin-orders-list-heading"><div><span className="admin-panel-eyebrow">ORDER QUEUE</span><h2>{orders.length} {orders.length === 1 ? 'order' : 'orders'}</h2></div><small>Newest first</small></div>

        {loading && <div className="admin-branch-feedback"><LoaderCircle className="admin-spin" /> Loading orders...</div>}
        {!loading && !orders.length && <div className="admin-branch-feedback" role="status">No orders match the selected filters.</div>}

        {!loading && orders.length > 0 && <div className="admin-orders-table-wrap"><table className="admin-orders-table"><thead><tr><th>Order</th><th>Branch</th><th>Type</th><th>Total</th><th>Payment</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>
          {orders.map(order => <tr key={order.id} className={Number(selectedId) === Number(order.id) ? 'selected' : ''} onClick={() => setSelectedId(order.id)}>
            <td><strong>#{order.order_number}</strong></td>
            <td>{order.branch_name || 'Unassigned'}{order.branch_code && <small>{order.branch_code}</small>}</td>
            <td>{order.order_type}</td>
            <td>{money(order.total)}</td>
            <td><span className={`admin-order-payment ${order.payment_status}`}>{paymentLabel(order.payment_status)}</span></td>
            <td><span className={`admin-order-status status-${order.status}`}>{statusLabel(order.status)}</span></td>
            <td>{formatTime(order.created_at)}</td>
            <td><ChevronRight /></td>
          </tr>)}
        </tbody></table></div>}
      </div>

      {selected && <aside className="admin-order-detail" aria-label={`Order #${selected.order_number} details`}>
        <div className="admin-order-detail-head"><div><span className="admin-panel-eyebrow">ORDER DETAIL</span><h2>#{selected.order_number}</h2></div><button type="button" aria-label="Close order details" onClick={() => setSelectedId(null)}><X /></button></div>
        <div className="admin-order-detail-meta">
          <span><b>Branch</b>{selected.branch_name || 'Unassigned'}</span>
          <span><b>Order type</b>{selected.order_type}</span>
          <span><b>Payment</b>{paymentLabel(selected.payment_status)}</span>
          <span><b>Created</b>{formatTime(selected.created_at)}</span>
        </div>
        <div className="admin-order-detail-status"><span className={`admin-order-status status-${selected.status}`}>{statusLabel(selected.status)}</span></div>

        <div className="admin-order-items">
          {(selected.items || []).map(item => <article key={item.id}>
            <div className="admin-order-item-main"><div><strong>{item.name}</strong><span>Qty {item.quantity}</span>{itemCustomizations(item) && <small>{itemCustomizations(item)}</small>}{item.customizations?.specialRequest && <small>Request: {item.customizations.specialRequest}</small>}</div><b>{money(Number(item.unit_price) * Number(item.quantity))}</b></div>
          </article>)}
        </div>

        <div className="admin-order-total"><span>Total</span><strong>{money(selected.total)}</strong></div>

        {['confirmed', 'new'].includes(selected.status) && <button className="admin-approve-button admin-order-action" type="button" disabled={actionId === selected.id} onClick={() => runStatus(selected, 'preparing')}><Check /> {actionId === selected.id ? 'Updating...' : 'Start preparing'}</button>}
        {selected.status === 'preparing' && <button className="admin-approve-button admin-order-action" type="button" disabled={actionId === selected.id} onClick={() => runStatus(selected, 'completed')}><Check /> {actionId === selected.id ? 'Updating...' : 'Mark completed'}</button>}
        {!['confirmed', 'new', 'preparing'].includes(selected.status) && <p className="admin-order-no-action">No manual status transition is available for this order.</p>}
      </aside>}
    </section>}
  </section>;
}
