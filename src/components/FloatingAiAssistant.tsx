import { useEffect, useId, useState } from 'react';
import { Bot, X } from 'lucide-react';

type Props = {
  message: string;
  className?: string;
  /** Optional compact label shown when expanded */
  title?: string;
};

/**
 * Compact glowing orb by default. Tap expands a small assistant sheet;
 * close collapses back to the orb. Same info as before — presentation only.
 */
export function FloatingAiAssistant({
  message,
  className,
  title = 'Lumo AI',
}: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`ai-orb-root${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div
        className={`ai-orb-panel${open ? ' is-open' : ''}`}
        id={panelId}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="ai-orb-panel-head">
          <span className="ai-orb-panel-icon" aria-hidden>
            <Bot size={16} />
          </span>
          <strong>{title}</strong>
          <button
            type="button"
            className="ai-orb-close"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
        <p className="ai-orb-panel-body">{message}</p>
      </div>

      <button
        type="button"
        className={`ai-orb${open ? ' is-open' : ''}`}
        aria-label={open ? 'Collapse AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ai-orb-ring" aria-hidden />
        <span className="ai-orb-core" aria-hidden>
          <Bot size={20} />
        </span>
      </button>
    </div>
  );
}
