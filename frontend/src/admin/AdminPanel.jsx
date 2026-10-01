import React, { useState } from 'react';
import { Building2, ExternalLink, Landmark } from 'lucide-react';
import BranchSelector from './BranchSelector';
import HeadOfficeDashboard from './HeadOfficeDashboard';
import './admin.css';

function Brand() {
  return <div className="admin-brand"><span>SHAWARMA</span><b>HOLICS</b><small>WRAPS. LOADED. OBSESSED.</small></div>;
}

export default function AdminPanel({ onMode }) {
  const [activeSection, setActiveSection] = useState('head-office');
  const [token] = useState(() => sessionStorage.getItem('shawarmaholics_admin_token') || '');

  return <main className="admin-panel">
    <aside className="admin-panel-sidebar">
      <Brand />
      <nav className="admin-panel-nav" aria-label="Admin navigation">
        <span className="admin-panel-nav-label">ADMINISTRATION</span>
        <button className={'admin-panel-nav-item ' + (activeSection === 'head-office' ? 'active' : '')} type="button" aria-current={activeSection === 'head-office' ? 'page' : undefined} onClick={() => setActiveSection('head-office')}>
          <Landmark />
          <span>Head Office</span>
        </button>
        <button className={'admin-panel-nav-item ' + (activeSection === 'branches' ? 'active' : '')} type="button" aria-current={activeSection === 'branches' ? 'page' : undefined} onClick={() => setActiveSection('branches')}>
          <Building2 />
          <span>Branches</span>
        </button>
      </nav>
      <div className="admin-panel-sidebar-footer">
        <p>Multi-Branch Management</p>
        <button className="admin-panel-kiosk-button" type="button" onClick={onMode}>
          <ExternalLink />
          Open Kiosk
        </button>
      </div>
    </aside>
    <section className="admin-panel-main">
      {activeSection === 'head-office' ? <HeadOfficeDashboard adminToken={token} /> : <BranchSelector adminToken={token} />}
    </section>
  </main>;
}
