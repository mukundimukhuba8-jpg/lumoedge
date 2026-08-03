import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { getCopyApiBaseUrl } from '../lib/vpsCopyTrade';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy URL"
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

export function Mt5WebRequestInstructions() {
  const apiUrl = getCopyApiBaseUrl();

  return (
    <div style={{ marginTop: 10 }}>
      <ol style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.65 }}>
        <li style={{ marginBottom: 8 }}>
          Open MetaTrader 5 on your VPS or PC and log in to your broker account.
        </li>
        <li style={{ marginBottom: 8 }}>
          Go to <strong style={{ color: 'var(--text)' }}>Tools → Options</strong> (or press{' '}
          <strong style={{ color: 'var(--text)' }}>Ctrl+O</strong>).
        </li>
        <li style={{ marginBottom: 8 }}>
          Open the <strong style={{ color: 'var(--text)' }}>Expert Advisors</strong> tab.
        </li>
        <li style={{ marginBottom: 8 }}>
          Tick <strong style={{ color: 'var(--text)' }}>Allow algorithmic trading</strong>.
        </li>
        <li style={{ marginBottom: 8 }}>
          Tick <strong style={{ color: 'var(--text)' }}>Allow WebRequest for listed URL</strong>.
        </li>
        <li style={{ marginBottom: 8 }}>
          In the URL list box, click <strong style={{ color: 'var(--text)' }}>Add</strong> and paste
          this URL exactly (no spaces):
        </li>
      </ol>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderRadius: 12,
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.45)',
          marginBottom: 12,
        }}
      >
        <code
          style={{
            flex: 1,
            color: '#fbbf24',
            fontSize: 12,
            fontWeight: 700,
            wordBreak: 'break-all',
          }}
        >
          {apiUrl}
        </code>
        <CopyButton value={apiUrl} />
      </div>

      <ol start={7} style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
        <li style={{ marginBottom: 8 }}>
          Click <strong style={{ color: 'var(--text)' }}>OK</strong> to save. If MT5 was already
          open, restart MetaTrader once so the URL is accepted.
        </li>
        <li style={{ marginBottom: 8 }}>
          Install <strong style={{ color: 'var(--text)' }}>LumoEdgeCopy.mq5</strong>: File → Open
          Data Folder → MQL5 → Experts → paste the file → open MetaEditor → Compile (F7).
        </li>
        <li style={{ marginBottom: 8 }}>
          Drag <strong style={{ color: 'var(--text)' }}>LumoEdgeCopy</strong> onto any chart. In
          Inputs set <strong>EaId</strong> and <strong>MentorId</strong> (leave license key empty).
        </li>
        <li>
          Click the <strong style={{ color: 'var(--text)' }}>Algo Trading</strong> button in the
          toolbar so it turns green. You should see &quot;Lumo Edge Copy EA started&quot; in the
          Experts tab — if WebRequest failed, the URL above was not added correctly.
        </li>
      </ol>
    </div>
  );
}

export function Mt5ScriptInputsHint() {
  const apiUrl = getCopyApiBaseUrl();
  return (
    <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.55 }}>
      Script inputs: <strong>EaId</strong> (from mentor), <strong>MentorId</strong>,{' '}
      <strong>ApiBaseUrl</strong> = {apiUrl}. No license key required.
    </p>
  );
}
