import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CreditCard, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function SubscribePage() {
  const { markPaid } = useApp();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);

  const unlock = async () => {
    setChecking(true);
    await new Promise((r) => setTimeout(r, 600));
    markPaid();
    navigate('/app');
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
      <h1 className="title-blue" style={{ fontSize: 28, marginBottom: 10 }}>
        Activate Your Access
      </h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Complete your one-time payment below to unlock Unlimited Bull
      </p>

      <button
        className="btn btn-blue"
        type="button"
        onClick={() => {
          setPending(true);
          window.open('https://buy.stripe.com/test_unlimited_bull', '_blank');
        }}
      >
        <ExternalLink size={18} /> Pay Now
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#333' }} />
        <span className="muted">after payment</span>
        <div style={{ flex: 1, height: 1, background: '#333' }} />
      </div>

      <button
        className="btn btn-ghost"
        type="button"
        disabled={checking}
        onClick={async () => {
          if (!pending) {
            setPending(true);
            return;
          }
          await unlock();
        }}
      >
        <CheckCircle2 size={18} /> I've Paid — Check My Access
      </button>

      {pending ? (
        <div
          className="glow-card"
          style={{
            marginTop: 20,
            borderColor: 'rgba(245,158,11,0.45)',
            background: 'rgba(245,158,11,0.12)',
            color: '#f59e0b',
            fontWeight: 600,
          }}
        >
          Payment not confirmed yet. Once verified you'll gain instant access.
        </div>
      ) : null}

      <button
        type="button"
        onClick={unlock}
        style={{
          marginTop: 28,
          background: 'transparent',
          color: 'var(--muted)',
          textDecoration: 'underline',
        }}
      >
        Continue with demo access
      </button>
    </div>
  );
}
