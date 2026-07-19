import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { SubscriptionPaymentInfo } from '../../components/SubscriptionPaymentInfo';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function SubscribePage() {
  const { user, accessStatus, markPaid, setAccessStatus } = useApp();
  const { getClientByEmail } = useAdmin();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    const client = getClientByEmail(user.email);
    if (!client || client.status === 'pending') {
      navigate('/waiting', { replace: true });
      return;
    }
    if (client.status === 'approved' && accessStatus === 'pending') {
      setAccessStatus('approved');
    }
    if (accessStatus === 'paid') navigate('/activate', { replace: true });
    if (accessStatus === 'licensed') navigate('/app', { replace: true });
  }, [user, accessStatus, getClientByEmail, navigate, setAccessStatus]);

  const unlockPaid = async () => {
    setChecking(true);
    await new Promise((r) => setTimeout(r, 700));
    markPaid();
    navigate('/activate');
  };

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 56 }}>
      <div
        style={{
          width: 72,
          height: 72,
          margin: '0 auto 18px',
          borderRadius: 18,
          border: '1.5px solid rgba(59,130,246,0.8)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 0 22px rgba(59,130,246,0.7)',
          background: '#0e1220',
        }}
      >
        <CreditCard color="#3b82f6" />
      </div>
      <h1 className="title-blue" style={{ fontSize: 18, marginBottom: 8 }}>
        Complete your subscription payment
      </h1>
      <p className="muted" style={{ marginBottom: 8 }}>
        Your account was approved. Pay into the account below, send proof to{' '}
        <strong style={{ color: 'var(--electric)' }}>Lumoedge08@gmail.com</strong>, then
        continue to enter your license key.
      </p>

      <SubscriptionPaymentInfo />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#333' }} />
        <span className="muted">after payment</span>
        <div style={{ flex: 1, height: 1, background: '#333' }} />
      </div>

      <button
        className="btn btn-ghost"
        type="button"
        disabled={checking}
        onClick={() => void unlockPaid()}
      >
        <CheckCircle2 size={18} /> I've Paid — Continue
      </button>
    </div>
  );
}
