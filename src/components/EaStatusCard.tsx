import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  clampEaFloatPos,
  loadEaFloatPos,
  saveEaFloatPos,
  topEaFloatPos,
  type EaFloatPos,
} from '../lib/eaFloatPosition';
import { isMentorProfileImage } from '../lib/mentorMedia';

type Props = {
  open: boolean;
  eaTitle: string;
  avatarUrl: string;
  isPaused: boolean;
  mt5Linked: boolean;
  onClose: () => void;
  onTogglePause: () => void;
};

function buildLines(
  eaTitle: string,
  isPaused: boolean,
  mt5Linked: boolean,
): string[] {
  if (isPaused) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      `${eaTitle} is stopped.`,
      'Press START EA to resume taking trades.',
      'AI ready.',
    ];
  }
  if (!mt5Linked) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      `${eaTitle} is online.`,
      'MetaTrader is not connected yet.',
      'Trading engine standing by.',
      'AI ready.',
    ];
  }
  return [
    'Connecting to Unlimited Bull...',
    'License verified.',
    `${eaTitle} is online.`,
    'Trading engine standing by.',
    'AI ready.',
  ];
}

/** Full circular EA status popup with typed terminal. */
export function EaStatusCard({
  open,
  eaTitle,
  avatarUrl,
  isPaused,
  mt5Linked,
  onClose,
  onTogglePause,
}: Props) {
  const script = useMemo(
    () => buildLines(eaTitle, isPaused, mt5Linked),
    [eaTitle, isPaused, mt5Linked],
  );
  const [display, setDisplay] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setDisplay('');
      setDone(false);
      return;
    }
    let line = 0;
    let char = 0;
    let timer: number | null = null;
    let cancelled = false;
    setDisplay('');
    setDone(false);

    const tick = () => {
      if (cancelled) return;
      if (line >= script.length) {
        setDone(true);
        return;
      }
      const text = script[line];
      char += 1;
      const completed = script.slice(0, line).map((l) => `> ${l}`);
      const partial = `> ${text.slice(0, char)}`;
      setDisplay([...completed, partial].join('\n'));
      if (char >= text.length) {
        line += 1;
        char = 0;
        timer = window.setTimeout(tick, 300);
      } else {
        timer = window.setTimeout(tick, 16 + (char % 6) * 3);
      }
    };
    timer = window.setTimeout(tick, 160);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, script]);

  if (!open) return null;

  return (
    <div
      className="ea-status-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="EA status"
      onClick={onClose}
    >
      <div className="ea-status-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ea-status-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="ea-status-avatar-wrap">
          {!isPaused ? <span className="ea-status-live-ring" aria-hidden /> : null}
          <div className="ea-status-avatar-ring">
            {isMentorProfileImage(avatarUrl) ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span className="ea-status-avatar-empty" aria-hidden>
                {(eaTitle || 'L').slice(0, 1)}
              </span>
            )}
          </div>
        </div>
        <span className={`ea-status-pill${isPaused ? ' off' : ''}`}>
          <span className="ea-status-dot" />
          {isPaused ? 'STOPPED' : 'ACTIVATED'}
        </span>
        <h2 className="ea-status-name">{eaTitle}</h2>
        <button
          type="button"
          className={`ea-status-toggle${isPaused ? ' start' : ''}`}
          onClick={onTogglePause}
        >
          {isPaused ? 'START EA' : 'STOP EA'}
        </button>
        <pre className="ea-status-terminal">
          {display}
          {!done ? <span className="ai-term-cursor" aria-hidden /> : null}
        </pre>
      </div>
    </div>
  );
}

type FloatProps = {
  visible: boolean;
  eaTitle: string;
  avatarUrl: string;
  isPaused: boolean;
  /** When true (e.g. just pressed Start), snap to top of screen. */
  placeAtTop?: boolean;
  onOpen: () => void;
};

const DRAG_THRESHOLD = 8;

/**
 * Persistent LIVE float — drag anywhere; tap (without drag) opens status card.
 * Stays while EA is live; hidden after STOP / pause.
 */
export function EaStatusFloat({
  visible,
  eaTitle,
  avatarUrl,
  isPaused,
  placeAtTop = false,
  onOpen,
}: FloatProps) {
  const [pos, setPos] = useState<EaFloatPos>(() => loadEaFloatPos() || topEaFloatPos());
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onResize = () => setPos((p) => clampEaFloatPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // After Start — snap to top; user can drag anywhere afterward
  useEffect(() => {
    if (!visible || !placeAtTop) return;
    const top = topEaFloatPos();
    setPos(top);
    saveEaFloatPos(top);
  }, [visible, placeAtTop]);

  if (!visible) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setPos(clampEaFloatPos({ x: d.originX + dx, y: d.originY + dy }));
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    drag.current = null;
    setDragging(false);
    if (d.moved) {
      setPos((p) => {
        const next = clampEaFloatPos(p);
        saveEaFloatPos(next);
        return next;
      });
      return;
    }
    onOpen();
  };

  return (
    <button
      type="button"
      className={`ea-float-orb${isPaused ? ' is-paused' : ' is-live'}${
        dragging ? ' is-dragging' : ''
      }`}
      style={{ left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={`${eaTitle} LIVE — drag to move, tap for status`}
      title="Drag to move · Tap for status"
    >
      {!isPaused ? <span className="ea-float-pulse" aria-hidden /> : null}
      <span className="ea-float-orb-face">
        {isMentorProfileImage(avatarUrl) ? (
          <img src={avatarUrl} alt="" draggable={false} />
        ) : (
          <span aria-hidden>{(eaTitle || 'L').slice(0, 1)}</span>
        )}
      </span>
      <span className="ea-float-orb-badge" aria-hidden>
        {isPaused ? 'STOP' : 'LIVE'}
      </span>
    </button>
  );
}
