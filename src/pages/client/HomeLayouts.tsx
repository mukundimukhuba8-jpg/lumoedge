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
  onAvatarTap: () => void;
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
              ? 'radial-gradient(circle at 50% 18%, rgba(var(--os-accent-rgb),0.2), #03050a 58%)'
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
      <div className="os-holo-scan" aria-hidden />
      <div className="os-scanlines" aria-hidden />
      <div className="os-particles" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="os-layout-content os-enter">{children}</div>
    </div>
  );
}

function LayoutDock({
  onHome,
  onScanner,
  onMetaTrader,
}: {
  onHome: () => void;
  onScanner: () => void;
  onMetaTrader: () => void;
}) {
  return (
    <nav className="lay-dock os-dock os-dock-vision" aria-label="Primary">
      <button type="button" className="lay-dock-item active os-ctrl" onClick={onHome}>
        <Home size={22} />
        <span>Home</span>
      </button>
      <button type="button" className="lay-dock-item os-ctrl" onClick={onScanner}>
        <ScanSearch size={22} />
        <span>Scanner</span>
      </button>
      <button type="button" className="lay-dock-item os-ctrl" onClick={onMetaTrader}>
        <Monitor size={22} />
        <span>MetaTrader</span>
      </button>
    </nav>
  );
}

function AvatarButton({
  a,
  className,
}: {
  a: LayoutActions;
  className: string;
}) {
  return (
    <button type="button" className={className} onClick={a.onAvatarTap} aria-label="EA profile">
      {isMentorProfileImage(a.eaImage) ? (
        <img src={a.eaImage} alt="" />
      ) : (
        <span className="os-avatar-empty" aria-hidden>
          {(a.eaTitle || 'L').slice(0, 1)}
        </span>
      )}
    </button>
  );
}

function ActionButton({
  action,
  className,
}: {
  action: ActionDef;
  className?: string;
}) {
  if (action.displayOnly) {
    return (
      <div
        className={`os-ctrl ${className || ''} is-static${action.danger ? ' danger' : ''}`}
        aria-hidden
      >
        <span className="os-act-ico">{action.icon}</span>
        <span className="os-act-label">{action.label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`os-ctrl ${className || ''}${action.danger ? ' danger' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        action.onClick?.();
      }}
    >
      <span className="os-ripple" aria-hidden />
      <span className="os-act-ico">{action.icon}</span>
      <span className="os-act-label">{action.label}</span>
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
}) {
  const bg = resolveBg(a);
  return (
    <LayoutBackdrop className={className} url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      {children}
      <LayoutDock
        onHome={a.onHomeTap}
        onScanner={a.onScanner}
        onMetaTrader={a.onMetaTrader}
      />
    </LayoutBackdrop>
  );
}

/* ── 1 AI Core ─────────────────────────────────────────────── */
function AiCoreLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-ai-core">
      <div className="os-core-stage">
        <div className="os-core-rings" aria-hidden />
        <AvatarButton a={a} className="os-core-avatar" />
        <div className="os-core-title">
          <p className="os-kicker">AI CORE ONLINE</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p className="os-sub">{a.mainText || (a.isPaused ? 'Systems paused' : 'Systems live')}</p>
        </div>
        <div className="os-core-orbit">
          {actions.map((act, i) => (
            <ActionButton
              key={act.key}
              action={act}
              className={`os-orbit-node os-orbit-${i}`}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 2 Orbital ─────────────────────────────────────────────── */
function OrbitalLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-orbital">
      <div className="os-orbital-stage">
        <AvatarButton a={a} className="os-orbital-avatar" />
        <h1 className="os-orbital-title">{a.eaTitle || 'LUMO EDGE'}</h1>
        <div className="os-ring os-ring-a">
          {actions.slice(0, 3).map((act) => (
            <ActionButton key={act.key} action={act} className="os-ring-btn" />
          ))}
        </div>
        <div className="os-ring os-ring-b">
          {actions.slice(3).map((act) => (
            <ActionButton key={act.key} action={act} className="os-ring-btn" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 3 Infinite Canvas ─────────────────────────────────────── */
function InfiniteCanvasLayout(a: LayoutActions) {
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
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <Shell a={a} className="os-canvas">
      <p className="os-canvas-hint">Drag the canvas</p>
      <div
        className="os-canvas-viewport"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="os-canvas-world"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        >
          <div className="os-canvas-hero">
            <AvatarButton a={a} className="os-canvas-avatar" />
            <div>
              <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
              <p>{a.mainText}</p>
            </div>
          </div>
          {actions.map((act, i) => (
            <ActionButton
              key={act.key}
              action={act}
              className={`os-canvas-card os-canvas-card-${i}`}
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 4 Holographic ─────────────────────────────────────────── */
function HolographicLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-holo">
      <div className="os-holo-stack">
        <div className="os-holo-panel os-holo-main">
          <AvatarButton a={a} className="os-holo-avatar" />
          <div>
            <p className="os-kicker">HOLOGRAM LINK</p>
            <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
            <p className="os-sub">{a.isPaused ? 'PAUSED' : 'ACTIVE'}</p>
          </div>
        </div>
        <div className="os-holo-grid">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="os-holo-tile" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 5 Floating Island ─────────────────────────────────────── */
function FloatingIslandLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-island">
      <div className="os-island-hero os-island-float">
        <AvatarButton a={a} className="os-island-avatar" />
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p>{a.mainText}</p>
      </div>
      <div className="os-island-row">
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`os-island-card os-island-float os-delay-${i}`}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 6 Reactor ─────────────────────────────────────────────── */
function ReactorLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-reactor">
      <div className="os-reactor-core">
        <div className="os-reactor-glow" aria-hidden />
        <AvatarButton a={a} className="os-reactor-avatar" />
      </div>
      <h1 className="os-reactor-title">{a.eaTitle || 'LUMO EDGE'}</h1>
      <div className="os-reactor-console">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-reactor-key" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 7 Cinematic ───────────────────────────────────────────── */
function CinematicLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-cinematic">
      <div className="os-cine-hero">
        <AvatarButton a={a} className="os-cine-avatar" />
      </div>
      <div className="os-cine-overlay">
        <p className="os-kicker">LUMO OS</p>
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">{a.mainText}</p>
        <div className="os-cine-actions">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="os-cine-chip" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 8 Neural ──────────────────────────────────────────────── */
function NeuralLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-neural">
      <svg className="os-neural-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M50 28 L18 55 M50 28 L50 55 M50 28 L82 55 M50 55 L30 78 M50 55 L70 78" />
      </svg>
      <div className="os-neural-node os-neural-core">
        <AvatarButton a={a} className="os-neural-avatar" />
        <strong>{a.eaTitle || 'LUMO EDGE'}</strong>
      </div>
      <div className="os-neural-nodes">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-neural-leaf" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 9 Glass Layer ─────────────────────────────────────────── */
function GlassLayerLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-glass">
      <div className="os-glass-layer os-glass-back" aria-hidden />
      <div className="os-glass-layer os-glass-mid">
        <AvatarButton a={a} className="os-glass-avatar" />
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      </div>
      <div className="os-glass-layer os-glass-front">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-glass-btn" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 10 Command Center ─────────────────────────────────────── */
function CommandCenterLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-command">
      <header className="os-command-top">
        <AvatarButton a={a} className="os-command-avatar" />
        <div>
          <p className="os-kicker">COMMAND CENTER</p>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        </div>
        <span className={`os-command-badge${a.isPaused ? ' paused' : ''}`}>
          {a.isPaused ? 'PAUSED' : 'LIVE'}
        </span>
      </header>
      <div className="os-command-grid">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-command-module" />
        ))}
      </div>
      <div className="os-command-status">
        <span>Telemetry</span>
        <strong>{a.mainText || 'Nominal'}</strong>
      </div>
    </Shell>
  );
}

/* ── 11 Minimal Luxury ─────────────────────────────────────── */
function MinimalLuxuryLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-luxury">
      <AvatarButton a={a} className="os-luxury-avatar" />
      <h1 className="os-luxury-title">{a.eaTitle || 'LUMO EDGE'}</h1>
      <p className="os-luxury-copy">{a.mainText || 'Precision trading intelligence'}</p>
      <div className="os-luxury-list">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-luxury-row" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 12 Zero Gravity ───────────────────────────────────────── */
function ZeroGravityLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-zero">
      <div className="os-zero-field">
        <div className="os-zero-blob os-zero-a">
          <AvatarButton a={a} className="os-zero-avatar" />
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        </div>
        {actions.map((act, i) => (
          <ActionButton
            key={act.key}
            action={act}
            className={`os-zero-blob os-zero-card os-zero-${i}`}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ── 13 Prism ──────────────────────────────────────────────── */
function PrismLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-prism">
      <div className="os-prism-facet os-prism-hero">
        <AvatarButton a={a} className="os-prism-avatar" />
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      </div>
      <div className="os-prism-facets">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-prism-facet" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 14 Hex Mesh ───────────────────────────────────────────── */
function HexMeshLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-hex">
      <div className="os-hex-mesh" aria-hidden />
      <AvatarButton a={a} className="os-hex-avatar" />
      <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      <div className="os-hex-row">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-hex-cell" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 15 Pulse Wave ─────────────────────────────────────────── */
function PulseWaveLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-pulse">
      <div className="os-pulse-wave" aria-hidden />
      <div className="os-pulse-head">
        <AvatarButton a={a} className="os-pulse-avatar" />
        <div>
          <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
          <p>{a.isPaused ? 'Wave idle' : 'Wave syncing'}</p>
        </div>
      </div>
      <div className="os-pulse-rail">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-pulse-node" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 16 Satellite ──────────────────────────────────────────── */
function SatelliteLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-sat">
      <div className="os-sat-orbit" aria-hidden />
      <AvatarButton a={a} className="os-sat-avatar" />
      <p className="os-kicker">SATELLITE UPLINK</p>
      <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      <div className="os-sat-pods">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-sat-pod" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 17 Vault ──────────────────────────────────────────────── */
function VaultLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-vault">
      <div className="os-vault-door">
        <AvatarButton a={a} className="os-vault-avatar" />
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <p className="os-sub">Secure vault chamber</p>
      </div>
      <div className="os-vault-slots">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-vault-slot" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 18 Spectrum ───────────────────────────────────────────── */
function SpectrumLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-spectrum">
      <div className="os-spectrum-bars" aria-hidden>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <AvatarButton a={a} className="os-spectrum-avatar" />
      <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      <div className="os-spectrum-band">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-spectrum-chip" />
        ))}
      </div>
    </Shell>
  );
}

/* ── 19 Mecha ──────────────────────────────────────────────── */
function MechaLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-mecha">
      <div className="os-mecha-frame">
        <div className="os-mecha-hud">
          <span>SYS</span>
          <strong>{a.isPaused ? 'HOLD' : 'ARMED'}</strong>
          <span>vOS</span>
        </div>
        <AvatarButton a={a} className="os-mecha-avatar" />
        <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
        <div className="os-mecha-modules">
          {actions.map((act) => (
            <ActionButton key={act.key} action={act} className="os-mecha-mod" />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ── 20 Eclipse ────────────────────────────────────────────── */
function EclipseLayout(a: LayoutActions) {
  const actions = actionDefs(a);
  return (
    <Shell a={a} className="os-eclipse">
      <div className="os-eclipse-corona" aria-hidden />
      <AvatarButton a={a} className="os-eclipse-avatar" />
      <h1>{a.eaTitle || 'LUMO EDGE'}</h1>
      <p className="os-sub">{a.mainText}</p>
      <div className="os-eclipse-arc">
        {actions.map((act) => (
          <ActionButton key={act.key} action={act} className="os-eclipse-btn" />
        ))}
      </div>
    </Shell>
  );
}

const LAYOUT_MAP: Record<LayoutId, (a: LayoutActions) => ReactNode> = {
  'ai-core': AiCoreLayout,
  orbital: OrbitalLayout,
  'infinite-canvas': InfiniteCanvasLayout,
  holographic: HolographicLayout,
  'floating-island': FloatingIslandLayout,
  reactor: ReactorLayout,
  cinematic: CinematicLayout,
  neural: NeuralLayout,
  'glass-layer': GlassLayerLayout,
  'command-center': CommandCenterLayout,
  'minimal-luxury': MinimalLuxuryLayout,
  'zero-gravity': ZeroGravityLayout,
  prism: PrismLayout,
  'hex-mesh': HexMeshLayout,
  'pulse-wave': PulseWaveLayout,
  satellite: SatelliteLayout,
  vault: VaultLayout,
  spectrum: SpectrumLayout,
  mecha: MechaLayout,
  eclipse: EclipseLayout,
};

/** Renders one of the 20 OS home layouts — same actions, different composition. */
export function OsHomeLayout({
  layout,
  ...actions
}: LayoutActions & { layout: LayoutId }) {
  const Comp = LAYOUT_MAP[layout] || AiCoreLayout;
  return <>{Comp(actions)}</>;
}

/* Legacy named exports kept for any stray imports */
export const FocusLayout = HolographicLayout;
export const TerminalLayout = MechaLayout;
export const VortexLayout = OrbitalLayout;

