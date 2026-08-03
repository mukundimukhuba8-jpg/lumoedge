import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { EaBackdrop } from './components/EaBackdrop';
import { ThemeEngine } from './components/ThemeEngine';
import { mentorIdForLicense } from './lib/copyTrade';
import { CopyTradeProvider } from './context/CopyTradeContext';
import { useAdmin } from './context/AdminContext';
import { useApp } from './context/AppContext';
import {
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from './lib/interfaceStyle';
import {
  isPlaceholderMentorImage,
  resolveCustomBackdrop,
  resolveProfileImage,
} from './lib/mentorMedia';
import { startMt5KeepAlive } from './lib/mt5Session';
import { findInVault } from './lib/storage';
import { AdminAuthPage } from './pages/admin/AdminAuthPage';
import { AdminShell } from './pages/admin/AdminShell';
import { ActivateLicensePage } from './pages/client/ActivateLicensePage';
import { HomePage } from './pages/client/HomePage';
import { RegisterPage } from './pages/client/RegisterPage';
import { SubscribePage } from './pages/client/SubscribePage';
import { WaitingApprovalPage } from './pages/client/WaitingApprovalPage';

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

function RouteFallback() {
  return null;
}

function ClientAppGate({ children }: { children: React.ReactNode }) {
  const { user, accessStatus, bot, isPaused, requiresRepayment } = useApp();
  const location = useLocation();
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  const licensed = accessStatus === 'licensed' || Boolean(bot.licenseKey?.trim());

  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);

  useEffect(() => {
    if (user?.email && licensed) startMt5KeepAlive(user.email);
  }, [user?.email, licensed]);

  if (!user) return <Navigate to="/" replace />;
  // License key already entered — stay in the app, never bounce to payment
  if (!licensed && accessStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (!licensed && (accessStatus === 'approved' || accessStatus === 'paid') && !requiresRepayment) {
    return <Navigate to="/activate" replace />;
  }
  if (!licensed) return <Navigate to="/" replace />;

  const custom = resolveCustomBackdrop(
    prefs.customBg,
    bot.imageUrl || '',
    bot.customMedia,
  );
  const profileSrc = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const mentorBackdrop =
    custom?.src ||
    (profileSrc && !isPlaceholderMentorImage(profileSrc) ? profileSrc : '') ||
    (bot.imageUrl && !isPlaceholderMentorImage(bot.imageUrl) ? bot.imageUrl : '');
  const backdropSrc = mentorBackdrop;
  const backdropKind = custom?.kind || 'image';
  // Broker page stays clean dark (admin portal theme) — no photo backdrop
  const hideBackdrop = location.pathname.includes('metatrader');

  const ownerAdminId = bot.licenseKey ? mentorIdForLicense(bot.licenseKey) : '';
  const clientEaId = bot.licenseKey ? findInVault(bot.licenseKey)?.eaId || '' : '';

  return (
    <CopyTradeProvider
      email={user?.email}
      licenseKey={bot.licenseKey}
      eaName={bot.displayName || bot.name || 'Lumo Edge'}
      clientEaId={clientEaId}
      isPaused={isPaused}
      ownerAdminId={ownerAdminId}
    >
      {hideBackdrop ? null : backdropSrc ? <EaBackdrop src={backdropSrc} kind={backdropKind} /> : null}
      <div className="page-enter page-slide" key={location.pathname}>
        {children}
      </div>
    </CopyTradeProvider>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { admin, portalOpen } = useAdmin();
  if (!admin && !portalOpen) return <Navigate to="/" replace />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  // Unapproved mentors can never reach the portal, even with stale state
  if (admin.role !== 'super' && admin.role !== 'admin') {
    return <Navigate to="/admin/login" replace />;
  }
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

        <Route
          path="/app/setup"
          element={
            <ClientAppGate>
              <VpsSetupPage />
            </ClientAppGate>
          }
        />

        <Route
          path="/app/symbols"
          element={
            <ClientAppGate>
              <SymbolsPage />
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
                <EmailCenterPage />
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
                <SetupMethodsPage />
              </SuperOnly>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
