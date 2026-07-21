import { useEffect, useState } from 'react';
import { Activity, Radio, Zap } from 'lucide-react';
import { getMt5Token } from '../lib/mt5Session';

type CopyPhase = 'connected' | 'waiting' | 'copying' | 'sent';

type Props = {
  email?: string;
  mentorName?: string;
  copyStatus?: string;
};

export function CopyTradeStatus({ email, mentorName, copyStatus }: Props) {
  const [phase, setPhase] = useState<CopyPhase>('waiting');
  const mt5Linked = Boolean(getMt5Token(email));

  useEffect(() => {
    if (!mt5Linked) {
      setPhase('connected');
      return;
    }
    if (copyStatus && /executed|copied|sent/i.test(copyStatus)) {
      setPhase('sent');
      const t = window.setTimeout(() => setPhase('connected'), 3000);
      return () => window.clearTimeout(t);
    }
    if (copyStatus && /copy/i.test(copyStatus)) {
      setPhase('copying');
      return;
    }
    setPhase('waiting');
  }, [copyStatus, mt5Linked]);

  const label =
    phase === 'sent'
      ? 'Trade Sent Successfully'
      : phase === 'copying'
        ? 'Copying Trade'
        : phase === 'waiting'
          ? 'Waiting for Signal'
          : mt5Linked
            ? 'Connected'
            : 'Connect MT5';

  return (
    <section className="glow-card cyber-card copy-engine">
      <div className="copy-engine-head">
        <Activity size={18} color="var(--electric)" />
        <div>
          <strong>Copy Trade From Your Mentor</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {mentorName || 'Mentor'} · live copy engine
          </p>
        </div>
        <span className={`copy-engine-pill phase-${phase}`}>
          <Radio size={12} /> {label}
        </span>
      </div>
      <div className="copy-engine-grid">
        <div><span>Engine</span><strong>Online</strong></div>
        <div><span>Broker</span><strong>{mt5Linked ? 'Connected' : '—'}</strong></div>
        <div><span>Signal</span><strong>{phase === 'waiting' ? 'Idle' : 'Active'}</strong></div>
        <div><span>Latency</span><strong>42ms</strong></div>
        <div><span>Sent Today</span><strong>—</strong></div>
        <div><span>Status</span><strong>{label}</strong></div>
      </div>
      <p className="copy-engine-foot muted">
        <Zap size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        {copyStatus || 'Listening for mentor signals…'}
      </p>
    </section>
  );
}
