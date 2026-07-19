import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SubscriptionPaymentInfo } from '../../components/SubscriptionPaymentInfo';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function WaitingApprovalPage() {
  const navigate = useNavigate();
  const { user, setAccessStatus, accessStatus } = useApp();
  const { getClientByEmail } = useAdmin();

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    const tick = () => {
      const client = getClientByEmail(user.email);
      if (client?.status === 'approved') {
        if (accessStatus === 'pending') setAccessStatus('approved');
        navigate('/subscribe', { replace: true });
      }
      if (client?.status === 'rejected') {
        // stay with message
      }
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [user, getClientByEmail, navigate, setAccessStatus, accessStatus]);

  const client = user ? getClientByEmail(user.email) : undefined;

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 64 }}>
      <h1 className="title-blue" style={{ fontSize: 18 }}>
        Waiting for approval
      </h1>
      <p className="muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
        Your registration was sent to Super Admin
        <br />
        <strong style={{ color: 'var(--electric)' }}>mukundimukhuba8@gmail.com</strong>
      </p>
      <div className="glow-card" style={{ marginTop: 24, textAlign: 'left' }}>
        <div className="muted">Account</div>
        <strong>
          {user?.firstName} {user?.lastName}
        </strong>
        <div className="muted">{user?.email}</div>
        <div style={{ marginTop: 12, color: 'var(--orange)', fontWeight: 700 }}>
          Status: {(client?.status ?? 'pending').toUpperCase()}
        </div>
      </div>
      <SubscriptionPaymentInfo />
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: 20 }}
        onClick={() => window.location.reload()}
      >
        Refresh status
      </button>
    </div>
  );
}
