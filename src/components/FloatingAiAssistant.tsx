import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';

type Props = {
  /** Full blob — split on newlines into terminal lines when `lines` omitted */
  message?: string;
  /** Preferred: terminal lines typed one after another */
  lines?: string[];
  className?: string;
  title?: string;
};

function normalizeLines(message: string | undefined, lines: string[] | undefined) {
  if (lines?.length) return lines;
  if (!message?.trim()) return ['AI ready.'];
  return message
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Floating orb → morphing AI terminal.
 * Accent inherits from CSS variables. Text types character-by-character.
 */
export function FloatingAiAssistant({
  message,
  lines,
  className,
  title = 'Lumo AI',
}: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [display, setDisplay] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState(false);
  const panelId = useId();
  const closeTimer = useRef<number | null>(null);
  const typeGen = useRef(0);

  const script = useMemo(() => normalizeLines(message, lines), [message, lines]);
  const scriptKey = script.join('\n');

  const collapse = () => {
    if (!open || closing) return;
    setClosing(true);
    setSpeaking(false);
    typeGen.current += 1;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setDisplay('');
      setDone(false);
    }, 300);
  };

  const expand = () => {
    if (open) {
      collapse();
      return;
    }
    setDisplay('');
    setDone(false);
    setSpeaking(true);
    setClosing(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  // Typewriter
  useEffect(() => {
    if (!open || closing) return;
    const gen = ++typeGen.current;
    setDisplay('');
    setDone(false);
    setSpeaking(true);

    let line = 0;
    let char = 0;
    let timer: number | null = null;

    const tick = () => {
      if (typeGen.current !== gen) return;
      if (line >= script.length) {
        setSpeaking(false);
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
        timer = window.setTimeout(tick, 320);
      } else {
        timer = window.setTimeout(tick, 18 + (char % 7) * 3);
      }
    };

    timer = window.setTimeout(tick, 180);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open, closing, scriptKey, script]);

  return (
    <div
      className={`ai-orb-root${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div
        className={`ai-term${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
        id={panelId}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="ai-term-glow" aria-hidden />
        <div className="ai-term-chrome">
          <span className={`ai-term-avatar${speaking ? ' is-speaking' : ' is-idle'}`} aria-hidden>
            <Bot size={16} />
          </span>
          <div className="ai-term-meta">
            <strong>{title}</strong>
            <span>{speaking ? 'speaking…' : done ? 'online' : 'boot'}</span>
          </div>
          <button
            type="button"
            className="ai-term-close"
            aria-label="Close assistant"
            onClick={collapse}
          >
            <X size={15} />
          </button>
        </div>
        <pre className="ai-term-body">
          {display}
          {open && !done ? <span className="ai-term-cursor" aria-hidden /> : null}
        </pre>
      </div>

      <button
        type="button"
        className={`ai-orb${open ? ' is-open' : ''}${speaking ? ' is-speaking' : ''}`}
        aria-label={open ? 'Collapse AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={expand}
      >
        <span className="ai-orb-ring" aria-hidden />
        <span className="ai-orb-core" aria-hidden>
          <Bot size={20} />
        </span>
      </button>
    </div>
  );
}
