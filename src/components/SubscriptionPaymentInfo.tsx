import { CreditCard, ExternalLink } from 'lucide-react';

export const CHECKOUT_URL = 'https://capepaulse.lovable.app/';

export function SubscriptionPaymentInfo() {
  const openCheckout = () => {
    window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="glow-card"
      style={{
        marginTop: 20,
        textAlign: 'center',
        borderColor: 'rgba(59,130,246,0.55)',
        boxShadow: '0 0 32px rgba(59,130,246,0.24)',
        padding: '22px 18px 20px',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          margin: '0 auto 14px',
          borderRadius: '50%',
          border: '1.5px solid rgba(59,130,246,0.85)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 0 24px rgba(59,130,246,0.35)',
          background: '#121218',
        }}
      >
        <CreditCard color="#3b82f6" size={24} />
      </div>

      <h2
        style={{
          margin: '0 0 8px',
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--text)',
        }}
      >
        Almost there
      </h2>

      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
        You&apos;re being redirected to our payment gateway.
      </p>

      <p
        style={{
          margin: '0 0 18px',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--muted)',
          maxWidth: 320,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        You&apos;ll need to sign up on{' '}
        <strong style={{ color: 'var(--electric)' }}>Swagstack</strong> to complete your payment.
        Once it&apos;s done, your{' '}
        <strong style={{ color: 'var(--text)' }}>LumoEdge</strong> access will be activated
        automatically.
      </p>

      <button
        type="button"
        className="btn btn-blue"
        style={{
          width: '100%',
          borderRadius: 999,
          padding: '13px 16px',
          fontSize: 14,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
        onClick={openCheckout}
      >
        Continue to Payment
        <ExternalLink size={16} />
      </button>
    </div>
  );
}
