import { useMemo, useState, type ReactNode } from 'react';
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

type MenuRole = 'super' | 'admin';

const ALL_MENU: {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  roles: MenuRole[];
}[] = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard, roles: ['super', 'admin'] },
  // Super-only platform tools
  { to: '/admin/approve', label: 'Approve Admins', Icon: UserPlus, roles: ['super'] },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard, roles: ['super'] },
  { to: '/admin/emails', label: 'Send Emails', Icon: Mail, roles: ['super'] },
  { to: '/admin/setup', label: 'Setup Methods', Icon: Settings2, roles: ['super'] },
  // Mentor + Super shared tools (each sees only their own data)
  { to: '/admin/connect-ea', label: 'Connect EA', Icon: Monitor, roles: ['super', 'admin'] },
  { to: '/admin/orders', label: 'Open Orders', Icon: LineChart, roles: ['super', 'admin'] },
  { to: '/admin/licenses', label: 'Generate License', Icon: KeyRound, roles: ['super', 'admin'] },
  { to: '/admin/eas', label: 'Manage EAs', Icon: Cpu, roles: ['super', 'admin'] },
  { to: '/admin/profile', label: 'Profile Settings', Icon: UserCircle2, roles: ['super', 'admin'] },
];

export function AdminShell() {
  const { admin, logout } = useAdmin();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const menu = useMemo(() => {
    if (!admin || (admin.role !== 'super' && admin.role !== 'admin')) return [];
    const role: MenuRole = admin.role;
    return ALL_MENU.filter((item) => item.roles.includes(role));
  }, [admin]);

  if (!admin) return <Navigate to="/admin/login" replace />;
  if (admin.role !== 'super' && admin.role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }

  const isSuper = admin.role === 'super';

  return (
    <div className="app-shell">
      <div className="admin-top">
        <button type="button" onClick={() => setOpen(true)} style={{ background: 'transparent', color: 'var(--text)' }}>
          <Menu />
        </button>
        <strong>{isSuper ? 'Super Admin' : 'Mentor Portal'}</strong>
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
                <span
                  style={{
                    background: isSuper ? 'var(--gold)' : 'var(--electric)',
                    color: isSuper ? '#1a1200' : '#061018',
                    borderRadius: 999,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {isSuper ? 'SUPER' : 'MENTOR'}
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', color: 'var(--muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="muted" style={{ fontSize: 11, letterSpacing: 1.4 }}>SIGNED IN AS</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{admin.fullName}</div>
            <div style={{ color: 'var(--electric)', marginBottom: 14 }}>{admin.id}</div>
            {!isSuper ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
                Your private mentor space — EAs, licenses, and stats are yours only.
              </p>
            ) : null}
            <nav style={{ flex: 1, overflow: 'auto' }}>
              {menu.map(({ to, label, Icon }) => (
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
