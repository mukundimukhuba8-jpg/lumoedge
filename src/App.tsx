import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AmbientEnvironment } from './components/AmbientEnvironment';
import { ClientOsShell } from './components/ClientOsShell';
import { ThemeEngine } from './components/ThemeEngine';
import { useAdminSession } from './context/AdminContext';
import { useApp } from './context/AppContext';
import { AdminAuthPage } from './pages/admin/AdminAuthPage';
import { AdminShell } from './pages/admin/AdminShell';
import { ActivateLicensePage } from './pages/client/ActivateLicensePage';
import { HomePage } from './pages/client/HomePage';
import { RegisterPage } from './pages/client/RegisterPage';
import { SubscribePage } from './pages/client/SubscribePage';
import { WaitingApprovalPage } from './pages/client/WaitingApprovalPage';

/** Particles/glow freeze mentor phones — keep them on the client app only. */
function PortalAmbient() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return <AmbientEnvironment />;
}

/** Mark admin routes so CSS can kill portal motion without touching /app. */
function AdminPortalMode() {
  const { pathname } = useLocation();
  useEffect(() => {
    const on = pathname.startsWith('/admin');
    document.documentElement.toggleAttribute('data-admin-portal', on);
    return () => document.documentElement.removeAttribute('data-admin-portal');
  }, [pathname]);
  return null;
}

const MetaTraderPage = lazy(() =>
  import('./pages/client/MetaTraderPage').then((m) => ({ default: m.MetaTraderPage })),
);
const ChartScannerPage = lazy(() =>
  import('./pages/client/ChartScannerPage').then((m) => ({ default: m.ChartScannerPage })),
);
const SymbolsPage = lazy(() =>
  import('./pages/client/SymbolsPage').then((m) => ({ default: m.SymbolsPage })),
);
const EmailCenterPage = lazy(() =>
  import('./pages/admin/EmailCenterPage').then((m) => ({ default: m.EmailCenterPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.DashboardPage })),
);
const ApproveAdminsPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.ApproveAdminsPage })),
);
const SubscriptionsPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.SubscriptionsPage })),
);
const ConnectEAPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.ConnectEAPage })),
);
const BrokersAdminPage = lazy(() =>
  import('./pages/admin/BrokersAdminPage').then((m) => ({ default: m.BrokersAdminPage })),
);
const OpenOrdersPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.OpenOrdersPage })),
);
const GenerateLicensePage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.GenerateLicensePage })),
);
const ManageEAsPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.ManageEAsPage })),
);
const SetupMethodsPage = lazy(() =>
  import('./pages/admin/SetupMethodsPage').then((m) => ({ default: m.SetupMethodsPage })),
);
const VpsSetupPage = lazy(() =>
  import('./pages/client/VpsSetupPage').then((m) => ({ default: m.VpsSetupPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.ProfilePage })),
);
const TelegramAlertsPage = lazy(() =>
  import('./pages/admin/AdminPages').then((m) => ({ default: m.TelegramAlertsPage })),
);

function RouteFallback() {
  return (
    <div className="os-route-fallback" aria-hidden>
      <span className="os-route-fallback-dot" />
    </div>
  );
}

function ClientAppGate({ children }: { children: React.ReactNode }) {
  const { user, accessStatus, bot, requiresRepayment } = useApp();
  const licensed = accessStatus === 'licensed' || Boolean(bot.licenseKey?.trim());

  if (!user) return <Navigate to="/" replace />;
  if (!licensed && accessStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (!licensed && (accessStatus === 'approved' || accessStatus === 'paid') && !requiresRepayment) {
    return <Navigate to="/activate" replace />;
  }
  if (!licensed) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  // Session-only — avoid re-rendering the whole portal on every clients/store sync
  const { admin, portalOpen } = useAdminSession();
  if (!admin && !portalOpen) return <Navigate to="/" replace />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  if (admin.role !== 'super' && admin.role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

function SuperOnly({ children }: { children: React.ReactNode }) {
  const { admin } = useAdminSession();
  if (!admin) return <Navigate to="/admin/login" replace />;
  if (admin.role !== 'super') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, accessStatus, bot, requiresRepayment } = useApp();
  if (!user) return <RegisterPage />;
  if (accessStatus === 'licensed' || bot.licenseKey?.trim()) {
    return <Navigate to="/app" replace />;
  }
  if ((accessStatus === 'approved' || accessStatus === 'paid') && !requiresRepayment) {
    return <Navigate to="/activate" replace />;
  }
  return <Navigate to="/waiting" replace />;
}

export default function App() {
  return (
    <div className="app-shell lumo-app">
      <ThemeEngine />
      <AdminPortalMode />
      <PortalAmbient />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/waiting" element={<WaitingApprovalPage />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/activate" element={<ActivateLicensePage />} />

          <Route
            path="/app"
            element={
              <ClientAppGate>
                <ClientOsShell />
              </ClientAppGate>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="metatrader" element={<MetaTraderPage />} />
            <Route path="scanner" element={<ChartScannerPage />} />
            <Route path="setup" element={<VpsSetupPage />} />
            <Route path="symbols" element={<SymbolsPage />} />
          </Route>

          <Route path="/admin/login" element={<AdminAuthPage />} />
          <Route
            path="/admin"
            element={
              <AdminGate>
                <AdminShell />
              </AdminGate>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="approve"
              element={
                <SuperOnly>
                  <ApproveAdminsPage />
                </SuperOnly>
              }
            />
            <Route
              path="subscriptions"
              element={
                <SuperOnly>
                  <SubscriptionsPage />
                </SuperOnly>
              }
            />
            <Route
              path="emails"
              element={
                <SuperOnly>
                  <EmailCenterPage />
                </SuperOnly>
              }
            />
            <Route path="connect-ea" element={<ConnectEAPage />} />
            <Route path="brokers" element={<BrokersAdminPage />} />
            <Route path="orders" element={<OpenOrdersPage />} />
            <Route path="licenses" element={<GenerateLicensePage />} />
            <Route path="eas" element={<ManageEAsPage />} />
            <Route
              path="setup"
              element={
                <SuperOnly>
                  <SetupMethodsPage />
                </SuperOnly>
              }
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="telegram"
              element={
                <SuperOnly>
                  <TelegramAlertsPage />
                </SuperOnly>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
