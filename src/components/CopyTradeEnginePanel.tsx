import { Activity, Radio, Zap } from 'lucide-react';
import { useCopyTradeEngine } from '../context/CopyTradeContext';

type Props = {
  eaTitle?: string;
  isPaused?: boolean;
};

export function CopyTradeEnginePanel({ eaTitle, isPaused = false }: Props) {
  const { mt5Linked, engineSignal, statusLabel, statusDetail, sentToday } =
    useCopyTradeEngine();

  const pillPhase = isPaused
    ? 'connected'
    : statusLabel === 'Trade Sent Successfully'
      ? 'sent'
      : statusLabel === 'Executing Trade'
        ? 'copying'
        : mt5Linked
          ? 'waiting'
          : 'connected';

  const displayStatus = isPaused ? 'Paused' : statusLabel;
  const displayDetail = isPaused
    ? 'Press Resume on Home to start the EA.'
    : statusDetail;

  return (
    <section className="glow-card cyber-card copy-engine">
      <div className="copy-engine-head">
        <Activity
          size={18}
          color="var(--electric)"
          className={isPaused ? '' : 'copy-engine-live-ico'}
        />
        <div>
          <strong>Engine</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {eaTitle || 'Lumo Edge'} · live trade engine
          </p>
        </div>
        <span className={`copy-engine-pill phase-${pillPhase}`}>
          <Radio size={12} /> {displayStatus}
        </span>
      </div>
      <div className="copy-engine-grid">
        <div>
          <span>Engine</span>
          <strong>Online</strong>
        </div>
        <div>
          <span>Broker</span>
          <strong>{mt5Linked ? 'Connected' : '—'}</strong>
        </div>
        <div>
          <span>Signal</span>
          <strong>{engineSignal === 'active' ? 'Active' : 'Idle'}</strong>
        </div>
        <div>
          <span>Latency</span>
          <strong>42ms</strong>
        </div>
        <div>
          <span>Sent Today</span>
          <strong>{sentToday > 0 ? sentToday : '—'}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{displayStatus}</strong>
        </div>
      </div>
      <p className="copy-engine-foot muted">
        <Zap size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        {displayDetail}
      </p>
    </section>
  );
}
