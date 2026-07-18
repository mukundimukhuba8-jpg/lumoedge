import { useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import {
  Cpu,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Mail,
  Menu,
  Monitor,
  Settings2,
  UserCircle2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';

const MENU = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/admin/approve', label: 'Approve Admins', Icon: UserPlus },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard },
  { to: '/admin/emails', label: 'Send Emails', Icon: Mail },
  { to: '/admin/connect-ea', label: 'Connect EA', Icon: Monitor },
  { to: '/admin/orders', label: 'Open Orders', Icon: LineChart },
  { to: '/admin/licenses', label: 'Generate License', Icon: KeyRound },
  { to: '/admin/eas', label: 'Manage EAs', Icon: Cpu },
  { to: '/admin/setup', label: 'Setup Methods', Icon: Settings2 },
  { to: '/admin/profile', label: 'Profile Settings', Icon: UserCircle2 },
];

export function AdminShell() {
  const { admin, logout } = useAdmin();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!admin) return <Navigate to="/admin" replace />;
  if (admin.role !== 'super') {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2 className="title-blue">Admin portal coming next</h2>
        <p className="muted">Regular admin tools unlock after Super Admin setup.</p>
        <button className="btn btn-blue" type="button" onClick={() => { logout(); navigate('/admin'); }}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="admin-top">
        <button type="button" onClick={() => setOpen(true)} style={{ background: 'transparent', color: 'var(--text)' }}>
          <Menu />
        </button>
        <strong>Super Admin</strong>
        <span style={{ width: 40 }} />
      </div>
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <Outlet />
      </div>

      {open ? (
        <div className="drawer-backdrop">
          <aside className="drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="title-blue" style={{ fontSize: 18 }}>Lumo Admin</span>
                <span style={{ background: 'var(--gold)', color: '#1a1200', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  SUPER
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', color: 'var(--muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11, letterSpacing: 1.4 }}>SIGNED IN AS</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{admin.fullName}</div>
            <div style={{ color: 'var(--cyan)', marginBottom: 14 }}>{admin.id}</div>
            <nav style={{ flex: 1, overflow: 'auto' }}>
              {MENU.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `drawer-item${isActive ? ' active' : ''}`}
                >
                  <Icon size={18} /> {label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              className="drawer-item"
              style={{ color: 'var(--red)', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              <LogOut size={18} /> Logout
            </button>
          </aside>
          <button type="button" style={{ flex: 1, background: 'transparent' }} onClick={() => setOpen(false)} aria-label="Close" />
        </div>
      ) : null}
    </div>
  );
}

export function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="title-blue" style={{ fontSize: 24 }}>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}
