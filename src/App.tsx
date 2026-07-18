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
  MetaTraderPage,
  OpenOrdersPage,
  ProfilePage,
} from './pages/admin/AdminPages';
import { AdminShell } from './pages/admin/AdminShell';
import { HomePage } from './pages/client/HomePage';
import { RegisterPage } from './pages/client/RegisterPage';
import { SubscribePage } from './pages/client/SubscribePage';

function ClientGate({ children }: { children: React.ReactNode }) {
  const { user, paid } = useApp();
  if (!user) return <Navigate to="/" replace />;
  if (!paid) return <Navigate to="/subscribe" replace />;
  return <>{children}</>;
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { admin, portalOpen } = useAdmin();
  if (!admin && !portalOpen) return <Navigate to="/" replace />;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, paid } = useApp();

  return (
    <div className="app-shell">
      <Routes>
        <Route
          path="/"
          element={
            user && paid ? (
              <Navigate to="/app" replace />
            ) : user ? (
              <Navigate to="/subscribe" replace />
            ) : (
              <RegisterPage />
            )
          }
        />
        <Route
          path="/subscribe"
          element={
            user ? (
              paid ? <Navigate to="/app" replace /> : <SubscribePage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/app"
          element={
            <ClientGate>
              <HomePage />
            </ClientGate>
          }
        />
        <Route
          path="/app/metatrader"
          element={
            <ClientGate>
              <MetaTraderPage />
            </ClientGate>
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
          <Route path="approve" element={<ApproveAdminsPage />} />
          <Route path="subscriptions" element={<ComingSoonPage title="Subscriptions" />} />
          <Route path="emails" element={<ComingSoonPage title="Send Emails" />} />
          <Route path="connect-ea" element={<ConnectEAPage />} />
          <Route path="orders" element={<OpenOrdersPage />} />
          <Route path="licenses" element={<GenerateLicensePage />} />
          <Route path="eas" element={<ManageEAsPage />} />
          <Route path="setup" element={<ComingSoonPage title="Setup Methods" />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
