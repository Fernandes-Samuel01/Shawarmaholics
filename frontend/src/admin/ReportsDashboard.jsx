import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, Download, FileText, Package, ReceiptText, Store } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const monthStart = () => {
  const now = new Date();
  now.setDate(1);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateText = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const title = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const reports = [
  { key: 'sales', label: 'Sales Report', description: 'Daily revenue, orders, average order value and completed orders.', icon: BarChart3 },
  { key: 'items', label: 'Item Sales Report', description: 'Menu item quantities, order count and sales revenue.', icon: Package },
  { key: 'payments', label: 'Payment Report', description: 'Paid order volume and revenue grouped by payment method.', icon: ReceiptText },
  { key: 'branches', label: 'Branch Performance Report', description: 'Consolidated performance by operating location.', icon: Store },
  { key: 'orders', label: 'Order Detail Report', description: 'Detailed order-level export for the selected period.', icon: FileText }
];

const columns = {
  sales: [
    ['report_date', 'Date', value => dateText(value)],
    ['orders', 'Orders', value => value],
    ['revenue', 'Revenue', value => currency(value)],
    ['average_order_value', 'Average Order', value => currency(value)],
    ['completed_orders', 'Completed', value => value]
  ],
  items: [
    ['item', 'Menu Item', value => value],
    ['quantity_sold', 'Quantity Sold', value => value],
    ['orders', 'Orders', value => value],
    ['revenue', 'Revenue', value => currency(value)]
  ],
  payments: [
    ['payment_method', 'Payment Method', value => title(value)],
    ['orders', 'Orders', value => value],
    ['revenue', 'Revenue', value => currency(value)]
  ],
  branches: [
    ['branch', 'Location', value => value],
    ['orders', 'Orders', value => value],
    ['revenue', 'Revenue', value => currency(value)],
    ['average_order_value', 'Average Order', value => currency(value)]
  ],
  orders: [
    ['order_number', 'Order', value => value],
    ['created_at', 'Date & Time', value => value ? new Date(value).toLocaleString('en-IN') : '—'],
    ['branch', 'Location', value => value],
    ['order_type', 'Type', value => value],
    ['payment_method', 'Payment', value => title(value)],
    ['payment_status', 'Payment Status', value => title(value)],
    ['status', 'Order Status', value => title(value)],
    ['total', 'Total', value => currency(value)]
  ]
};

function api(path, token) {
  return fetch(API + path, { headers: { Authorization: 'Bearer ' + token } }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Unable to generate report');
    return data;
  });
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export default function ReportsDashboard({ adminToken, onBack }) {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const active = reports.find(item => item.key === type);
  const activeColumns = columns[type];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (from > to) throw new Error('Start date cannot be after end date');
      const params = new URLSearchParams({ type, from, to });
      setData(await api('/admin/reports?' + params.toString(), adminToken));
    } catch (err) {
      setError(err.message || 'Unable to generate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [type]);

  const summary = useMemo(() => {
    const rows = data?.rows || [];
    if (type === 'sales') return {
      primary: currency(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
      primaryLabel: 'Revenue',
      secondary: rows.reduce((sum, row) => sum + Number(row.orders || 0), 0),
      secondaryLabel: 'Orders'
    };
    if (type === 'items') return {
      primary: rows.reduce((sum, row) => sum + Number(row.quantity_sold || 0), 0),
      primaryLabel: 'Items sold',
      secondary: currency(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
      secondaryLabel: 'Revenue'
    };
    if (type === 'payments') return {
      primary: currency(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
      primaryLabel: 'Revenue',
      secondary: rows.reduce((sum, row) => sum + Number(row.orders || 0), 0),
      secondaryLabel: 'Paid orders'
    };
    if (type === 'branches') return {
      primary: currency(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
      primaryLabel: 'Revenue',
      secondary: rows.reduce((sum, row) => sum + Number(row.orders || 0), 0),
      secondaryLabel: 'Orders'
    };
    return {
      primary: rows.length,
      primaryLabel: 'Orders in report',
      secondary: currency(rows.reduce((sum, row) => sum + Number(row.total || 0), 0)),
      secondaryLabel: 'Order value'
    };
  }, [data, type]);

  const download = () => {
    if (!data?.rows?.length) return;
    const header = activeColumns.map(([, label]) => label);
    const body = data.rows.map(row => activeColumns.map(([key]) => csvEscape(row[key])).join(','));
    const blob = new Blob([[header.map(csvEscape).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shawarmaholics-${type}-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="admin-reports-page" aria-labelledby="reports-title">
    <header className="admin-reports-header">
      <div>
        <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Head Office</button>
        <span className="admin-panel-eyebrow">HEAD OFFICE REPORTS</span>
        <h1 id="reports-title">Reports</h1>
        <p>Generate structured operational and financial reports for the selected period. Head Office reports are consolidated across operating locations.</p>
      </div>
      <div className="admin-analytics-scope"><Store /> Head Office</div>
    </header>

    <div className="admin-report-type-grid">
      {reports.map(item => {
        const Icon = item.icon;
        return <button type="button" key={item.key} className={'admin-report-type-card ' + (type === item.key ? 'active' : '')} onClick={() => setType(item.key)}>
          <span className="admin-management-icon"><Icon /></span>
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>;
      })}
    </div>

    <form className="admin-analytics-filters" onSubmit={event => { event.preventDefault(); load(); }}>
      <label><span>FROM</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label><span>TO</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button type="submit" className="admin-primary-action" disabled={loading}><CalendarDays /> {loading ? 'Generating...' : 'Generate Report'}</button>
      <button type="button" className="admin-secondary-action" onClick={download} disabled={!data?.rows?.length}><Download /> Export CSV</button>
    </form>

    {error && <div className="admin-staff-error" role="alert">{error}</div>}

    <section className="admin-report-output">
      <header className="admin-report-output-header">
        <div><span className="admin-panel-eyebrow">{active?.label.toUpperCase()}</span><h2>{active?.label}</h2><p>{dateText(from)} — {dateText(to)} · {data?.rowCount ?? 0} rows</p></div>
        {data && <div className="admin-report-summary"><div><small>{summary.primaryLabel}</small><strong>{summary.primary}</strong></div><div><small>{summary.secondaryLabel}</small><strong>{summary.secondary}</strong></div></div>}
      </header>

      {loading ? <div className="admin-analytics-empty"><FileText /><h2>Generating report...</h2><p>Reading live Head Office data.</p></div>
        : !data?.rows?.length ? <div className="admin-analytics-empty"><FileText /><h2>No records found</h2><p>There is no data for the selected report and date range.</p></div>
        : <div className="admin-report-table-wrap"><table className="admin-report-table"><thead><tr>{activeColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{activeColumns.map(([key, , formatter]) => <td key={key}>{formatter(row[key])}</td>)}</tr>)}</tbody></table></div>}
    </section>
  </section>;
}
