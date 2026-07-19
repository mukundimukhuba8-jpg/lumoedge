import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SubscriptionPaymentInfo } from '../../components/SubscriptionPaymentInfo';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function WaitingApprovalPage() {
  const navigate = useNavigate();
  const { user, setAccessStatus, accessStatus } = useApp();
  const { getClientByEmail } = useAdmin();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    const tick = () => {
      const client = getClientByEmail(user.email);
      if (client?.status === 'approved') {
        if (accessStatus === 'pending') setAccessStatus('approved');
        navigate('/activate', { replace: true });
      }
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [user, getClientByEmail, navigate, setAccessStatus, accessStatus]);

  const onCheckStatus = () => {
    if (!user) return;
    setChecking(true);
    setMessage('');
    const client = getClientByEmail(user.email);
    if (client?.status === 'approved') {
      if (accessStatus === 'pending') setAccessStatus('approved');
      navigate('/activate', { replace: true });
      return;
    }
    if (client?.status === 'rejected') {
      setMessage('Your registration was rejected. Contact Super Admin.');
    } else {
      setMessage('Still pending approval. Pay the subscription above, then check again.');
    }
    window.setTimeout(() => setChecking(false), 400);
  };

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
      {message ? (
        <p className="muted" style={{ marginTop: 16, lineHeight: 1.5 }}>
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-blue"
        style={{ marginTop: 20 }}
        disabled={checking}
        onClick={onCheckStatus}
      >
        {checking ? 'Checking…' : 'Check status'}
      </button>
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        After approval you will enter your license key on the next page.
      </p>
    </div>
  );
}
