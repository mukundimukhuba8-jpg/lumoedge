import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { TradeEngineSnapshot } from '../lib/tradeEngine';

type Props = {
  snapshot: TradeEngineSnapshot;
  running: boolean;
  onRetry: () => void;
  onClose: () => void;
};

type StepMeta = { icon: string; active: string; done: string };

const STEP_META: StepMeta[] = [
  { icon: '🤖', active: 'AI Analysis Complete', done: 'AI Analysis Complete' },
  { icon: '📊', active: 'Validating Signal…', done: 'Signal Approved' },
  { icon: '🔍', active: 'Verifying Symbol…', done: 'Symbol Verified' },
  { icon: '📡', active: 'Checking Market Status…', done: 'Market Ready' },
  { icon: '⚙️', active: 'Preparing Trade…', done: 'Trade Prepared' },
  { icon: '⚙️', active: 'Preparing Trade…', done: 'Trade Prepared' },
  { icon: '⚙️', active: 'Preparing Trade…', done: 'Trade Prepared' },
  { icon: '🔗', active: 'Connecting to MT5…', done: 'MT5 Connected' },
  { icon: '📤', active: 'Sending Trade…', done: 'Trade Sent' },
  { icon: '🏦', active: 'Waiting for Broker Confirmation…', done: 'Broker Confirmed' },
  { icon: '✅', active: 'Trade Executed Successfully', done: 'Trade Executed Successfully' },
];

function metaForIndex(index: number): StepMeta {
  return STEP_META[Math.min(Math.max(index, 0), STEP_META.length - 1)];
}

function resolveStepIndex(snapshot: TradeEngineSnapshot): number {
  const { steps, complete, failedStep } = snapshot;
  if (failedStep != null) return failedStep;
  if (complete) return steps.length - 1;
  const active = steps.findIndex((s) => s.status === 'active');
  if (active >= 0) return active;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === 'done') return i;
  }
  return 0;
}

export function TradeEnginePanel({ snapshot, running, onRetry, onClose }: Props) {
  const [exiting, setExiting] = useState(false);
  const stepIndex = resolveStepIndex(snapshot);
  const step = snapshot.steps[stepIndex];
  const meta = metaForIndex(stepIndex);
  const failed = snapshot.failedStep != null;
  const success = snapshot.complete && !failed;
  const isActive = step?.status === 'active' || (running && !success && !failed);
  const isDone = step?.status === 'done' || success;
  const previewDone = success && !snapshot.autoTrade;

  const lineText = useMemo(() => {
    if (failed && step?.error) return step.error;
    if (success) {
      return previewDone ? 'Validation Complete' : meta.done;
    }
    if (isDone && !isActive) return meta.done;
    return meta.active;
  }, [failed, step?.error, success, previewDone, meta, isDone, isActive]);

  useEffect(() => {
    setExiting(false);
  }, [snapshot.dashboard.tradeStatus, snapshot.failedStep]);

  useEffect(() => {
    if (!success || failed) return;
    const hold = window.setTimeout(() => setExiting(true), 2000);
    return () => window.clearTimeout(hold);
  }, [success, failed]);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(onClose, 420);
    return () => window.clearTimeout(t);
  }, [exiting, onClose]);

  if (!step) return null;

  return (
    <div
      className={`te-popup-wrap${exiting ? ' te-popup-exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Trade engine status"
    >
      <div className="te-popup">
        <div className="te-popup-row" key={`${stepIndex}-${step.status}-${lineText}`}>
          <span className="te-popup-icon" aria-hidden>
            {failed ? (
              <X size={16} className="te-popup-fail-ico" />
            ) : isDone && !isActive ? (
              <Check size={16} className="te-popup-check" />
            ) : isActive ? (
              <Loader2 size={16} className="spin te-popup-spin" />
            ) : (
              <span>{meta.icon}</span>
            )}
          </span>
          <div className="te-popup-copy">
            <span
              className={`te-popup-line${isDone && !failed && !isActive ? ' done' : ''}${failed ? ' failed' : ''}`}
            >
              {failed
                ? lineText
                : isDone && !isActive
                  ? `✓ ${lineText}`
                  : `${meta.icon} ${lineText}`}
            </span>
            {failed && step.error ? (
              <span className="te-popup-sub">{meta.active}</span>
            ) : null}
          </div>
          {failed ? (
            <button type="button" className="te-popup-retry" onClick={onRetry} aria-label="Retry">
              <RefreshCw size={14} />
            </button>
          ) : null}
        </div>

        <div className="te-popup-progress" aria-hidden>
          <span className="te-popup-progress-fill" style={{ width: `${snapshot.progressPct}%` }} />
        </div>
        <div className="te-popup-pct">{snapshot.progressPct}%</div>
      </div>
    </div>
  );
}
