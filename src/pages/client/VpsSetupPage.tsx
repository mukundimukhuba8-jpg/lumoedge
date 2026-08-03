import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Monitor, Server, Settings2, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getOrCreateCopyEaId } from '../../lib/copyEaId';
import {
  getCopyApiBaseUrl,
  getCopyScriptUrl,
  getWebRequestAllowlistUrl,
  registerCopyTerminal,
} from '../../lib/vpsCopyTrade';

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
  const { user, bot } = useApp();
  const licenseKey = bot.licenseKey?.trim() || '';
  const copyEaId = licenseKey ? getOrCreateCopyEaId(licenseKey) : '';
  const apiUrl = getWebRequestAllowlistUrl();
  const scriptUrl = getCopyScriptUrl();
  const [registerMsg, setRegisterMsg] = useState('');

  useEffect(() => {
    if (!licenseKey || !copyEaId || !user?.email) return;
    let cancelled = false;
    void registerCopyTerminal({
      copyEaId,
      licenseKey,
      email: user.email,
    }).then((res) => {
      if (cancelled) return;
      setRegisterMsg(
        res.ok
          ? 'Terminal registered — your VPS script can receive trades.'
          : res.error || 'Could not register terminal yet.',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [licenseKey, copyEaId, user?.email]);

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
        Complete these steps on a PC or VPS with MetaTrader 5 for 24/7 copy trading.
      </p>

      {registerMsg ? (
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: registerMsg.includes('registered') ? 'var(--green)' : 'var(--orange)',
            fontWeight: 650,
          }}
        >
          {registerMsg}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <StepBlock n={1} title="Use a PC or VPS with MT5" icon={<Server size={16} color="var(--electric)" />}>
          Install MetaTrader 5 on a VPS or always-on computer. Log in to your broker and keep the
          terminal running with automated trading enabled.
        </StepBlock>

        <StepBlock n={2} title="Copy your Copy EA ID" icon={<Shield size={16} color="var(--electric)" />}>
          Paste this ID into the Lumo Edge script on your chart:
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.35)',
            }}
          >
            <code style={{ flex: 1, color: 'var(--electric)', fontWeight: 700, wordBreak: 'break-all' }}>
              {copyEaId || 'Activate your license first'}
            </code>
            {copyEaId ? <CopyButton value={copyEaId} /> : null}
          </div>
          {licenseKey ? (
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>
              License: <span style={{ color: 'var(--text)' }}>{licenseKey}</span>
            </p>
          ) : null}
        </StepBlock>

        <StepBlock n={3} title="Download the copy trading script" icon={<Download size={16} color="var(--electric)" />}>
          Download and install the Lumo Edge receiver script:
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <a
              href={scriptUrl}
              download="LumoEdgeCopy.mq5"
              className="btn btn-blue"
              style={{ flex: 1, minWidth: 140 }}
            >
              Download LumoEdgeCopy.mq5
            </a>
            <CopyButton value={scriptUrl} />
          </div>
          <p style={{ margin: '10px 0 0' }}>
            MT5 → File → Open Data Folder → MQL5 → Experts → save file → compile in MetaEditor →
            attach to a chart.
          </p>
        </StepBlock>

        <StepBlock n={4} title="Configure MetaTrader settings" icon={<Settings2 size={16} color="var(--electric)" />}>
          Tools → Options → Expert Advisors:
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>Enable automated trading</li>
            <li>Enable WebRequest for listed URL</li>
            <li>Add this URL:</li>
          </ul>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.35)',
            }}
          >
            <code style={{ flex: 1, color: '#fbbf24', fontSize: 12, wordBreak: 'break-all' }}>
              {apiUrl}
            </code>
            <CopyButton value={apiUrl} />
          </div>
          <p style={{ margin: '10px 0 0' }}>
            Script inputs: Copy EA ID, License key, ApiBaseUrl ({getCopyApiBaseUrl()}).
          </p>
        </StepBlock>

        <section className="glow-card" style={{ textAlign: 'left', padding: '14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Monitor size={16} color="var(--electric)" />
            <strong>When setup is complete</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            Your VPS script polls Lumo Edge every few seconds. When your mentor sends a copy trade,
            it executes automatically on your MT5 account — no need to keep this browser open.
          </p>
        </section>
      </div>
    </div>
  );
}
