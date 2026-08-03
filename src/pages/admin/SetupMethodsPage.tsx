import { Check, Copy, Download, Monitor, Server, Settings2, Shield } from 'lucide-react';
import { useState } from 'react';
import { getCopyScriptUrl } from '../../lib/vpsCopyTrade';
import {
  Mt5ScriptInputsHint,
  Mt5WebRequestInstructions,
} from '../../components/Mt5WebRequestInstructions';
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
  const scriptUrl = getCopyScriptUrl();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Placeholder title="Setup Methods">
        EA-based copy trading — one EA ID controls all licenses under that EA.
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
        <strong style={{ display: 'block', marginBottom: 6 }}>How copy trading works now</strong>
        You pick an EA on Open Orders and tap COPY TRADE — from phone or laptop. Every licensed
        student under that EA receives the signal. Students use the same EA ID + your Mentor ID in
        MT5. No license key in the script.
      </div>

      <StepCard step={1} title="Manage EAs — copy Mentor ID + EA ID" icon={<Shield size={16} />}>
        On <strong>Manage EAs</strong>, copy your <strong>Mentor ID</strong> and each EA&apos;s{' '}
        <strong>EA ID</strong> (e.g. <code>ea-1784470635215</code>). Give students the EA ID for the
        EA their license belongs to.
      </StepCard>

      <StepCard step={2} title="Students: VPS + MT5" icon={<Server size={16} />}>
        Each student runs MT5 on a VPS or PC with LumoEdgeCopy.mq5 attached. Same EA ID + Mentor
        ID for everyone under that EA — no per-student license key in MT5.
      </StepCard>

      <StepCard step={3} title="Download LumoEdgeCopy.mq5" icon={<Download size={16} />}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', color: 'var(--electric)' }}>
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
      </StepCard>

      <StepCard step={4} title="Allow WebRequest URL in MT5 (required)" icon={<Settings2 size={16} />}>
        MT5 will block copy trades until this URL is added. Follow every step:
        <Mt5WebRequestInstructions />
        <Mt5ScriptInputsHint />
      </StepCard>

      <div className="glow-card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Monitor size={16} color="var(--electric)" />
          <strong>Copy from phone or laptop</strong>
        </div>
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li>Create EA → generate licenses for students (keys stay in the app only).</li>
          <li>Open Orders → select EA → COPY TRADE TO EA CLIENTS.</li>
          <li>Students with LumoEdgeCopy.mq5 running receive trades within seconds.</li>
          <li>Students can also use the Lumo Edge app + MT5 tab if the app is open.</li>
        </ol>
      </div>
    </div>
  );
}
