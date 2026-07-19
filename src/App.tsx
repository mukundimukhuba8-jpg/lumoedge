import { Navigate, Route, Routes } from 'react-router-dom';
import { useAdmin } from './context/AdminContext';
import { useApp } from './context/AppContext';
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
  const { user, accessStatus } = useApp();
  if (!user) return <Navigate to="/" replace />;
  if (accessStatus === 'pending') return <Navigate to="/waiting" replace />;
  if (accessStatus === 'approved') return <Navigate to="/subscribe" replace />;
  if (accessStatus === 'paid') return <Navigate to="/activate" replace />;
  if (accessStatus !== 'licensed') return <Navigate to="/" replace />;
  return <>{children}</>;
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
  const { user, accessStatus } = useApp();
  if (!user) return <RegisterPage />;
  if (accessStatus === 'licensed') return <Navigate to="/app" replace />;
  if (accessStatus === 'paid') return <Navigate to="/activate" replace />;
  if (accessStatus === 'approved') return <Navigate to="/subscribe" replace />;
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
