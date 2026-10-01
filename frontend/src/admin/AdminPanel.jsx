import React, { useState } from 'react';
import { Building2, ExternalLink, Landmark } from 'lucide-react';
import BranchSelector from './BranchSelector';
import HeadOfficeDashboard from './HeadOfficeDashboard';
import './admin.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
};

function Brand() {
  return <div className="admin-brand"><span>SHAWARMA</span><b>HOLICS</b><small>WRAPS. LOADED. OBSESSED.</small></div>;
}

export default function AdminPanel({ onMode }) {
  const [activeSection, setActiveSection] = useState('head-office');
  const [token, setToken] = useState(() => sessionStorage.getItem('shawarmaholics_admin_token') || '');
  const [email, setEmail] = useState('admin@shawarmaholics.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const login = async event => {
    event.preventDefault();
    setLoginBusy(true);
    setError('');
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.user?.role !== 'admin') throw new Error('This screen requires a Head Office admin account');
      sessionStorage.setItem('shawarmaholics_admin_token', data.token);
      setToken(data.token);
      setPassword('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoginBusy(false);
    }
  };

  if (!token) return <main className="admin-panel">
    <aside className="admin-panel-sidebar"><Brand /></aside>
    <section className="admin-panel-main">
      <section className="admin-pricing-page admin-admin-login-page" aria-labelledby="admin-login-title">
        <header className="admin-pricing-header">
          <div><span className="admin-panel-eyebrow">HEAD OFFICE ADMINISTRATION</span><h1 id="admin-login-title">Sign in to Shawarmaholics Admin</h1><p>One Head Office admin session controls the complete Admin screen, including all branches.</p></div>
        </header>
        <form className="admin-pricing-login" onSubmit={login}>
          <div><strong>Head Office admin sign-in</strong><p>After signing in, you will not be asked to authenticate again when moving between Admin modules or branches.</p></div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Admin email" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          <button type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in...' : 'Sign in'}</button>
        </form>
        {error && <div className="admin-branch-feedback admin-branch-feedback-error" role="alert">{error}</div>}
      </section>
    </section>
  </main>;

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
