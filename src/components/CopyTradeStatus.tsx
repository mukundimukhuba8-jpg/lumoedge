import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

export type CopyTradePhase = 'executing' | 'success' | 'failed';

type Props = {
  open: boolean;
  phase: CopyTradePhase;
  message: string;
  progress: number;
  onClose: () => void;
};

export function CopyTradeStatus({ open, phase, message, progress, onClose }: Props) {
  const [exiting, setExiting] = useState(false);
  const failed = phase === 'failed';
  const success = phase === 'success';
  const isActive = phase === 'executing';

  const lineText = failed
    ? message || 'Trade execution failed'
    : success
      ? 'Trade Executed Successfully'
      : message || 'Executing trade…';

  useEffect(() => {
    setExiting(false);
  }, [open, phase, message]);

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

  if (!open) return null;

  return (
    <div
      className={`te-popup-wrap${exiting ? ' te-popup-exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Trade execution status"
    >
      <div className="te-popup">
        <div className="te-popup-row" key={`${phase}-${lineText}`}>
          <span className="te-popup-icon" aria-hidden>
            {failed ? (
              <X size={16} className="te-popup-fail-ico" />
            ) : success ? (
              <Check size={16} className="te-popup-check" />
            ) : (
              <Loader2 size={16} className="spin te-popup-spin" />
            )}
          </span>
          <div className="te-popup-copy">
            <span
              className={`te-popup-line${success ? ' done' : ''}${failed ? ' failed' : ''}`}
            >
              {failed
                ? lineText
                : success
                  ? `✓ ${lineText}`
                  : `⚙️ ${lineText}`}
            </span>
            {isActive ? <span className="te-popup-sub">Sending trade to MT5…</span> : null}
            {failed && message ? <span className="te-popup-sub">Check MetaTrader connection</span> : null}
          </div>
        </div>

        <div className="te-popup-progress" aria-hidden>
          <span className="te-popup-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="te-popup-pct">{progress}%</div>
      </div>
    </div>
  );
}
