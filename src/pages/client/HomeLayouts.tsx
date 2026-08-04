import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  Home,
  Monitor,
  Pause,
  Play,
  Plus,
  ScanSearch,
  Settings,
  Signal,
  Trash2,
} from 'lucide-react';
import { BackdropMedia } from '../../components/BackdropMedia';
import type { LayoutId } from '../../lib/interfaceStyle';
import { isMentorProfileImage, type MentorMediaKind } from '../../lib/mentorMedia';

export type LayoutActions = {
  eaTitle: string;
  eaImage: string;
  backdropUrl?: string;
  backdropKind?: MentorMediaKind;
  mainText: string;
  isPaused: boolean;
  accentRgb: string;
  onPauseToggle: () => void;
  onSymbols: () => void;
  onStyle: () => void;
  onDelete: () => void;
  onHomeTap: () => void;
  onMetaTrader: () => void;
  onScanner: () => void;
  /** Deprecated — status popup opens only from the LIVE float. */
  onAvatarTap?: () => void;
};

type ActionDef = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  displayOnly?: boolean;
  danger?: boolean;
};

function resolveBg(a: LayoutActions) {
  const url = a.backdropUrl || a.eaImage || '';
  return {
    url: isMentorProfileImage(url) ? url : '',
    kind: a.backdropKind || 'image',
  };
}

function actionDefs(a: LayoutActions): ActionDef[] {
  return [
    {
      key: 'pause',
      label: a.isPaused ? 'Resume' : 'Pause',
      icon: a.isPaused ? <Play size={18} /> : <Pause size={18} />,
      onClick: a.onPauseToggle,
    },
    {
      key: 'symbols',
      label: 'Symbols',
      icon: <Signal size={18} />,
      onClick: a.onSymbols,
    },
    {
      key: 'connect',
      label: 'Connect',
      icon: <Plus size={18} />,
      displayOnly: true,
    },
    {
      key: 'style',
      label: 'Interface',
      icon: <Settings size={18} />,
      onClick: a.onStyle,
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <Trash2 size={18} />,
      onClick: a.onDelete,
      danger: true,
    },
  ];
}

function LayoutBackdrop({
  url,
  kind,
  accentRgb,
  children,
  className,
}: {
  url: string;
  kind: MentorMediaKind;
  accentRgb: string;
  children: ReactNode;
  className: string;
}) {
  const img = url?.trim() || '';
  const isVideo = kind === 'video' && Boolean(img);
  return (
    <div
      className={`os-layout os-layout-premium ${className}`}
      style={
        {
          '--os-accent-rgb': accentRgb,
          minHeight: '100dvh',
          position: 'relative',
          color: 'var(--text)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          background:
            isVideo || !img
              ? 'radial-gradient(circle at 50% 18%, rgba(var(--os-accent-rgb),0.14), #050608 62%)'
              : undefined,
        } as CSSProperties
      }
    >
      <div className="os-ambient-depth" aria-hidden />
      {!isVideo && img ? (
        <div
          className="os-layout-bg os-hero-breathe"
          style={{ backgroundImage: `url(${img})` }}
          aria-hidden
        />
      ) : null}
      {isVideo ? (
        <BackdropMedia
          src={img}
          kind="video"
          className="lay-bg-media"
          videoClassName="lay-bg-video"
          imageClassName="lay-bg-video"
          washClassName="lay-bg-wash"
        />
      ) : null}
      <div className="os-layout-wash" aria-hidden />
      <div className="os-layout-content os-enter">{children}</div>
    </div>
  );
}

function AvatarButton({
  a,
  className,
}: {
  a: LayoutActions;
  className: string;
}) {
  // Profile picture is display-only — EA status popup opens from LIVE float only.
  return (
    <div className={className} aria-hidden={!isMentorProfileImage(a.eaImage)}>
      {isMentorProfileImage(a.eaImage) ? (
        <img src={a.eaImage} alt="" draggable={false} />
      ) : (
        <span className="os-avatar-empty" aria-hidden>
          {(a.eaTitle || 'L').slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function ActionButton({
  action,
  className,
  iconOnly,
}: {
  action: ActionDef;
  className?: string;
  iconOnly?: boolean;
}) {
  const cls = `os-ctrl ${className || ''}${action.danger ? ' danger' : ''}${iconOnly ? ' os-icon-only' : ''}`;
  if (action.displayOnly) {
    return (
      <div className={`${cls} is-static`} aria-hidden>
        <span className="os-act-ico">{action.icon}</span>
        {!iconOnly ? <span className="os-act-label">{action.label}</span> : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={action.label}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick?.();
      }}
    >
      <span className="os-ripple" aria-hidden />
      <span className="os-act-ico">{action.icon}</span>
      {!iconOnly ? <span className="os-act-label">{action.label}</span> : null}
    </button>
  );
}

function Shell({
  a,
  className,
  children,
}: {
  a: LayoutActions;
  className: string;
  children: ReactNode;
  /** @deprecated Global ClientOsShell owns the dock. */
  dock?: boolean;
  dockClassName?: string;
}) {
  const bg = resolveBg(a);
  return (
    <LayoutBackdrop className={className} url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      {children}
    </LayoutBackdrop>
  );
}

function statusLine(a: LayoutActions) {
  return a.mainText || (a.isPaused ? 'Systems paused' : 'Systems live');
}

/* ── 1 Full Screen Poster ──────────────────────────────────── */
function FullPosterLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-poster" dockClassName="arch-poster-dock">
      <div className="arch-poster-hero">
        <AvatarButton a={a} className="arch-poster-avatar" />
        <div className="arch-poster-fade" aria-hidden />
        <div className="arch-poster-copy">
          <p className="os-kicker">ONLINE</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
      </div>
      <div className="arch-poster-controls">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-poster-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 2 Magazine ────────────────────────────────────────────── */
function MagazineLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-magazine">
      <div className="arch-mag-grid">
        <AvatarButton a={a} className="arch-mag-hero" />
        <div className="arch-mag-masthead">
          <p className="os-kicker">ISSUE 01</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
        <div className="arch-mag-stack">
          {actions.map((act, i) => (
            <ActionButton
              key={act.key}
              action={act}
              className={`arch-mag-btn arch-mag-btn-${i}`}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 3 Bento Grid ──────────────────────────────────────────── */
function BentoLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-bento">
      <div className="arch-bento-grid">
        <AvatarButton a={a} className="arch-bento-hero" />
        <div className="arch-bento-status">
          <p className="os-kicker">STATUS</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`arch-bento-tile arch-bento-t${i}`}
            iconOnly={i !== 0}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 4 Layered ─────────────────────────────────────────────── */
function LayeredLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-layered">
      <div className="arch-layer arch-layer-bg" aria-hidden />
      <div className="arch-layer arch-layer-hero">
        <AvatarButton a={a} className="arch-layer-avatar" />
      </div>
      <div className="arch-layer arch-layer-info">
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-layer arch-layer-controls">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-layer-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 5 Vertical Timeline ───────────────────────────────────── */
function TimelineLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-timeline">
      <div className="arch-tl-spine" aria-hidden />
      <div className="arch-tl-node arch-tl-hero">
        <AvatarButton a={a} className="arch-tl-avatar" />
        <div>
          <p className="os-kicker">ORIGIN</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        </div>
      </div>
      <div className="arch-tl-node arch-tl-status">
        <span className="arch-tl-dot" aria-hidden />
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      {actions.map((act, i) => (
        <div key={act.key} className={`arch-tl-node arch-tl-check arch-tl-c${i}`}>
          <span className="arch-tl-dot" aria-hidden />
          <ActionButton action={act} className="arch-tl-btn" />
        </div>
      ))}
    </Shell>
  );
}

/* ── 6 Offset ──────────────────────────────────────────────── */
function OffsetLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-offset">
      <AvatarButton a={a} className="arch-off-hero" />
      <div className="arch-off-title">
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-off-actions">
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`arch-off-btn arch-off-b${i}`}
            iconOnly
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 7 Sidebar Mobile ──────────────────────────────────────── */
function SidebarLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-sidebar">
      <aside className="arch-side-rail" aria-hidden>
        <span className="arch-side-mark" />
        <span className="arch-side-mark" />
        <span className="arch-side-mark" />
      </aside>
      <div className="arch-side-main">
        <AvatarButton a={a} className="arch-side-hero" />
        <div className="arch-side-meta">
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
        <div className="arch-side-actions">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="arch-side-btn" iconOnly />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 8 Split Canvas ────────────────────────────────────────── */
function SplitCanvasLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-split">
      <div className="arch-split-top">
        <AvatarButton a={a} className="arch-split-avatar" />
      </div>
      <div className="arch-split-bottom">
        <div className="arch-split-head">
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
        <div className="arch-split-actions">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="arch-split-btn" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 9 Hero Overlay ────────────────────────────────────────── */
function HeroOverlayLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-overlay">
      <AvatarButton a={a} className="arch-ov-avatar" />
      <div className="arch-ov-veil" aria-hidden />
      <div className="arch-ov-copy">
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-ov-bar">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-ov-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 10 Dashboard Mosaic ───────────────────────────────────── */
function MosaicLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-mosaic">
      <div className="arch-mos-grid">
        <div className="arch-mos-cell arch-mos-hero">
          <AvatarButton a={a} className="arch-mos-avatar" />
        </div>
        <div className="arch-mos-cell arch-mos-title">
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        </div>
        <div className="arch-mos-cell arch-mos-status">
          <p className="os-sub">{statusLine(a)}</p>
        </div>
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`arch-mos-cell arch-mos-a${i}`}
            iconOnly={i > 1}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 11 Carousel ───────────────────────────────────────────── */
function CarouselLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-carousel" dockClassName="arch-carousel-dock">
      <div className="arch-car-track">
        <section className="arch-car-panel arch-car-hero">
          <AvatarButton a={a} className="arch-car-avatar" />
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
          <p className="arch-car-hint">Swipe →</p>
        </section>
        <section className="arch-car-panel arch-car-controls">
          <p className="os-kicker">CONTROLS</p>
          <div className="arch-car-actions">
            {actions.map((act) => (
              <ActionButton key={act.key} action={act} className="arch-car-btn" />
            ))}
          </div>
        </section>
        <section className="arch-car-panel arch-car-nav">
          <p className="os-kicker">NAVIGATE</p>
          <button type="button" className="arch-car-navbtn os-ctrl" onClick={a.onHomeTap}>
            <Home size={22} />
            <span>Home</span>
          </button>
          <button type="button" className="arch-car-navbtn os-ctrl" onClick={a.onScanner}>
            <ScanSearch size={22} />
            <span>Scanner</span>
          </button>
          <button type="button" className="arch-car-navbtn os-ctrl" onClick={a.onMetaTrader}>
            <Monitor size={22} />
            <span>MetaTrader</span>
          </button>
        </section>
      </div>
    </Shell>
  );
}

/* ── 12 Floating Windows ───────────────────────────────────── */
function FloatingWindowsLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-windows">
      <div className="arch-win arch-win-hero">
        <div className="arch-win-chrome">
          <span />
          <span />
          <span />
        </div>
        <AvatarButton a={a} className="arch-win-avatar" />
      </div>
      <div className="arch-win arch-win-info">
        <div className="arch-win-chrome">
          <span />
          <span />
          <span />
        </div>
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-win arch-win-controls">
        <div className="arch-win-chrome">
          <span />
          <span />
          <span />
        </div>
        <div className="arch-win-actions">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="arch-win-btn" iconOnly />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 13 Folded ─────────────────────────────────────────────── */
function FoldedLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-folded">
      <div className="arch-fold arch-fold-a">
        <AvatarButton a={a} className="arch-fold-avatar" />
      </div>
      <div className="arch-fold arch-fold-b">
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-fold arch-fold-c">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-fold-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 14 Edge ───────────────────────────────────────────────── */
function EdgeLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-edge">
      <AvatarButton a={a} className="arch-edge-hero" />
      <div className="arch-edge-title">
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{statusLine(a)}</p>
      </div>
      <div className="arch-edge-left">
        {actions.slice(0, 2).map((act) => (
          <ActionButton key={act.key} action={act} className="arch-edge-btn" iconOnly />
        ))}
      </div>
      <div className="arch-edge-right">
        {actions.slice(2).map((act) => (
          <ActionButton key={act.key} action={act} className="arch-edge-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 15 Swiss Minimal ──────────────────────────────────────── */
function SwissLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-swiss">
      <p className="arch-swiss-index">01</p>
      <h1 className="arch-swiss-title">{a.eaTitle || 'LUMO EDGE'}</h1>
      <AvatarButton a={a} className="arch-swiss-avatar" />
      <p className="os-sub arch-swiss-status">{statusLine(a)}</p>
      <div className="arch-swiss-row">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-swiss-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 16 Control Rail ───────────────────────────────────────── */
function RailLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-rail">
      <div className="arch-rail-hero">
        <AvatarButton a={a} className="arch-rail-avatar" />
        <div className="arch-rail-copy">
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{statusLine(a)}</p>
        </div>
      </div>
      <div className="arch-rail-bar">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-rail-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 17 Editorial Strip ────────────────────────────────────── */
function EditorialLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-editorial">
      <p className="arch-ed-eyebrow">PRODUCT</p>
      <h1 className="arch-ed-display">{a.eaTitle || 'LUMO EDGE'}</h1>
      <div className="arch-ed-band">
        <AvatarButton a={a} className="arch-ed-avatar" />
      </div>
      <p className="arch-ed-lede">{statusLine(a)}</p>
      <div className="arch-ed-actions">
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`arch-ed-btn arch-ed-b${i}`}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 18 Glyph Sparse ───────────────────────────────────────── */
function GlyphLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-glyph">
      <AvatarButton a={a} className="arch-glyph-avatar" />
      <h1 className="arch-glyph-title">{a.eaTitle || 'LUMO EDGE'}</h1>
      <p className="arch-glyph-status">{statusLine(a)}</p>
      <div className="arch-glyph-grid">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-glyph-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 19 Spatial Deck ───────────────────────────────────────── */
function SpatialLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onDown = (e: ReactPointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, [role="button"]')) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x) * 0.35,
      y: drag.current.oy + (e.clientY - drag.current.y) * 0.35,
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <Shell a={a} className="arch-spatial">
      <div
        className="arch-spatial-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="arch-spatial-deck"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
        >
          <div className="arch-spatial-card arch-spatial-hero">
            <AvatarButton a={a} className="arch-spatial-avatar" />
          </div>
          <div className="arch-spatial-card arch-spatial-info">
            <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
            <p className="os-sub">{statusLine(a)}</p>
          </div>
        </div>
      </div>
      <div className="arch-spatial-tray">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="arch-spatial-btn" iconOnly />
        ))}
      </div>
    </Shell>
  );
}

/* ── 20 Console Mosaic ─────────────────────────────────────── */
function ConsoleLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="arch-console">
      <header className="arch-con-header">
        <span className="arch-con-dot" aria-hidden />
        <span>SYS // {a.eaTitle || 'LUMO EDGE'}</span>
        <span className="arch-con-state">{a.isPaused ? 'PAUSED' : 'LIVE'}</span>
      </header>
      <div className="arch-con-board">
        <AvatarButton a={a} className="arch-con-avatar" />
        <div className="arch-con-log">
          <p>&gt; boot sequence ok</p>
          <p>&gt; {statusLine(a)}</p>
          <p>&gt; awaiting command_</p>
        </div>
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`arch-con-key arch-con-k${i}`}
          />
        ))}
      </div>
    </Shell>
  );
}

const LAYOUT_MAP: Record<LayoutId, (a: LayoutActions) => ReactNode> = {
  'full-poster': FullPosterLayout,
  magazine: MagazineLayout,
  bento: BentoLayout,
  layered: LayeredLayout,
  timeline: TimelineLayout,
  offset: OffsetLayout,
  sidebar: SidebarLayout,
  'split-canvas': SplitCanvasLayout,
  'hero-overlay': HeroOverlayLayout,
  mosaic: MosaicLayout,
  carousel: CarouselLayout,
  'floating-windows': FloatingWindowsLayout,
  folded: FoldedLayout,
  edge: EdgeLayout,
  swiss: SwissLayout,
  rail: RailLayout,
  editorial: EditorialLayout,
  glyph: GlyphLayout,
  spatial: SpatialLayout,
  console: ConsoleLayout,
};

/** Renders one of the 20 architecture layouts — same actions, different composition. */
export function OsHomeLayout({
  layout,
  ...actions
}: LayoutActions & { layout: LayoutId }) {
  const Comp = LAYOUT_MAP[layout] || FullPosterLayout;
  return <>{Comp(actions)}</>;
}

export const FocusLayout = LayeredLayout;
export const TerminalLayout = ConsoleLayout;
export const VortexLayout = BentoLayout;
