import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Cpu,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  Settings2,
  UserCircle2,
  UserPlus,
  X,
} from 'lucide-react';
import { useAdminSession } from '../../context/AdminContext';
import { markAdminNavBusy, setAdminDrawerOpen } from '../../lib/adminUiGate';

type MenuRole = 'super' | 'admin';

const ALL_MENU: {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  roles: MenuRole[];
}[] = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard, roles: ['super', 'admin'] },
  { to: '/admin/approve', label: 'Approve Admins', Icon: UserPlus, roles: ['super'] },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard, roles: ['super'] },
  { to: '/admin/emails', label: 'Send Emails', Icon: Mail, roles: ['super'] },
  { to: '/admin/setup', label: 'Setup Methods', Icon: Settings2, roles: ['super'] },
  { to: '/admin/telegram', label: 'Telegram Alerts', Icon: MessageCircle, roles: ['super'] },
  { to: '/admin/connect-ea', label: 'Connect EA', Icon: Monitor, roles: ['super', 'admin'] },
  { to: '/admin/brokers', label: 'Brokers', Icon: Building2, roles: ['super', 'admin'] },
  { to: '/admin/orders', label: 'Open Orders', Icon: LineChart, roles: ['super', 'admin'] },
  { to: '/admin/licenses', label: 'Generate License', Icon: KeyRound, roles: ['super', 'admin'] },
  { to: '/admin/eas', label: 'Manage EAs', Icon: Cpu, roles: ['super', 'admin'] },
  { to: '/admin/profile', label: 'Profile Settings', Icon: UserCircle2, roles: ['super', 'admin'] },
];

function titleForPath(pathname: string, isSuper: boolean): string {
  const hit = ALL_MENU.find((m) => pathname.startsWith(m.to));
  if (hit) return hit.label;
  return isSuper ? 'Dashboard' : 'Mentor Portal';
}

export function AdminShell() {
  const { admin, logout } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const menu = useMemo(() => {
    if (!admin || (admin.role !== 'super' && admin.role !== 'admin')) return [];
    const role: MenuRole = admin.role;
    return ALL_MENU.filter((item) => item.roles.includes(role));
  }, [admin?.role]);

  useEffect(() => {
    setAdminDrawerOpen(open);
    return () => setAdminDrawerOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!admin) return <Navigate to="/admin/login" replace />;
  if (admin.role !== 'super' && admin.role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }

  const isSuper = admin.role === 'super';
  const pageTitle = titleForPath(location.pathname, isSuper);

  const go = (to: string) => {
    // Pause sync/heal BEFORE closing — otherwise they stampede onto the new page.
    // Idle heals are 1.6–2s; keep the gate longer than those windows.
    markAdminNavBusy(2800);
    setOpen(false);
    // Let the drawer start closing, then navigate off the critical path
    window.setTimeout(() => {
      startTransition(() => {
        navigate(to);
      });
    }, 48);
  };

  const drawer =
    typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`drawer-backdrop admin-drawer-backdrop${open ? ' is-open' : ''}`}
            aria-hidden={!open}
          >
            <aside
              className={`drawer admin-drawer${open ? ' is-open' : ''}`}
              role="dialog"
              aria-modal={open}
              aria-label="Admin menu"
            >
              <div className="admin-drawer-header">
                <div className="admin-drawer-brand">
                  <span className="admin-drawer-logo title-blue">Lumo Admin</span>
                  <span className={`admin-role-badge${isSuper ? ' admin-role-badge-super' : ''}`}>
                    {isSuper ? 'SUPER' : 'MENTOR'}
                  </span>
                </div>
                <button
                  type="button"
                  className="admin-drawer-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="admin-drawer-user">
                <div className="admin-drawer-user-label">SIGNED IN AS</div>
                <div className="admin-drawer-user-name">{admin.fullName}</div>
                <div className="admin-drawer-user-id">{admin.id}</div>
              </div>
              {!isSuper ? (
                <p className="admin-drawer-note muted">
                  Your private mentor space — EAs, licenses, and stats are yours only.
                </p>
              ) : null}
              <nav className="admin-drawer-nav">
                {menu.map(({ to, label, Icon }) => {
                  const active = location.pathname.startsWith(to);
                  return (
                    <button
                      key={to}
                      type="button"
                      className={`drawer-item admin-drawer-item${active ? ' active' : ''}`}
                      onClick={() => go(to)}
                    >
                      <span className="admin-drawer-item-icon">
                        <Icon size={18} strokeWidth={2.1} />
                      </span>
                      <span className="admin-drawer-item-label">{label}</span>
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                className="drawer-item admin-drawer-item admin-drawer-logout"
                onClick={() => {
                  markAdminNavBusy(400);
                  setOpen(false);
                  logout();
                  navigate('/');
                }}
              >
                <span className="admin-drawer-item-icon">
                  <LogOut size={18} strokeWidth={2.1} />
                </span>
                <span className="admin-drawer-item-label">Logout</span>
              </button>
            </aside>
            <button
              type="button"
              className="admin-drawer-scrim"
              onClick={() => setOpen(false)}
              aria-label="Close"
              tabIndex={open ? 0 : -1}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`app-shell admin-shell-dark${isSuper ? ' admin-shell-super' : ''}`}>
      <div className="admin-top admin-top-cyber">
        <button
          type="button"
          className="admin-menu-btn admin-menu-btn-cyber"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <strong className="admin-top-title admin-top-title-cyber">{pageTitle}</strong>
        <span className="admin-top-spacer" aria-hidden />
      </div>
      <div className="page-enter admin-page-body admin-page-body-cyber">
        <Outlet />
      </div>
      {drawer}
    </div>
  );
}

export function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="title-blue" style={{ fontSize: 18 }}>
        {title}
      </h2>
      <p className="muted">{children}</p>
    </div>
  );
}
