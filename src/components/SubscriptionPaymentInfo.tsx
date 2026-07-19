export function SubscriptionPaymentInfo() {
  return (
    <div
      className="glow-card"
      style={{
        marginTop: 20,
        textAlign: 'left',
        borderColor: 'rgba(59,130,246,0.45)',
        background: 'rgba(14,18,32,0.72)',
      }}
    >
      <div className="muted" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
        PAYING SUBSCRIPTION
      </div>
      <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>
        51126773184
      </div>
      <div className="muted" style={{ marginTop: 2 }}>
        ACC NO
      </div>
      <div style={{ marginTop: 14, fontWeight: 700 }}>TYMEBANK</div>
      <div style={{ fontWeight: 700, color: 'var(--electric)' }}>Lumo edge</div>
      <div
        style={{
          marginTop: 14,
          color: 'var(--orange)',
          fontWeight: 800,
          letterSpacing: '0.03em',
        }}
      >
        PLEASE MAKE IMMEDIATE PAYMENT
      </div>
      <p className="muted" style={{ marginTop: 16, lineHeight: 1.55, marginBottom: 0 }}>
        Apologies to everyone — our Lumo EDGE subscription is currently down. Please
        make sure you subscribe and send us proof on this email:
      </p>
      <a
        href="mailto:Lumoedge08@gmail.com"
        style={{
          display: 'inline-block',
          marginTop: 8,
          color: 'var(--electric)',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Lumoedge08@gmail.com
      </a>
    </div>
  );
}
