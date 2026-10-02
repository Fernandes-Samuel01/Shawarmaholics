import React, { useState } from 'react';
import { ArrowLeft, BarChart3, BookOpen, ClipboardList, ExternalLink, FileText, FolderTree, Landmark, ReceiptText, SlidersHorizontal, UserRound } from 'lucide-react';
import MasterCategories from './MasterCategories';
import MasterMenu from './MasterMenu';
import Customizations from './Customizations';
import MasterPricing from './MasterPricing';
import AdminOrders from './AdminOrders';
import InventoryManagement from './InventoryManagement';
import StaffManagement from './StaffManagement';
import AnalyticsDashboard from './AnalyticsDashboard';
import ReportsDashboard from './ReportsDashboard';
import SettingsDashboard from './SettingsDashboard';

const modules = [
  { key: 'categories', label: 'Master Categories', description: 'Manage global menu categories used across all Shawarmaholics branches.', icon: FolderTree },
  { key: 'menu', label: 'Master Menu', description: 'Manage centrally controlled menu items, descriptions and images.', icon: BookOpen },
  { key: 'pricing', label: 'Master Pricing', description: 'Manage official Shawarmaholics master prices.', icon: ReceiptText },
  { key: 'orders', label: 'Orders Management', description: 'View and manage orders across all Shawarmaholics branches.', icon: ReceiptText },
  { key: 'inventory', label: 'Inventory Management', description: 'Track branch stock, movements and low-stock items across all branches.', icon: ClipboardList },
  { key: 'staff', label: 'Staff Management', description: 'Manage staff roles, primary locations and active profiles.', icon: UserRound },
  { key: 'analytics', label: 'Analytics', description: 'Review consolidated business performance across operating locations.', icon: BarChart3 },
  { key: 'reports', label: 'Reports', description: 'Generate structured operational reports and export them as CSV.', icon: FileText },
  { key: 'settings', label: 'Settings', description: 'Configure this Head Office kiosk, KDS and operational behavior.', icon: SlidersHorizontal },
  { key: 'customizations', label: 'Customizations', description: 'Manage sauces, extras and customization options.', icon: SlidersHorizontal }
];

export default function HeadOfficeDashboard({ adminToken }) {
  const [activeModule, setActiveModule] = useState(null);
  const selected = modules.find(module => module.key === activeModule);
  if (activeModule === 'categories') return <MasterCategories onBack={() => setActiveModule(null)} />;
  if (activeModule === 'menu') return <MasterMenu onBack={() => setActiveModule(null)} />;
  if (activeModule === 'customizations') return <Customizations onBack={() => setActiveModule(null)} />;
  if (activeModule === 'pricing') return <MasterPricing adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'orders') return <AdminOrders adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'inventory') return <InventoryManagement adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'staff') return <StaffManagement adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'analytics') return <AnalyticsDashboard adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'reports') return <ReportsDashboard adminToken={adminToken} onBack={() => setActiveModule(null)} />;
  if (activeModule === 'settings') return <SettingsDashboard adminToken={adminToken} locationType="HEAD_OFFICE" locationName="Head Office" onBack={() => setActiveModule(null)} />;
  if (selected) return <section className="admin-head-office-placeholder admin-branch-state" aria-live="polite">
    <button className="admin-back-button" type="button" onClick={() => setActiveModule(null)}><ArrowLeft /> Back to Head Office</button>
    <span className="admin-panel-eyebrow">HEAD OFFICE MODULE</span>
    <div className="admin-state-icon"><selected.icon /></div>
    <h1>{selected.label}</h1>
    <p>Head Office Module</p>
    <p className="admin-module-description">This module will be connected to the authoritative backend in a future step.</p>
  </section>;
  return <section className="admin-head-office" aria-labelledby="head-office-title">
    <header className="admin-head-office-header">
      <div className="admin-head-office-icon"><Landmark /></div>
      <div className="admin-head-office-header-copy"><span className="admin-panel-eyebrow">HEAD OFFICE</span><h1 id="head-office-title">Central Management</h1><p>Manage Shawarmaholics master menu, categories, pricing and global menu configuration.</p></div>
      <button className="admin-dashboard-kds-button" type="button" onClick={() => window.open('/?view=kds&locationType=HEAD_OFFICE', '_blank', 'noopener,noreferrer')}><ExternalLink /> Open Head Office KDS</button>
    </header>
    <div className="admin-section-heading admin-head-office-section-heading"><span className="admin-panel-eyebrow">CENTRAL CONFIGURATION</span><h2>Head Office Management</h2><p>These controls apply to the Shawarmaholics master menu across all branches.</p></div>
    <div className="admin-head-office-grid">{modules.map(module => { const Icon = module.icon; return <button className="admin-head-office-card" type="button" key={module.key} onClick={() => setActiveModule(module.key)}><span className="admin-management-icon"><Icon /></span><span className="admin-management-copy"><strong>{module.label}</strong><small>{module.description}</small></span><span className="admin-card-arrow">→</span></button> })}</div>
  </section>;
}
