import { useEffect, useState } from 'react';
import { Activity, Check, Loader2, Radio, X } from 'lucide-react';

export type CopyTradePhase = 'signal' | 'executing' | 'success' | 'failed';

type Props = {
  open: boolean;
  phase: CopyTradePhase;
  message: string;
  progress: number;
  eaName?: string;
  side?: string;
  symbol?: string;
  onClose: () => void;
};

export function CopyTradeStatus({
  open,
  phase,
  message,
  progress,
  eaName,
  side,
  symbol,
  onClose,
}: Props) {
  const [exiting, setExiting] = useState(false);
  const failed = phase === 'failed';
  const success = phase === 'success';
  const isActive = phase === 'executing' || phase === 'signal';
  const sideLabel = side === 'sell' ? 'SELL' : side === 'buy' ? 'BUY' : '';
  const displayEa = (eaName || 'Mentor EA').trim();

  const lineText = failed
    ? message || 'Trade execution failed'
    : success
      ? message || 'Trade opened successfully'
      : phase === 'signal'
        ? 'Signal received from mentor'
        : message || 'Opening trade on MT5…';

  useEffect(() => {
    setExiting(false);
  }, [open, phase, message]);

  useEffect(() => {
    if (!success || failed) return;
    const hold = window.setTimeout(() => setExiting(true), 2400);
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
      className={`te-popup-wrap copy-engine-popup${exiting ? ' te-popup-exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Copy trade engine"
    >
      <div className="te-popup">
        <div className="copy-engine-popup-head">
          <span className="copy-engine-popup-badge">
            <Activity size={13} className={isActive ? 'copy-engine-live-ico' : ''} />
            Copy Trade Engine
          </span>
          {isActive ? (
            <span className="copy-engine-popup-live">
              <Radio size={11} /> LIVE
            </span>
          ) : null}
        </div>

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
              {failed ? lineText : success ? `✓ ${lineText}` : lineText}
            </span>
            <span className="te-popup-sub copy-engine-popup-mentor">
              Signal from your mentor
            </span>
            <span className="te-popup-sub copy-engine-popup-ea">
              <strong>{displayEa}</strong> opening trades · ~LumoEdge
            </span>
            {sideLabel && symbol ? (
              <span className="copy-engine-popup-trade">
                {sideLabel} {symbol}
              </span>
            ) : null}
            {isActive && phase === 'executing' ? (
              <span className="te-popup-sub">Sending order to MetaTrader…</span>
            ) : null}
            {failed && message ? (
              <span className="te-popup-sub">Check MetaTrader connection</span>
            ) : null}
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
