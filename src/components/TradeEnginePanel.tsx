import {
  Activity,
  Check,
  CheckCircle2,
  Cog,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type { TradeEngineSnapshot } from '../lib/tradeEngine';

type Props = {
  snapshot: TradeEngineSnapshot;
  running: boolean;
  onRetry: () => void;
  onClose: () => void;
};

const RING_C = 2 * Math.PI * 45;

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TradeEnginePanel({ snapshot, running, onRetry, onClose }: Props) {
  const { steps, progressPct, etaSec, dashboard, failedStep, complete, autoTrade } =
    snapshot;
  const ringOffset = RING_C - (progressPct / 100) * RING_C;
  const success = complete && failedStep == null;
  const failed = failedStep != null;
  const dirBuy = dashboard.direction.toUpperCase() === 'BUY';

  return (
    <div className="te-overlay" role="dialog" aria-modal="true" aria-label="Trade Engine">
      <div className="te-backdrop" onClick={complete ? onClose : undefined} aria-hidden />
      <section className="te-panel mt5-glass">
        <header className="te-header">
          <div className="mt5-engine-badge" aria-hidden>
            <Cog size={22} className="mt5-engine-icon" />
          </div>
          <div className="te-titles">
            <h2>Trade Engine</h2>
            <p>{autoTrade ? 'Auto execution sequence' : 'Signal validation preview'}</p>
          </div>
          <button type="button" className="te-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {success ? (
          <div className="te-success-banner mt5-success-pop" role="status">
            <CheckCircle2 size={28} />
            <div>
              <strong>Trade engine complete</strong>
              <span>{dashboard.tradeStatus}</span>
            </div>
          </div>
        ) : null}

        <div className="mt5-progress-row">
          <div className="mt5-ring-wrap" aria-hidden>
            <svg viewBox="0 0 100 100" className="mt5-ring">
              <circle className="mt5-ring-track" cx="50" cy="50" r="45" />
              <circle
                className={`mt5-ring-fill${success ? ' te-ring-success' : ''}${failed ? ' te-ring-fail' : ''}`}
                cx="50"
                cy="50"
                r="45"
                style={{ strokeDashoffset: ringOffset }}
              />
            </svg>
            <div className="mt5-ring-label">
              <strong>{progressPct}%</strong>
              <small>Complete</small>
            </div>
          </div>
          <div className="mt5-progress-meta">
            <div className="mt5-est">
              <span>Estimated remaining</span>
              <strong>{etaSec}s</strong>
            </div>
            <div className="mt5-load-bar">
              <span className="mt5-load-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt5-flow-line">
              <span className="mt5-flow-pulse" />
              {running
                ? 'Processing trade pipeline…'
                : failed
                  ? 'Step failed — retry or close'
                  : complete
                    ? 'Sequence finished'
                    : 'Ready'}
            </p>
          </div>
        </div>

        <div className="te-dash">
          <div className="te-dash-head">
            <Activity size={15} />
            <span>Live engine dashboard</span>
          </div>
          <div className="te-dash-grid">
            <div className="te-dash-item">
              <span>Symbol</span>
              <strong>{dashboard.symbol}</strong>
            </div>
            <div className="te-dash-item">
              <span>Signal</span>
              <strong className={dirBuy ? 'te-buy' : 'te-sell'}>
                {dirBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {dashboard.direction}
              </strong>
            </div>
            <div className="te-dash-item">
              <span>Confidence</span>
              <strong>{dashboard.confidence}%</strong>
            </div>
            <div className="te-dash-item">
              <span>Entry</span>
              <strong>{dashboard.entry}</strong>
            </div>
            <div className="te-dash-item">
              <span>Stop Loss</span>
              <strong>{dashboard.stopLoss}</strong>
            </div>
            <div className="te-dash-item">
              <span>Take Profit</span>
              <strong>{dashboard.takeProfit}</strong>
            </div>
            <div className="te-dash-item">
              <span>MT5</span>
              <strong>{dashboard.mt5Status}</strong>
            </div>
            <div className="te-dash-item">
              <span>Broker</span>
              <strong>{dashboard.broker}</strong>
            </div>
            <div className="te-dash-item">
              <span>Trade status</span>
              <strong>{dashboard.tradeStatus}</strong>
            </div>
            <div className="te-dash-item">
              <span>Execution</span>
              <strong>{formatMs(dashboard.executionMs)}</strong>
            </div>
          </div>
        </div>

        <ol className="mt5-steps te-steps">
          {steps.map((step, i) => {
            const done = step.status === 'done';
            const active = step.status === 'active';
            const isFailed = step.status === 'failed';
            const dim = step.status === 'pending';
            return (
              <li
                key={step.label}
                className={`mt5-step${done ? ' done' : ''}${active ? ' active' : ''}${isFailed ? ' failed' : ''}${dim ? ' dim' : ''}`}
              >
                <span className="mt5-step-ico" aria-hidden>
                  {done ? (
                    <Check size={14} />
                  ) : isFailed ? (
                    <X size={14} />
                  ) : active ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="te-step-body">
                  <span className="mt5-step-text">{step.label}</span>
                  {step.error ? <span className="te-step-err">{step.error}</span> : null}
                </div>
                {active ? <span className="mt5-step-line" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>

        <div className="te-actions">
          {failed && failedStep != null ? (
            <button type="button" className="btn btn-blue te-retry" onClick={onRetry}>
              <RefreshCw size={16} />
              Retry step {failedStep + 1}
            </button>
          ) : null}
          {complete ? (
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              <Zap size={16} />
              Close engine
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
