import React, { useState } from 'react';
import { Building2, ExternalLink, Landmark } from 'lucide-react';
import BranchSelector from './BranchSelector';
import HeadOfficeDashboard from './HeadOfficeDashboard';
import './admin.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function Brand() {
  return <div className="admin-brand"><span>SHAWARMA</span><b>HOLICS</b><small>WRAPS. LOADED. OBSESSED.</small></div>;
}

function AdminLogin({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to sign in');
      if (data.user?.role !== 'admin') throw new Error('This account does not have Head Office admin access.');
      sessionStorage.setItem('shawarmaholics_admin_token', data.token);
      onAuthenticated(data.token);
    } catch (err) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const styles = `.admin-login-page{min-height:100vh;display:grid;place-items:center;padding:40px;background:#f8f3eb;color:#2d2020;font-family:'DM Sans',sans-serif}.admin-login-card{width:min(440px,100%);padding:38px;border:1px solid #eadfd2;border-radius:22px;background:#fffdfa;box-shadow:0 18px 45px #35101d12}.admin-login-card .admin-brand{margin-bottom:38px}.admin-login-card h1{margin:10px 0 8px;color:#79162e;font-size:38px;letter-spacing:-.05em}.admin-login-card>p{margin:0 0 26px;color:#887a70;font-size:13px;line-height:1.6}.admin-login-form{display:grid;gap:16px}.admin-login-form label{display:grid;gap:7px}.admin-login-form label span{color:#2d2020;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.admin-login-form input{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #eadfd2;border-radius:10px;background:#fff;color:#2d2020;font:inherit;font-size:13px}.admin-login-form input:focus{border-color:#c49132;outline:3px solid #c4913230}.admin-login-error{padding:11px 12px;border:1px solid #ead1ca;border-radius:10px;background:#fdf1ee;color:#8b3d2d;font-size:12px;line-height:1.45}.admin-login-submit{min-height:44px;border:0;border-radius:10px;background:#79162e;color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.admin-login-submit:hover{background:#511020}.admin-login-submit:disabled{cursor:wait;opacity:.65}`;
  return <><style>{styles}</style><main className="admin-login-page">
    <section className="admin-login-card">
      <Brand />
      <span className="admin-panel-eyebrow">HEAD OFFICE</span>
      <h1>Admin sign in</h1>
      <p>Sign in once to manage Shawarmaholics across all branches.</p>
      <form onSubmit={submit} className="admin-login-form">
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required />
        </label>
        {error && <div className="admin-login-error" role="alert">{error}</div>}
        <button type="submit" className="admin-login-submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in to Head Office'}</button>
      </form>
    </section>
  </main>;</>;
}

export default function AdminPanel({ onMode }) {
  const [activeSection, setActiveSection] = useState('head-office');
  const [token, setToken] = useState(() => sessionStorage.getItem('shawarmaholics_admin_token') || '');

  if (!token) return <AdminLogin onAuthenticated={setToken} />;

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
