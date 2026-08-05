import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  Activity,
  BadgeCheck,
  Bot,
  CandlestickChart,
  Layers,
  Palette,
  Pause,
  Play,
  Plus,
  Power,
  Settings,
  Signal,
  Trash2,
  UserRound,
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
  onStyle: (view?: 'hub' | 'themes' | 'layouts' | 'colours' | 'fonts' | 'effects' | 'custom' | 'settings') => void;
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
  primary?: boolean;
};

function resolveBg(a: LayoutActions) {
  const url = a.backdropUrl || a.eaImage || '';
  return {
    url: isMentorProfileImage(url) ? url : '',
    kind: a.backdropKind || 'image',
  };
}

function brandName(a: LayoutActions) {
  return a.eaTitle?.trim() || 'Lumo Edge';
}

function statusLine(a: LayoutActions) {
  return a.mainText || (a.isPaused ? 'Systems paused' : 'Awaiting signals…');
}

function coreActions(a: LayoutActions) {
  const start: ActionDef = {
    key: 'start',
    label: a.isPaused ? 'START' : 'STOP',
    icon: a.isPaused ? <Play size={22} /> : <Pause size={22} />,
    onClick: a.onPauseToggle,
    primary: true,
  };
  const remove: ActionDef = {
    key: 'remove',
    label: 'Remove',
    icon: <Trash2 size={16} />,
    onClick: a.onDelete,
    danger: true,
  };
  const symbols: ActionDef = {
    key: 'symbols',
    label: 'Symbols',
    icon: <Signal size={16} />,
    onClick: a.onSymbols,
  };
  const settings: ActionDef = {
    key: 'settings',
    label: 'Settings',
    icon: <Settings size={16} />,
    onClick: a.onStyle,
  };
  return { start, remove, symbols, settings };
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
          minHeight: '100%',
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
        <div className="os-layout-bg" style={{ backgroundImage: `url(${img})` }} aria-hidden />
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

function SettingsBar({ a }: { a: LayoutActions }) {
  return (
    <div className="lay-settings-bar" role="toolbar" aria-label="Interface settings">
      <button type="button" className="lay-settings-chip" onClick={() => a.onStyle('themes')}>
        <Palette size={14} />
        <span>Themes</span>
      </button>
      <button type="button" className="lay-settings-chip" onClick={() => a.onStyle('layouts')}>
        <Layers size={14} />
        <span>Layouts</span>
      </button>
      <button type="button" className="lay-settings-chip is-main" onClick={() => a.onStyle('hub')}>
        <Settings size={14} />
        <span>Settings</span>
      </button>
    </div>
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
}) {
  const bg = resolveBg(a);
  return (
    <LayoutBackdrop className={className} url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      <SettingsBar a={a} />
      {children}
    </LayoutBackdrop>
  );
}

function AvatarButton({
  a,
  className,
  ring,
}: {
  a: LayoutActions;
  className: string;
  ring?: boolean;
}) {
  return (
    <div className={`${className}${ring ? ' lay-avatar-ring' : ''}`} aria-hidden={!isMentorProfileImage(a.eaImage)}>
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
  const cls = `os-ctrl ${className || ''}${action.danger ? ' danger' : ''}${
    action.primary ? ' is-primary' : ''
  }${iconOnly ? ' os-icon-only' : ''}`;
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
      <span className="os-act-ico">{action.icon}</span>
      {!iconOnly ? <span className="os-act-label">{action.label}</span> : null}
    </button>
  );
}

function PowerBadge({ a }: { a: LayoutActions }) {
  return (
    <span className={`lay-power-badge${a.isPaused ? ' is-paused' : ''}`}>
      {a.isPaused ? 'PAUSED' : 'POWERED BY LUMO'}
    </span>
  );
}

function BrandBlock({
  a,
  tagline = 'Your trading ally',
  className,
  align = 'center',
}: {
  a: LayoutActions;
  tagline?: string;
  className?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={`lay-brand ${align === 'left' ? 'is-left' : ''} ${className || ''}`}>
      {tagline ? <p className="lay-brand-tag">{tagline}</p> : null}
      <h1 className="lay-brand-title">
        {brandName(a)}
        <BadgeCheck size={16} className="lay-brand-check" aria-hidden />
      </h1>
      <div className="lay-brand-meta">
        <PowerBadge a={a} />
        <span className={`lay-status-line${a.isPaused ? ' is-paused' : ''}`}>{statusLine(a)}</span>
      </div>
    </div>
  );
}

function StatusChips({ a }: { a: LayoutActions }) {
  return (
    <div className="lay-status-chips" aria-label="System status">
      <span className="lay-chip">
        <UserRound size={13} />
        Mentor
      </span>
      <span className="lay-chip">
        <Bot size={13} />
        Bot
      </span>
      <span className={`lay-chip${a.isPaused ? ' is-paused' : ' is-live'}`}>
        <Activity size={13} />
        {a.isPaused ? 'Paused' : 'Live'}
      </span>
    </div>
  );
}

function RobotsStrip({
  a,
  className,
  label = 'Robots List',
  connectLabel = 'Connect new EA',
}: {
  a: LayoutActions;
  className?: string;
  label?: string;
  connectLabel?: string;
}) {
  return (
    <div className={`lay-robots ${className || ''}`} aria-label={label}>
      <div className="lay-robots-label">{label}</div>
      <div className="lay-robots-track">
        <button type="button" className="lay-robot-card" onClick={a.onHomeTap}>
          <AvatarButton a={a} className="lay-robot-avatar" />
          <div className="lay-robot-meta">
            <strong>{brandName(a)}</strong>
            <span>{statusLine(a)}</span>
          </div>
        </button>
        <button type="button" className="lay-robot-card lay-robot-thumb" onClick={() => a.onStyle()} aria-label={brandName(a)}>
          <AvatarButton a={a} className="lay-robot-avatar" />
        </button>
        <button type="button" className="lay-robot-card lay-robot-connect" onClick={() => a.onStyle()}>
          <span className="lay-robot-gear">
            <Plus size={18} />
          </span>
          <div className="lay-robot-meta">
            <strong>{connectLabel}</strong>
            <span>Themes & layouts</span>
          </div>
        </button>
        <button type="button" className="lay-robot-card lay-robot-settings" onClick={() => a.onStyle()}>
          <span className="lay-robot-gear">
            <Settings size={18} />
          </span>
          <div className="lay-robot-meta">
            <strong>Settings</strong>
            <span>Change layout & theme</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function StartCircle({ a, className }: { a: LayoutActions; className?: string }) {
  const { start } = coreActions(a);
  return (
    <button
      type="button"
      className={`lay-start-circle ${className || ''}${a.isPaused ? ' is-paused' : ' is-live'}`}
      aria-label={start.label}
      onClick={(e) => {
        e.stopPropagation();
        a.onPauseToggle();
      }}
    >
      <span className="lay-start-ring" aria-hidden />
      <span className="lay-start-ico">{a.isPaused ? <Power size={28} /> : start.icon}</span>
      <span className="lay-start-label">{start.label}</span>
    </button>
  );
}

function Pill({ action, className }: { action: ActionDef; className?: string }) {
  return <ActionButton action={action} className={`lay-pill ${className || ''}`} />;
}

function SquareTile({ action, className }: { action: ActionDef; className?: string }) {
  return <ActionButton action={action} className={`lay-square-tile ${className || ''}`} />;
}

/* ── 1 Hero ─────────────────────────────────────────────────── */
function HeroLayout(a: LayoutActions) {
  const { remove, symbols } = coreActions(a);
  const touchY = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.dockReveal = '';
    return () => {
      delete document.documentElement.dataset.dockReveal;
    };
  }, []);

  const onTouchStart = (e: ReactTouchEvent) => {
    touchY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchY.current;
    touchY.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientY;
    if (end == null) return;
    if (start - end > 48 && start > window.innerHeight * 0.55) {
      document.documentElement.dataset.dockReveal = '1';
    }
    if (end - start > 48) {
      document.documentElement.dataset.dockReveal = '';
    }
  };

  return (
    <Shell a={a} className="lay-hero">
      <div
        className="lay-hero-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={a.onHomeTap}
      >
        <div className="lay-hero-top">
          <AvatarButton a={a} className="lay-hero-avatar" ring />
          <BrandBlock a={a} tagline="Now trading with" className="lay-hero-brand" />
        </div>
        <div className="lay-hero-controls">
          <Pill action={remove} className="lay-hero-pill" />
          <StartCircle a={a} />
          <Pill action={symbols} className="lay-hero-pill" />
        </div>
        <RobotsStrip a={a} className="lay-hero-robots" label="Connect robot" />
        <p className="lay-hero-hint">Swipe up for menu</p>
      </div>
    </Shell>
  );
}

/* ── 2 Split ────────────────────────────────────────────────── */
function SplitLayout(a: LayoutActions) {
  const { start, remove, symbols } = coreActions(a);
  return (
    <Shell a={a} className="lay-split">
      <aside className="lay-split-rail">
        <AvatarButton a={a} className="lay-split-avatar" ring />
        <div className="lay-split-stack">
          <ActionButton action={remove} className="lay-split-btn" />
          <ActionButton action={start} className="lay-split-btn is-start" />
          <ActionButton action={symbols} className="lay-split-btn" />
        </div>
        <RobotsStrip a={a} className="lay-split-robots" />
      </aside>
      <section className="lay-split-hero">
        <AvatarButton a={a} className="lay-split-hero-media" />
        <div className="lay-split-copy">
          <BrandBlock a={a} tagline="Connected with" align="left" />
          <StatusChips a={a} />
        </div>
      </section>
    </Shell>
  );
}

/* ── 3 Dominant ─────────────────────────────────────────────── */
function DominantLayout(a: LayoutActions) {
  const { start, remove, symbols } = coreActions(a);
  return (
    <Shell a={a} className="lay-dominant">
      <div className="lay-dom-hero">
        <AvatarButton a={a} className="lay-dom-float-avatar" ring />
      </div>
      <div className="lay-dom-sheet">
        <div className="lay-dom-sheet-handle" aria-hidden />
        <BrandBlock a={a} tagline="The future of AI" align="left" className="lay-dom-brand" />
        <ActionButton action={start} className="lay-dom-start" />
        <div className="lay-dom-pills">
          <Pill action={remove} />
          <Pill action={symbols} />
        </div>
        <RobotsStrip a={a} className="lay-dom-robots" label="Connect robot" />
      </div>
    </Shell>
  );
}

/* ── 4 Vertical ─────────────────────────────────────────────── */
function VerticalLayout(a: LayoutActions) {
  const { remove, symbols, settings, start } = coreActions(a);
  const list: ActionDef = {
    key: 'list',
    label: 'List',
    icon: <Bot size={18} />,
    onClick: a.onStyle,
  };
  const signals: ActionDef = {
    key: 'signals',
    label: 'Signals',
    icon: <CandlestickChart size={18} />,
    onClick: a.onScanner,
  };
  return (
    <Shell a={a} className="lay-vertical">
      <div className="lay-vert-scroll">
        <div className="lay-vert-banner">
          <AvatarButton a={a} className="lay-vert-banner-media" />
        </div>
        <BrandBlock a={a} tagline="Your trading ally" className="lay-vert-brand" />
        <div className="lay-vert-start-row">
          <StartCircle a={a} />
        </div>
        <div className="lay-vert-trio">
          <SquareTile action={remove} />
          <SquareTile action={{ ...start, icon: a.isPaused ? <Play size={18} /> : <Pause size={18} /> }} />
          <SquareTile action={symbols} />
        </div>
        <div className="lay-vert-trio lay-vert-trio-soft">
          <SquareTile action={signals} />
          <SquareTile action={list} />
          <SquareTile
            action={{
              key: 'history',
              label: 'MT5',
              icon: <Activity size={18} />,
              onClick: a.onMetaTrader,
            }}
          />
        </div>
        <div className="lay-vert-robots">
          <div className="lay-robots-label">Robots List</div>
          <button type="button" className="lay-vert-robot" onClick={a.onHomeTap}>
            <AvatarButton a={a} className="lay-vert-robot-avatar" ring />
            <div>
              <strong>{brandName(a)}</strong>
              <span>{statusLine(a)}</span>
            </div>
          </button>
          <button type="button" className="lay-vert-robot lay-vert-connect" onClick={() => a.onStyle()}>
            <span className="lay-vert-plus">
              <Plus size={20} />
            </span>
            <div>
              <strong>Connect new EA</strong>
              <span>Buy bots & layouts</span>
            </div>
          </button>
        </div>
        <ActionButton action={settings} className="lay-vert-settings" />
      </div>
    </Shell>
  );
}

/* ── 5 Desktop (draggable windows) ──────────────────────────── */
function DragWin({
  title,
  className,
  children,
  defaultPos,
}: {
  title: string;
  className: string;
  children: ReactNode;
  defaultPos: { x: number; y: number };
}) {
  const [pos, setPos] = useState(defaultPos);
  const drag = useRef<{ ox: number; oy: number; x: number; y: number } | null>(null);

  const onDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { ox: e.clientX, oy: e.clientY, x: pos.x, y: pos.y };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.x + (e.clientX - drag.current.ox),
      y: drag.current.y + (e.clientY - drag.current.oy),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div
      className={`lay-desk-win ${className}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
    >
      <div
        className="lay-desk-titlebar"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span>{title}</span>
      </div>
      <div className="lay-desk-body">{children}</div>
    </div>
  );
}

function DesktopLayout(a: LayoutActions) {
  const { start, remove, symbols, settings } = coreActions(a);
  return (
    <Shell a={a} className="lay-desktop">
      <DragWin title={brandName(a)} className="lay-desk-main" defaultPos={{ x: 0, y: 0 }}>
        <AvatarButton a={a} className="lay-desk-hero" ring />
        <BrandBlock a={a} tagline="The future of AI" />
        <StatusChips a={a} />
      </DragWin>
      <DragWin title="Controls" className="lay-desk-controls" defaultPos={{ x: 18, y: 12 }}>
        <ActionButton action={start} className="lay-desk-btn" />
        <ActionButton action={remove} className="lay-desk-btn" />
        <ActionButton action={symbols} className="lay-desk-btn" />
      </DragWin>
      <DragWin title="Robots List" className="lay-desk-robots" defaultPos={{ x: 0, y: 0 }}>
        <RobotsStrip a={a} label="Connect robot" />
      </DragWin>
      <DragWin title="Settings" className="lay-desk-gear" defaultPos={{ x: 0, y: 0 }}>
        <ActionButton action={settings} className="lay-desk-gear-btn" iconOnly />
      </DragWin>
    </Shell>
  );
}

/* ── 6 Rail ─────────────────────────────────────────────────── */
function RailLayout(a: LayoutActions) {
  const { start, remove, symbols, settings } = coreActions(a);
  const [showRobots, setShowRobots] = useState(false);
  return (
    <Shell a={a} className="lay-rail">
      <aside className="lay-rail-bar">
        <AvatarButton a={a} className="lay-rail-thumb" ring />
        <ActionButton action={start} className="lay-rail-ico" iconOnly />
        <ActionButton action={remove} className="lay-rail-ico" iconOnly />
        <ActionButton action={symbols} className="lay-rail-ico" iconOnly />
        <ActionButton action={settings} className="lay-rail-ico" iconOnly />
        <button
          type="button"
          className="os-ctrl lay-rail-ico"
          aria-label="Robots list"
          onClick={() => setShowRobots((v) => !v)}
        >
          <span className="os-act-ico">
            <Bot size={18} />
          </span>
        </button>
      </aside>
      <section className="lay-rail-canvas">
        <AvatarButton a={a} className="lay-rail-hero" />
        <div className="lay-rail-copy">
          <BrandBlock a={a} tagline="Your trading ally" align="left" />
          <StatusChips a={a} />
        </div>
        <div className={`lay-rail-robots-sheet${showRobots ? ' is-open' : ''}`}>
          <RobotsStrip a={a} label="Connect robot" />
        </div>
      </section>
    </Shell>
  );
}

/* ── 7 Connect (ref: circular Start + Connect Robot) ────────── */
function ConnectLayout(a: LayoutActions) {
  const { remove, symbols } = coreActions(a);
  return (
    <Shell a={a} className="lay-connect">
      <div className="lay-connect-stage" onClick={a.onHomeTap}>
        <AvatarButton a={a} className="lay-connect-avatar" ring />
        <BrandBlock a={a} tagline="Mentor linked" />
        <div className="lay-connect-controls">
          <Pill action={remove} />
          <StartCircle a={a} />
          <Pill action={symbols} />
        </div>
        <RobotsStrip a={a} className="lay-connect-robots" label="Connect robot" />
      </div>
    </Shell>
  );
}

/* ── 8 Pills (ref: three equal pills) ───────────────────────── */
function PillsLayout(a: LayoutActions) {
  const { start, remove, symbols } = coreActions(a);
  return (
    <Shell a={a} className="lay-pills">
      <div className="lay-pills-stage">
        <AvatarButton a={a} className="lay-pills-avatar" ring />
        <BrandBlock a={a} tagline="Official verified" />
        <div className="lay-pills-row">
          <Pill action={remove} className="lay-pills-equal" />
          <Pill action={start} className="lay-pills-equal is-primary" />
          <Pill action={symbols} className="lay-pills-equal" />
        </div>
        <RobotsStrip a={a} className="lay-pills-robots" label="Robots List" />
      </div>
    </Shell>
  );
}

/* ── 9 Tiles (ref: Signals / List / History) ────────────────── */
function TilesLayout(a: LayoutActions) {
  const { settings } = coreActions(a);
  const signals: ActionDef = {
    key: 'signals',
    label: 'Signals',
    icon: <CandlestickChart size={20} />,
    onClick: a.onScanner,
  };
  const list: ActionDef = {
    key: 'list',
    label: 'List',
    icon: <Bot size={20} />,
    onClick: a.onStyle,
  };
  const history: ActionDef = {
    key: 'history',
    label: 'History',
    icon: <Activity size={20} />,
    onClick: a.onMetaTrader,
  };
  return (
    <Shell a={a} className="lay-tiles">
      <div className="lay-tiles-stage">
        <div className="lay-tiles-hero">
          <AvatarButton a={a} className="lay-tiles-media" />
        </div>
        <BrandBlock a={a} tagline="" />
        <p className={`lay-status-line lay-tiles-status${a.isPaused ? ' is-paused' : ''}`}>
          {statusLine(a)}
        </p>
        <div className="lay-tiles-row">
          <SquareTile action={signals} />
          <SquareTile action={list} />
          <SquareTile action={history} />
        </div>
        <div className="lay-tiles-start">
          <StartCircle a={a} />
        </div>
        <ActionButton action={settings} className="lay-tiles-settings" />
      </div>
    </Shell>
  );
}

/* ── 10 Orbit (ref: glow circle + mentor chips) ─────────────── */
function OrbitLayout(a: LayoutActions) {
  return (
    <Shell a={a} className="lay-orbit">
      <div className="lay-orbit-stage">
        <div className="lay-orbit-head">
          <AvatarButton a={a} className="lay-orbit-mini" />
          <strong>{brandName(a)}</strong>
        </div>
        <AvatarButton a={a} className="lay-orbit-avatar" ring />
        <BrandBlock a={a} tagline="The future of AI" />
        <StatusChips a={a} />
        <div className="lay-orbit-list">
          <div className="lay-robots-label">Mentor List</div>
          <button type="button" className="lay-orbit-card" onClick={a.onHomeTap}>
            <AvatarButton a={a} className="lay-orbit-card-avatar" ring />
            <strong>{brandName(a)}</strong>
          </button>
          <button type="button" className="lay-orbit-card is-connect" onClick={() => a.onStyle()}>
            <span className="lay-orbit-plus">
              <Plus size={18} />
            </span>
            <div>
              <strong>Connect new EA</strong>
              <span>Buy bots from market</span>
            </div>
          </button>
        </div>
        <div className="lay-orbit-actions">
          <StartCircle a={a} className="lay-orbit-start" />
        </div>
      </div>
    </Shell>
  );
}

/* ── 11 Stack (ref: left stack + right robots) ──────────────── */
function StackLayout(a: LayoutActions) {
  const { start, remove, symbols } = coreActions(a);
  return (
    <Shell a={a} className="lay-stack">
      <div className="lay-stack-stage">
        <AvatarButton a={a} className="lay-stack-avatar" ring />
        <BrandBlock a={a} tagline="Now trading with" />
        <span className={`lay-stack-link${a.isPaused ? ' is-paused' : ''}`}>
          {a.isPaused ? 'Paused' : 'Connected'} · View more
        </span>
        <div className="lay-stack-body">
          <div className="lay-stack-actions">
            <Pill action={remove} className="lay-stack-pill" />
            <Pill action={start} className="lay-stack-pill is-primary" />
            <Pill action={symbols} className="lay-stack-pill" />
          </div>
          <div className="lay-stack-robots">
            <div className="lay-robots-label">Robots List</div>
            <button type="button" className="lay-stack-robot" onClick={a.onHomeTap}>
              <AvatarButton a={a} className="lay-stack-robot-avatar" ring />
              <strong>{brandName(a)}</strong>
            </button>
            <button type="button" className="lay-stack-robot is-connect" onClick={() => a.onStyle()}>
              <Plus size={16} />
              <strong>New</strong>
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ── 12 Frame (ref: framed square + equal squares) ──────────── */
function FrameLayout(a: LayoutActions) {
  const { start, remove, symbols, settings } = coreActions(a);
  return (
    <Shell a={a} className="lay-frame">
      <div className="lay-frame-stage">
        <AvatarButton a={a} className="lay-frame-avatar" ring />
        <BrandBlock a={a} tagline="Your trading ally" />
        <div className="lay-frame-row">
          <SquareTile action={remove} />
          <SquareTile
            action={{
              ...start,
              icon: a.isPaused ? <Play size={20} /> : <Pause size={20} />,
            }}
          />
          <SquareTile action={symbols} />
        </div>
        <div className="lay-frame-robots">
          <div className="lay-robots-label">Robots List</div>
          <button type="button" className="lay-frame-robot" onClick={a.onHomeTap}>
            <strong>{brandName(a)}</strong>
          </button>
          <ActionButton action={settings} className="lay-frame-settings" />
        </div>
      </div>
    </Shell>
  );
}

const LAYOUT_MAP: Record<LayoutId, ComponentType<LayoutActions>> = {
  hero: HeroLayout,
  split: SplitLayout,
  dominant: DominantLayout,
  vertical: VerticalLayout,
  desktop: DesktopLayout,
  rail: RailLayout,
  connect: ConnectLayout,
  pills: PillsLayout,
  tiles: TilesLayout,
  orbit: OrbitLayout,
  stack: StackLayout,
  frame: FrameLayout,
};

/** Renders the selected home composition. */
export function OsHomeLayout({
  layout,
  ...actions
}: LayoutActions & { layout: LayoutId }) {
  const Comp = LAYOUT_MAP[layout] ?? HeroLayout;
  return <Comp {...actions} />;
}
