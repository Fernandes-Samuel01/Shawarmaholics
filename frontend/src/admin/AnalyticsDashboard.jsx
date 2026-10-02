import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, CreditCard, Package, ReceiptText, Store, TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const formatDateInput = date => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const today = () => formatDateInput(new Date());
const monthStart = () => {
  const date = new Date();
  date.setDate(1);
  return formatDateInput(date);
};
const formatCurrency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const label = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

function api(path, token) {
  return fetch(API + path, { headers: { Authorization: 'Bearer ' + token } }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Unable to load analytics');
    return data;
  });
}

export default function AnalyticsDashboard({ adminToken, branch = null, onBack }) {
  const branchId = branch?.id || null;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (start = from, end = to) => {
    setLoading(true);
    setError('');
    try {
      if (start > end) throw new Error('Start date cannot be after end date');
      const params = new URLSearchParams({ from: start, to: end });
      if (branchId) params.set('branchId', branchId);
      const result = await api('/admin/analytics/dashboard?' + params.toString(), adminToken);
      setData(result);
    } catch (err) {
      setError(err.message || 'Unable to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branchId]);

  const trend = useMemo(() => (data?.trend || []).map(item => ({
    ...item,
    shortDate: formatDate(item.date)
  })), [data]);

  const scopeName = branch?.name || 'Head Office';
  const scopeDescription = branch
    ? `Live performance for ${branch.name}. Head Office analytics remains consolidated across all operating locations.`
    : 'Consolidated business performance across Shawarmaholics operating locations.';

  return <section className="admin-analytics-page" aria-labelledby="analytics-title">
    <header className="admin-analytics-header">
      <div>
        <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back</button>
        <span className="admin-panel-eyebrow">{branch ? 'BRANCH ANALYTICS' : 'HEAD OFFICE ANALYTICS'}</span>
        <h1 id="analytics-title">{scopeName} Analytics</h1>
        <p>{scopeDescription}</p>
      </div>
      <div className="admin-analytics-scope"><Store /> {branch ? branch.name : 'All branches'}</div>
    </header>

    <form className="admin-analytics-filters" onSubmit={event => { event.preventDefault(); load(); }}>
      <label><span>FROM</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label><span>TO</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button type="submit" className="admin-primary-action" disabled={loading}><CalendarDays /> {loading ? 'Loading...' : 'Apply'}</button>
    </form>

    {error && <div className="admin-staff-error" role="alert">{error}</div>}

    {loading && !data ? <div className="admin-analytics-empty"><BarChart3 /><h2>Loading analytics...</h2><p>Reading live order data for the selected period.</p></div>
      : data && <>
        <div className="admin-analytics-kpis">
          <article><span>REVENUE</span><strong>{formatCurrency(data.summary.revenue)}</strong><small>Paid, non-cancelled orders</small></article>
          <article><span>ORDERS</span><strong>{data.summary.orders}</strong><small>Paid, non-cancelled</small></article>
          <article><span>AVERAGE ORDER</span><strong>{formatCurrency(data.summary.aov)}</strong><small>Average paid order value</small></article>
          <article><span>COMPLETED</span><strong>{data.summary.completed_orders}</strong><small>Completed paid orders</small></article>
        </div>

        <div className="admin-analytics-grid admin-analytics-grid-wide">
          <article className="admin-analytics-card admin-analytics-chart-card">
            <header><div><span className="admin-panel-eyebrow">TREND</span><h2>Revenue & orders</h2></div><TrendingUp /></header>
            {trend.length ? <div className="admin-analytics-chart"><ResponsiveContainer width="100%" height={300}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="shortDate" /><YAxis yAxisId="revenue" tickFormatter={value => `₹${Math.round(value / 1000)}k`} /><YAxis yAxisId="orders" orientation="right" allowDecimals={false} /><Tooltip formatter={(value, name) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Revenue' : 'Orders']} /><Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#79162e" strokeWidth={3} dot={false} /><Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#c49132" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
              : <div className="admin-analytics-no-data">No paid order data for this period.</div>}
          </article>

          <article className="admin-analytics-card">
            <header><div><span className="admin-panel-eyebrow">TOP ITEMS</span><h2>Best-selling menu items</h2></div><Package /></header>
            {data.topItems.length ? <div className="admin-analytics-list">{data.topItems.map(item => <div className="admin-analytics-list-row" key={item.name}><div><strong>{item.name}</strong><small>{item.quantity} sold</small></div><b>{formatCurrency(item.revenue)}</b></div>)}</div> : <div className="admin-analytics-no-data">No item sales for this period.</div>}
          </article>
        </div>

        <div className="admin-analytics-grid">
          <article className="admin-analytics-card">
            <header><div><span className="admin-panel-eyebrow">PAYMENTS</span><h2>Payment mix</h2></div><CreditCard /></header>
            {data.payments.length ? <div className="admin-analytics-list">{data.payments.map(item => <div className="admin-analytics-list-row" key={item.method}><div><strong>{label(item.method)}</strong><small>{item.orders} orders</small></div><b>{formatCurrency(item.revenue)}</b></div>)}</div> : <div className="admin-analytics-no-data">No payment data for this period.</div>}
          </article>

          <article className="admin-analytics-card">
            <header><div><span className="admin-panel-eyebrow">ORDER STATUS</span><h2>Operational status</h2></div><ReceiptText /></header>
            {data.statuses.length ? <div className="admin-analytics-status-list">{data.statuses.map(item => <div key={item.status}><span>{label(item.status)}</span><strong>{item.orders}</strong></div>)}</div> : <div className="admin-analytics-no-data">No orders for this period.</div>}
          </article>
        </div>

        {!branch && <article className="admin-analytics-card admin-analytics-branches">
          <header><div><span className="admin-panel-eyebrow">BRANCH BREAKDOWN</span><h2>Performance by location</h2></div><Store /></header>
          {data.branches.length ? <div className="admin-analytics-branch-table"><div className="admin-analytics-branch-head"><span>LOCATION</span><span>ORDERS</span><span>REVENUE</span></div>{data.branches.map(item => <div className="admin-analytics-branch-row" key={item.name}><strong>{item.name}</strong><span>{item.orders}</span><b>{formatCurrency(item.revenue)}</b></div>)}</div> : <div className="admin-analytics-no-data">No branch order data for this period.</div>}
        </article>}
      </>}
  </section>;
}
