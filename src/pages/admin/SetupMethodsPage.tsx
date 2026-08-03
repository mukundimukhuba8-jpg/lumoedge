import { Check, Copy, Download, Monitor, Server, Settings2, Shield } from 'lucide-react';
import { useState } from 'react';
import { getCopyApiBaseUrl, getCopyScriptUrl } from '../../lib/vpsCopyTrade';
import { Placeholder } from './AdminShell';

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
        width: 30,
        height: 30,
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

function StepCard({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glow-card" style={{ padding: '16px 16px 14px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(59,130,246,0.14)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: 'var(--electric)',
            fontWeight: 800,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {step}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {icon}
            <strong style={{ fontSize: 15 }}>{title}</strong>
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetupMethodsPage() {
  const apiUrl = getCopyApiBaseUrl();
  const scriptUrl = getCopyScriptUrl();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Placeholder title="Setup Methods">
        VPS copy trading — how mentors and clients connect MetaTrader to Lumo Edge.
      </Placeholder>

      <div
        className="glow-card"
        style={{
          borderColor: 'rgba(57,255,20,0.35)',
          background: 'rgba(57,255,20,0.08)',
          color: '#86efac',
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>VPS mode is active</strong>
        Copy trades are delivered to clients through the Lumo Edge MT5 script on their VPS or PC.
        The browser app no longer executes copy trades — clients must complete the setup below.
      </div>

      <StepCard step={1} title="Use a PC or VPS with MT5" icon={<Server size={16} />}>
        For reliable 24/7 copy trading, clients should run MetaTrader 5 on a VPS or always-on PC.
        Install MT5, log in to their broker account, and keep the terminal open with automated
        trading enabled.
      </StepCard>

      <StepCard step={2} title="Copy the EA ID" icon={<Shield size={16} />}>
        Each managed EA has an <strong style={{ color: 'var(--text)' }}>EA ID</strong> on the{' '}
        <strong style={{ color: 'var(--text)' }}>Manage EAs</strong> page (for example{' '}
        <code style={{ color: 'var(--electric)' }}>ea-1730123456789</code>). Clients also receive a
        personal <strong style={{ color: 'var(--text)' }}>Copy EA ID</strong> (starts with{' '}
        <code style={{ color: 'var(--electric)' }}>CT-</code>) on their Setup page after activating
        their license — they need that ID in the MT5 script inputs.
      </StepCard>

      <StepCard step={3} title="Download the copy trading script" icon={<Download size={16} />}>
        Clients download <strong style={{ color: 'var(--text)' }}>LumoEdgeCopy.mq5</strong> from
        their in-app Setup page or directly:
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <code
            style={{
              flex: 1,
              fontSize: 12,
              wordBreak: 'break-all',
              color: 'var(--electric)',
            }}
          >
            {scriptUrl}
          </code>
          <CopyButton value={scriptUrl} />
          <a
            href={scriptUrl}
            download="LumoEdgeCopy.mq5"
            className="btn btn-blue"
            style={{ width: 'auto', padding: '8px 12px', fontSize: 12 }}
          >
            Download
          </a>
        </div>
        <p style={{ margin: '10px 0 0' }}>
          In MT5: File → Open Data Folder → MQL5 → Experts → paste the file → compile in MetaEditor
          → attach to any chart.
        </p>
      </StepCard>

      <StepCard step={4} title="Configure MetaTrader settings" icon={<Settings2 size={16} />}>
        In MetaTrader: <strong style={{ color: 'var(--text)' }}>Tools → Options → Expert Advisors</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>Enable <strong>Allow automated trading</strong></li>
          <li>Enable <strong>Allow WebRequest for listed URL</strong></li>
          <li>Add this URL to the allowed list:</li>
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <code
            style={{
              flex: 1,
              fontSize: 12,
              wordBreak: 'break-all',
              color: 'var(--electric)',
            }}
          >
            {apiUrl}
          </code>
          <CopyButton value={apiUrl} />
        </div>
        <p style={{ margin: '10px 0 0' }}>
          Script inputs: <strong>Copy EA ID</strong>, <strong>License key</strong>, and{' '}
          <strong>ApiBaseUrl</strong> ({apiUrl}).
        </p>
      </StepCard>

      <div className="glow-card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Monitor size={16} color="var(--electric)" />
          <strong>Mentor workflow</strong>
        </div>
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li>Create an EA on Manage EAs and generate license keys.</li>
          <li>Connect your broker on Connect EA (or queue trades from Open Orders).</li>
          <li>Queue copy trades from Open Orders — clients&apos; VPS scripts pick them up within seconds.</li>
          <li>Clients tap I&apos;ve Paid / activate license, then complete VPS setup on their Setup page.</li>
        </ol>
      </div>
    </div>
  );
}
