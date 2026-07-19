import { useState } from 'react';
import { AlertTriangle, Check, Copy, CreditCard } from 'lucide-react';

const BANK = 'TymeBank';
const ACCOUNT_NAME = 'Lumo Edge';
const ACCOUNT_NO = '51126773184';
const AMOUNT = 'R600';
const PROOF_EMAIL = 'lumoedge08@gmail.com';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore */
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 8,
        background: 'rgba(59,130,246,0.12)',
        border: '1px solid rgba(59,130,246,0.35)',
        color: 'var(--electric)',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function DetailRow({
  label,
  value,
  accent,
  copyValue,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  copyValue?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '11px 0',
        borderBottom: last ? 'none' : '1px solid rgba(148,190,255,0.12)',
      }}
    >
      <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <strong
          style={{
            color: accent ? 'var(--electric)' : 'var(--text)',
            fontWeight: 700,
            fontSize: 13,
            textAlign: 'right',
            wordBreak: 'break-all',
          }}
        >
          {value}
        </strong>
        {copyValue ? <CopyButton value={copyValue} /> : null}
      </div>
    </div>
  );
}

export function SubscriptionPaymentInfo({ referenceEmail }: { referenceEmail?: string }) {
  const reference = referenceEmail?.trim() || 'your registered email';
  const steps = [
    `Make an EFT of ${AMOUNT} to the TymeBank account above`,
    'Use your email address as the payment reference',
    `Screenshot your proof of payment and email it to ${PROOF_EMAIL}`,
    "Tap \"I've Paid\" below once you've sent proof",
  ];

  return (
    <div style={{ textAlign: 'left', marginTop: 8 }}>
      <div
        style={{
          marginTop: 18,
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.35)',
          color: '#fbbf24',
        }}
      >
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, fontWeight: 600 }}>
          Lumo Edge subscriptions are currently down. Subscription fee is{' '}
          <strong style={{ color: '#fde68a' }}>{AMOUNT}</strong>.
        </p>
      </div>

      <div
        className="glow-card"
        style={{
          marginTop: 16,
          borderColor: 'rgba(59,130,246,0.55)',
          boxShadow:
            '0 0 24px rgba(59,130,246,0.22), inset 0 1px 0 rgba(255,255,255,0.12)',
          padding: '14px 14px 4px',
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 2,
          }}
        >
          PAYMENT DETAILS
        </div>
        <DetailRow label="Bank" value={BANK} />
        <DetailRow label="Account Name" value={ACCOUNT_NAME} />
        <DetailRow label="Account No." value={ACCOUNT_NO} accent copyValue={ACCOUNT_NO} />
        <DetailRow label="Amount" value={AMOUNT} accent />
        <DetailRow
          label="Reference"
          value={reference}
          accent
          copyValue={referenceEmail}
          last
        />
      </div>

      <div
        className="glow-card"
        style={{
          marginTop: 14,
          padding: '14px 14px 12px',
          borderColor: 'rgba(148,190,255,0.18)',
          boxShadow: 'none',
        }}
      >
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: 10,
          }}
        >
          HOW IT WORKS
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
          {steps.map((step) => (
            <li
              key={step}
              style={{
                marginBottom: 8,
                fontSize: 12.5,
                lineHeight: 1.5,
                fontWeight: 500,
              }}
            >
              {step.includes(PROOF_EMAIL) ? (
                <>
                  Screenshot your proof of payment and email it to{' '}
                  <a
                    href={`mailto:${PROOF_EMAIL}`}
                    style={{ color: 'var(--electric)', fontWeight: 700 }}
                  >
                    {PROOF_EMAIL}
                  </a>
                </>
              ) : (
                step
              )}
            </li>
          ))}
        </ol>
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--orange)',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '0.04em',
        }}
      >
        <CreditCard size={15} />
        PLEASE MAKE IMMEDIATE PAYMENT
      </div>
    </div>
  );
}
