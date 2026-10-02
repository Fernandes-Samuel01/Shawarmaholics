import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, Building2, ChefHat, CreditCard, Globe2, Package, Save, ShoppingBag, SlidersHorizontal } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const GROUPS = [
  { key: 'business', label: 'Business', icon: Building2, description: 'Organization identity and regional defaults.' },
  { key: 'orders', label: 'Orders & Payments', icon: CreditCard, description: 'Customer order types and payment methods.' },
  { key: 'kiosk', label: 'Kiosk', icon: ShoppingBag, description: 'Customer-facing kiosk behavior and menu presentation.' },
  { key: 'kds', label: 'Kitchen / KDS', icon: ChefHat, description: 'Global kitchen queue and display behavior.' },
  { key: 'inventory', label: 'Inventory', icon: Package, description: 'Global stock-control and inventory alert rules.' },
  { key: 'notifications', label: 'Notifications', icon: Bell, description: 'Administrative and operational alert preferences.' }
];

const ORDER_FIELDS = ['orders.eat_here_enabled','orders.take_parcel_enabled','orders.cash_enabled','orders.upi_enabled'];
const KIOSK_FIELDS = ['kiosk.enabled','kiosk.show_bestseller','kiosk.show_vegetarian','kiosk.show_preparation_time','kiosk.allow_customizations'];
const KDS_FIELDS = ['kds.max_active_orders','kds.show_preparation_timer','kds.sound_alerts','kds.new_order_alerts'];
const INVENTORY_FIELDS = ['inventory.allow_negative_stock','inventory.low_stock_alerts','inventory.out_of_stock_alerts'];
const NOTIFICATION_FIELDS = ['notifications.new_order','notifications.low_stock','notifications.out_of_stock','notifications.kds'];

function Toggle({ value, onChange }) {
  return <button type="button" className={'admin-settings-toggle ' + (value ? 'on' : '')} aria-pressed={value} onClick={() => onChange(!value)}><span /></button>;
}

export default function SettingsDashboard({ adminToken, onBack }) {
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(API + '/admin/settings', { headers: { Authorization: 'Bearer ' + adminToken } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load settings');
      setRows(data.settings || []);
      setValues(Object.fromEntries((data.settings || []).map(row => [row.setting_key, row.value])));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const update = (key, value) => { setMessage(''); setValues(current => ({ ...current, [key]: value })); };

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const response = await fetch(API + '/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
        body: JSON.stringify({ settings: values })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save settings');
      setValues(data.settings || {});
      setRows(current => current.map(row => ({ ...row, value: data.settings?.[row.setting_key] ?? row.value })));
      setMessage('Settings saved successfully.');
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const grouped = useMemo(() => GROUPS.map(group => ({
    ...group,
    rows: rows.filter(row => row.category === group.key)
  })), [rows]);

  const renderField = row => {
    const value = values[row.setting_key];
    if (row.value_type === 'boolean') {
      return <Toggle value={Boolean(value)} onChange={next => update(row.setting_key, next)} />;
    }
    if (row.value_type === 'number') {
      return <input className="admin-settings-number" type="number" min="1" max="20" value={value ?? ''} onChange={event => update(row.setting_key, Number(event.target.value))} />;
    }
    if (row.setting_key === 'business.address') {
      return <textarea className="admin-settings-textarea" value={value ?? ''} onChange={event => update(row.setting_key, event.target.value)} rows="3" />;
    }
    return <input className="admin-settings-input" type={row.setting_key.includes('email') ? 'email' : 'text'} value={value ?? ''} onChange={event => update(row.setting_key, event.target.value)} />;
  };

  return <section className="admin-settings-page">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Head Office</button>
    <header className="admin-settings-header">
      <div><span className="admin-panel-eyebrow">HEAD OFFICE SETTINGS</span><h1>System control room</h1><p>Configure global Shawarmaholics behavior from one authoritative place. Changes are stored in PostgreSQL and consumed by the relevant operational screens.</p></div>
      <button className="admin-primary-action admin-settings-save" type="button" onClick={save} disabled={saving || loading}><Save /> {saving ? 'Saving...' : 'Save Changes'}</button>
    </header>
    {message && <div className="admin-settings-feedback success">{message}</div>}
    {error && <div className="admin-settings-feedback error">{error}</div>}
    {loading ? <div className="admin-settings-empty">Loading settings...</div> : <div className="admin-settings-groups">{grouped.map(group => { const Icon = group.icon; return <section className="admin-settings-group" key={group.key}><header><span className="admin-management-icon"><Icon /></span><div><span className="admin-panel-eyebrow">{group.label.toUpperCase()}</span><h2>{group.label}</h2><p>{group.description}</p></div></header><div className="admin-settings-fields">{group.rows.map(row => <article className="admin-settings-row" key={row.setting_key}><div><strong>{row.label}</strong><small>{row.description}</small></div><div>{renderField(row)}</div></article>)}</div></section> })}</div>}
    <div className="admin-settings-note"><SlidersHorizontal /><div><strong>Centralized configuration</strong><p>Master menu, pricing, inventory quantities, staff, orders, analytics and reports remain in their dedicated modules. Settings only controls system-wide behavior.</p></div></div>
  </section>;
}