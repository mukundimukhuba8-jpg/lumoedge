import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { SubscriptionPaymentInfo } from '../../components/SubscriptionPaymentInfo';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';

export function WaitingApprovalPage() {
  const navigate = useNavigate();
  const { user, setAccessStatus, accessStatus } = useApp();
  const { getClientByEmail, claimClientPayment } = useAdmin();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'ok' | 'warn' | 'err'>('warn');

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

  const onPaidCheck = async () => {
    if (!user || checking) return;
    setChecking(true);
    setMessage('');
    try {
      const client = getClientByEmail(user.email);
      if (client?.status === 'approved') {
        if (accessStatus === 'pending') setAccessStatus('approved');
        navigate('/activate', { replace: true });
        return;
      }
      if (client?.status === 'rejected') {
        setMessageTone('err');
        setMessage('Your registration was rejected. Contact lumoedge08@gmail.com.');
        return;
      }

      const claimed = await claimClientPayment(user.email);
      const subject = encodeURIComponent('Lumo Edge — Payment proof / pending approval');
      const body = encodeURIComponent(
        `I have paid the Lumo Edge subscription (R600).\n\n` +
          `Name: ${user.firstName} ${user.lastName}\n` +
          `Email: ${user.email}\n` +
          `Status: PENDING approval\n\n` +
          `Please approve my subscription in Super Admin → Subscriptions.`,
      );
      window.open(`mailto:lumoedge08@gmail.com?subject=${subject}&body=${body}`, '_blank');

      setMessageTone('ok');
      setMessage(
        claimed?.paymentClaimed
          ? 'Payment marked as sent. Your subscription is PENDING — Super Admin must approve it. After approval you will enter your license key.'
          : 'Payment notice saved on this device. Your subscription is still PENDING approval by Super Admin.',
      );
    } finally {
      window.setTimeout(() => setChecking(false), 400);
    }
  };

  const client = user ? getClientByEmail(user.email) : undefined;
  const status = (client?.status ?? 'pending').toUpperCase();
  const paidPending = Boolean(client?.paymentClaimed) && status === 'PENDING';

  return (
    <div className="page" style={{ paddingTop: 36, paddingBottom: 28 }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 14px',
            borderRadius: 16,
            border: '1.5px solid rgba(59,130,246,0.85)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 28px rgba(59,130,246,0.45)',
            background: '#121218',
          }}
        >
          <CreditCard color="#3b82f6" size={28} />
        </div>
        <h1
          className="title-blue"
          style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}
        >
          Payment Required
        </h1>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
          One-time payment to activate your Lumo Edge access.
        </p>
        <div
          style={{
            marginTop: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            border: '1px solid rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.1)',
            color: 'var(--orange)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          STATUS: {status}
          {paidPending ? ' · PAYMENT SENT' : ''}
        </div>
      </div>

      <SubscriptionPaymentInfo referenceEmail={user?.email} />

      {message || paidPending ? (
        <div
          className="glow-card"
          style={{
            marginTop: 16,
            textAlign: 'left',
            borderColor:
              messageTone === 'err'
                ? 'rgba(225,29,46,0.45)'
                : 'rgba(245,158,11,0.55)',
            background:
              messageTone === 'err'
                ? 'rgba(225,29,46,0.12)'
                : 'rgba(245,158,11,0.14)',
            color: messageTone === 'err' ? '#fca5a5' : '#fbbf24',
            fontWeight: 650,
            lineHeight: 1.5,
          }}
        >
          {message ||
            'You already marked payment as sent. Waiting for Super Admin to approve your pending subscription.'}
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-blue"
        style={{
          marginTop: 18,
          borderRadius: 999,
          padding: '13px 16px',
          fontSize: 14,
          fontWeight: 700,
        }}
        disabled={checking}
        onClick={() => void onPaidCheck()}
      >
        {checking ? 'Saving…' : "I've Paid"}
      </button>
      <p className="muted" style={{ marginTop: 12, fontSize: 12, textAlign: 'center' }}>
        After Super Admin approval, the next page asks for your license key.
      </p>
    </div>
  );
}
