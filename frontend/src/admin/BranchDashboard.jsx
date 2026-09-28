import React, { useState } from 'react';
import { ArrowLeft, BarChart3, Building2, ChevronRight, Package, Settings, ShoppingBag, Users } from 'lucide-react';

const summary = [
  { label: "Today's Revenue", value: '₹48,650' },
  { label: "Today's Orders", value: '286' },
  { label: 'Average Order Value', value: '₹170' },
  { label: 'Customers Today', value: '241' }
];

const management = [
  { key: 'orders', label: 'Orders', icon: ShoppingBag, description: 'View and manage orders for this branch.' },
  { key: 'availability', label: 'Menu Availability', icon: Building2, description: 'Control which master menu items are available at this branch.' },
  { key: 'inventory', label: 'Inventory', icon: Package, description: 'Monitor stock and inventory for this branch.' },
  { key: 'staff', label: 'Staff', icon: Users, description: 'Manage branch staff and attendance.' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, description: 'View branch performance and business insights.' },
  { key: 'settings', label: 'Branch Settings', icon: Settings, description: 'View branch information and operational settings.' }
];

export default function BranchDashboard({ branch, onBack }) {
  const [activeModule, setActiveModule] = useState(null);
  const selected = management.find(item => item.key === activeModule);
  if (selected) return <section className="admin-branch-module admin-branch-state" aria-live="polite">
    <button className="admin-back-button" type="button" onClick={() => setActiveModule(null)}><ArrowLeft /> Back to Branch Dashboard</button>
    <span className="admin-panel-eyebrow">{selected.label.toUpperCase()}</span>
    <div className="admin-state-icon"><selected.icon /></div>
    <h1>{selected.label}</h1>
    <p className="admin-selected-branch">{branch.name}</p>
    <p>Coming Soon</p>
    <p className="admin-module-description">This branch-specific management module will be connected in the next implementation phase.</p>
  </section>;
  return <section className="admin-branch-dashboard" aria-labelledby="branch-dashboard-title">
    <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft /> Back to Branches</button>
    <header className="admin-branch-identity">
      <div className="admin-branch-identity-icon"><Building2 /></div>
      <div className="admin-branch-identity-copy">
        <span className="admin-panel-eyebrow">BRANCH DASHBOARD</span>
        <h1 id="branch-dashboard-title">{branch.name}</h1>
        <div className="admin-branch-identity-details"><span className="admin-branch-type">{branch.type}</span><span>{branch.code}</span><span>{branch.city}, {branch.state}</span></div>
      </div>
      <span className={`admin-branch-status ${branch.is_active ? 'is-active' : 'is-inactive'}`}><i /> {branch.is_active ? 'Active' : 'Inactive'}</span>
    </header>
    <section className="admin-dashboard-section" aria-labelledby="performance-title">
      <div className="admin-section-heading"><span className="admin-panel-eyebrow">TODAY</span><h2 id="performance-title">Performance summary</h2><p>Temporary demo values until branch analytics are connected.</p></div>
      <div className="admin-summary-grid">{summary.map(item => <article className="admin-summary-card" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>Demo value</small></article>)}</div>
    </section>
    <section className="admin-dashboard-section" aria-labelledby="management-title">
      <div className="admin-section-heading"><span className="admin-panel-eyebrow">OPERATIONS</span><h2 id="management-title">Branch Management</h2><p>Manage day-to-day operations for {branch.name}.</p></div>
      <div className="admin-management-grid">{management.map(item => { const Icon = item.icon; return <button className="admin-management-card" key={item.key} type="button" onClick={() => setActiveModule(item.key)}><span className="admin-management-icon"><Icon /></span><span className="admin-management-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight /></button> })}</div>
    </section>
  </section>;
}
