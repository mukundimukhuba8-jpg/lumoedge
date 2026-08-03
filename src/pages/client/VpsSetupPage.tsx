import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Server, Settings2, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mentorIdForLicense } from '../../lib/copyTrade';
import { findInVault } from '../../lib/storage';
import {
  getCopyScriptUrl,
} from '../../lib/vpsCopyTrade';
import {
  Mt5ScriptInputsHint,
  Mt5WebRequestInstructions,
} from '../../components/Mt5WebRequestInstructions';

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
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'rgba(59,130,246,0.12)',
        border: '1px solid rgba(59,130,246,0.35)',
        color: 'var(--electric)',
        padding: 0,
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function StepBlock({
  n,
  title,
  icon,
  children,
}: {
  n: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glow-card" style={{ textAlign: 'left', padding: '16px 14px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: 'var(--electric)',
            fontWeight: 800,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {icon}
            <strong>{title}</strong>
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function VpsSetupPage() {
  const navigate = useNavigate();
  const { bot } = useApp();
  const licenseKey = bot.licenseKey?.trim() || '';
  const vault = licenseKey ? findInVault(licenseKey) : undefined;
  const eaId = vault?.eaId || '';
  const mentorId = licenseKey ? mentorIdForLicense(licenseKey) : '';
  const scriptUrl = getCopyScriptUrl();

  return (
    <div className="page cyber-page" style={{ paddingTop: 24, paddingBottom: 28 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => navigate('/app/symbols')}
          aria-label="Back"
          style={{ background: 'transparent', padding: 6 }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="title-blue" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          VPS Setup
        </h1>
      </header>

      <p className="muted" style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.55, marginTop: 0 }}>
        Your mentor&apos;s EA controls copy trades for all licenses under that EA. No license key goes
        in MT5 — only EA ID + Mentor ID.
      </p>

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <StepBlock n={1} title="Use a PC or VPS with MT5" icon={<Server size={16} color="var(--electric)" />}>
          Install MetaTrader 5 on a VPS or always-on PC. Log in to your broker and keep automated
          trading enabled.
        </StepBlock>

        <StepBlock n={2} title="Copy EA ID + Mentor ID" icon={<Shield size={16} color="var(--electric)" />}>
          Use the values from your mentor (Manage EAs page). Yours for this license:
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.35)',
              }}
            >
              <span className="muted" style={{ fontSize: 11, minWidth: 72 }}>EA ID</span>
              <code style={{ flex: 1, color: 'var(--electric)', fontWeight: 700, wordBreak: 'break-all' }}>
                {eaId || 'Activate your license first'}
              </code>
              {eaId ? <CopyButton value={eaId} /> : null}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.35)',
              }}
            >
              <span className="muted" style={{ fontSize: 11, minWidth: 72 }}>Mentor ID</span>
              <code style={{ flex: 1, color: 'var(--electric)', fontWeight: 700, wordBreak: 'break-all' }}>
                {mentorId || '—'}
              </code>
              {mentorId ? <CopyButton value={mentorId} /> : null}
            </div>
          </div>
        </StepBlock>

        <StepBlock n={3} title="Download LumoEdgeCopy.mq5" icon={<Download size={16} color="var(--electric)" />}>
          <a
            href={scriptUrl}
            download="LumoEdgeCopy.mq5"
            className="btn btn-blue"
            style={{ marginTop: 8 }}
          >
            Download script
          </a>
          <p style={{ margin: '10px 0 0' }}>
            MT5 → File → Open Data Folder → MQL5 → Experts → compile → attach to chart.
          </p>
        </StepBlock>

        <StepBlock n={4} title="Allow WebRequest URL in MT5 (required)" icon={<Settings2 size={16} color="var(--electric)" />}>
          MT5 will ask you to allow WebRequest for a URL — add this before attaching the script:
          <Mt5WebRequestInstructions />
          <Mt5ScriptInputsHint />
        </StepBlock>

        <StepBlock n={5} title="Attach the script" icon={<Shield size={16} color="var(--electric)" />}>
          After WebRequest is allowed, attach LumoEdgeCopy to any chart with your EA ID and Mentor
          ID from step 2. Turn on Algo Trading (green button). Copy trades arrive within a few
          seconds when your mentor sends them.
        </StepBlock>
      </div>
    </div>
  );
}
