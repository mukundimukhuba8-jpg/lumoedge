import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { defaultForexBootLines, isForexQuestion, lumoForexReply } from '../lib/forexAi';

type Props = {
  message?: string;
  lines?: string[];
  className?: string;
  title?: string;
  eaName?: string;
  isPaused?: boolean;
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
 * Forex / trading questions only — refuses people topics.
 */
export function FloatingAiAssistant({
  message,
  lines,
  className,
  title = 'Lumo AI',
  eaName = 'Lumo Edge',
  isPaused = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [display, setDisplay] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState(false);
  const [input, setInput] = useState('');
  const [script, setScript] = useState<string[]>([]);
  const panelId = useId();
  const closeTimer = useRef<number | null>(null);
  const typeGen = useRef(0);

  const bootLines = useMemo(
    () => lines?.length ? lines : message ? normalizeLines(message, undefined) : defaultForexBootLines(eaName, isPaused),
    [lines, message, eaName, isPaused],
  );

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
      setInput('');
      setScript([]);
    }, 300);
  };

  const expand = () => {
    if (open) {
      collapse();
      return;
    }
    setScript(bootLines);
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

  useEffect(() => {
    if (!open || closing || !script.length) return;
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
        timer = window.setTimeout(tick, 300);
      } else {
        timer = window.setTimeout(tick, 18 + (char % 7) * 3);
      }
    };

    timer = window.setTimeout(tick, 160);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open, closing, script]);

  const ask = () => {
    const q = input.trim();
    if (!q || speaking) return;
    setInput('');
    const reply = lumoForexReply(q);
    const prefix = isForexQuestion(q)
      ? [`You: ${q}`, reply]
      : [`You: ${q}`, reply];
    setScript(prefix);
  };

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
        // Prevent invisible closed panel from eating Start / Scanner taps on iOS
        inert={!open || closing ? true : undefined}
      >
        <div className="ai-term-glow" aria-hidden />
        <div className="ai-term-chrome">
          <span className={`ai-term-avatar${speaking ? ' is-speaking' : ' is-idle'}`} aria-hidden>
            <Bot size={16} />
          </span>
          <div className="ai-term-meta">
            <strong>{title}</strong>
            <span>{speaking ? 'speaking…' : done ? 'forex online' : 'boot'}</span>
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
        {open && done ? (
          <form
            className="ai-term-ask"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a forex question…"
              aria-label="Ask forex question"
            />
            <button type="submit" aria-label="Send" disabled={!input.trim()}>
              <Send size={14} />
            </button>
          </form>
        ) : null}
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
