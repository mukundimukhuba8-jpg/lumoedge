import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { EaBackdrop } from './components/EaBackdrop';
import { useAdmin } from './context/AdminContext';
import { useApp } from './context/AppContext';
import {
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from './lib/interfaceStyle';
import { resolveCustomBackdrop } from './lib/mentorMedia';
import { AdminAuthPage } from './pages/admin/AdminAuthPage';
import {
  ApproveAdminsPage,
  ComingSoonPage,
  ConnectEAPage,
  DashboardPage,
  GenerateLicensePage,
  ManageEAsPage,
  OpenOrdersPage,
  ProfilePage,
  SubscriptionsPage,
} from './pages/admin/AdminPages';
import { AdminShell } from './pages/admin/AdminShell';
import { ActivateLicensePage } from './pages/client/ActivateLicensePage';
import { ChartScannerPage } from './pages/client/ChartScannerPage';
import { HomePage } from './pages/client/HomePage';
import { MetaTraderPage } from './pages/client/MetaTraderPage';
import { RegisterPage } from './pages/client/RegisterPage';
import { SubscribePage } from './pages/client/SubscribePage';
import { WaitingApprovalPage } from './pages/client/WaitingApprovalPage';

function ClientAppGate({ children }: { children: React.ReactNode }) {
  const { user, accessStatus, bot } = useApp();
  const location = useLocation();
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  const licensed = accessStatus === 'licensed' || Boolean(bot.licenseKey?.trim());

  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);

  if (!user) return <Navigate to="/" replace />;
  // License key already entered — stay in the app, never bounce to payment
  if (!licensed && accessStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (!licensed && (accessStatus === 'approved' || accessStatus === 'paid')) {
    return <Navigate to="/activate" replace />;
  }
  if (!licensed) return <Navigate to="/" replace />;

  const custom = resolveCustomBackdrop(
    prefs.customBg,
    bot.imageUrl || '',
    bot.customMedia,
  );
  const backdropSrc = custom?.src || bot.imageUrl || '/bull-hero.jpg';
  const backdropKind = custom?.kind || 'image';
  // Broker page stays clean dark (admin portal theme) — no photo backdrop
  const hideBackdrop = location.pathname.includes('metatrader');

  return (
    <>
      {hideBackdrop ? null : <EaBackdrop src={backdropSrc} kind={backdropKind} />}
      <div key={location.pathname} className="page-enter">
        {children}
      </div>
    </>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { admin, portalOpen } = useAdmin();
  if (!admin && !portalOpen) return <Navigate to="/" replace />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

/** Platform tools — Super Admin only. Mentors stay in their private space. */
function SuperOnly({ children }: { children: React.ReactNode }) {
  const { admin } = useAdmin();
  if (!admin) return <Navigate to="/admin/login" replace />;
  if (admin.role !== 'super') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, accessStatus, bot } = useApp();
  if (!user) return <RegisterPage />;
  if (accessStatus === 'licensed' || bot.licenseKey?.trim()) {
    return <Navigate to="/app" replace />;
  }
  if (accessStatus === 'approved' || accessStatus === 'paid') {
    return <Navigate to="/activate" replace />;
  }
  return <Navigate to="/waiting" replace />;
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/waiting" element={<WaitingApprovalPage />} />
        <Route path="/subscribe" element={<SubscribePage />} />
        <Route path="/activate" element={<ActivateLicensePage />} />
        <Route
          path="/app"
          element={
            <ClientAppGate>
              <HomePage />
            </ClientAppGate>
          }
        />
        <Route
          path="/app/metatrader"
          element={
            <ClientAppGate>
              <MetaTraderPage />
            </ClientAppGate>
          }
        />
        <Route
          path="/app/scanner"
          element={
            <ClientAppGate>
              <ChartScannerPage />
            </ClientAppGate>
          }
        />

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
                <ComingSoonPage title="Send Emails" />
              </SuperOnly>
            }
          />
          <Route path="connect-ea" element={<ConnectEAPage />} />
          <Route path="orders" element={<OpenOrdersPage />} />
          <Route path="licenses" element={<GenerateLicensePage />} />
          <Route path="eas" element={<ManageEAsPage />} />
          <Route
            path="setup"
            element={
              <SuperOnly>
                <ComingSoonPage title="Setup Methods" />
              </SuperOnly>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
