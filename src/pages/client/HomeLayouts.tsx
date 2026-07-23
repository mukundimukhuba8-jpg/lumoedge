import type { ReactNode } from 'react';
import {
  Box,
  Grid2x2,
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
import { isMentorProfileImage, type MentorMediaKind } from '../../lib/mentorMedia';

export type LayoutActions = {
  eaTitle: string;
  eaImage: string;
  /** Selected Custom background (image/video URL) — falls back to eaImage */
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
      className={className}
      style={{
        minHeight: '100dvh',
        position: 'relative',
        padding: '16px 12px 0',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text)',
        boxShadow: `inset 0 0 80px rgba(${accentRgb},0.06)`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: isVideo || !img
          ? '#05070d'
          : `
            linear-gradient(180deg, rgba(6,8,14,0.12) 0%, rgba(6,8,14,0.22) 45%, rgba(6,8,14,0.38) 100%),
            url(${img})
          `,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }}
    >
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
      <div className="lay-bg-content">{children}</div>
    </div>
  );
}

function resolveBg(a: LayoutActions) {
  const url = a.backdropUrl || a.eaImage || '';
  return {
    url: isMentorProfileImage(url) ? url : '',
    kind: a.backdropKind || 'image',
  };
}

/** Focus — vertical glass action list over full-bleed EA art */
export function FocusLayout(a: LayoutActions) {
  const bg = resolveBg(a);
  const rows: {
    key: string;
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    displayOnly?: boolean;
    danger?: boolean;
    trailing?: ReactNode;
  }[] = [
    {
      key: 'pause',
      label: 'Pause Trading',
      icon: a.isPaused ? <Play size={20} /> : <Pause size={20} />,
      onClick: a.onPauseToggle,
      trailing: (
        <span className={`lay-onpill${a.isPaused ? '' : ' live'}`}>
          {a.isPaused ? 'OFF' : 'ON'}
        </span>
      ),
    },
    {
      key: 'symbols',
      label: 'Trading Symbols',
      icon: <Signal size={20} />,
      onClick: a.onSymbols,
    },
    {
      key: 'connect',
      label: 'Connect New License',
      icon: <Plus size={20} />,
      displayOnly: true,
    },
    {
      key: 'style',
      label: 'Interface Settings',
      icon: <Settings size={20} />,
      onClick: a.onStyle,
    },
    {
      key: 'delete',
      label: 'Delete License',
      icon: <Trash2 size={20} />,
      onClick: a.onDelete,
      danger: true,
    },
  ];

  return (
    <LayoutBackdrop className="lay-focus" url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      <div className="lay-focus-hero">
        <button type="button" className="lay-avatar-lg" onClick={a.onAvatarTap}>
          {isMentorProfileImage(a.eaImage) ? (
            <img src={a.eaImage} alt="" />
          ) : (
            <span className="lay-avatar-empty" aria-hidden />
          )}
        </button>
        <h1 className="lay-title">{a.eaTitle || a.mainText || 'LUMO EDGE'}</h1>
      </div>

      <div className="lay-focus-list">
        {rows.map((row) =>
          row.displayOnly ? (
            <div
              key={row.key}
              className="lay-focus-row lay-focus-row-static"
              aria-hidden="true"
            >
              <span className="lay-focus-ico">{row.icon}</span>
              <span className="lay-focus-label">{row.label}</span>
            </div>
          ) : (
            <button
              key={row.key}
              type="button"
              className={`lay-focus-row${row.danger ? ' danger' : ''}`}
              onClick={row.onClick}
            >
              <span className={`lay-focus-ico${row.danger ? ' danger' : ''}`}>{row.icon}</span>
              <span className="lay-focus-label">{row.label}</span>
              {row.trailing}
            </button>
          ),
        )}
      </div>

      <LayoutDock
        onHome={a.onHomeTap}
        onScanner={a.onScanner}
        onMetaTrader={a.onMetaTrader}
      />
    </LayoutBackdrop>
  );
}

/** Terminal — CLI window of executable actions */
export function TerminalLayout(a: LayoutActions) {
  const bg = resolveBg(a);
  const cmds: {
    key: string;
    cmd: string;
    arg: string;
    onClick: () => void;
    danger?: boolean;
  }[] = [
    { key: 'pause', cmd: 'ea', arg: a.isPaused ? '--resume' : '--pause', onClick: a.onPauseToggle },
    { key: 'symbols', cmd: 'symbols', arg: '--configure', onClick: a.onSymbols },
    { key: 'style', cmd: 'interface', arg: '--settings', onClick: a.onStyle },
    { key: 'delete', cmd: 'license', arg: '--delete', onClick: a.onDelete, danger: true },
  ];

  return (
    <LayoutBackdrop className="lay-terminal" url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      <div className="lay-term-window">
        <div className="lay-term-chrome">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
          <span className="lay-term-title">lumo-edge.exe</span>
        </div>

        <div className="lay-term-id">
          <button type="button" className="lay-avatar-sm" onClick={a.onAvatarTap}>
            {isMentorProfileImage(a.eaImage) ? (
              <img src={a.eaImage} alt="" />
            ) : (
              <span className="lay-avatar-empty" aria-hidden />
            )}
          </button>
          <div>
            <div className="lay-term-name">$ {a.eaTitle || 'LUMO EDGE'}</div>
            <div className="lay-term-status">
              status:{' '}
              <span style={{ color: a.isPaused ? 'var(--orange)' : 'var(--electric)' }}>
                {a.isPaused ? 'PAUSED' : 'RUNNING'}
              </span>
            </div>
          </div>
        </div>

        <div className="lay-term-cmds">
          {cmds.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`lay-term-line${c.danger ? ' danger' : ''}`}
              onClick={c.onClick}
            >
              <span className="prompt">&gt;</span>
              <span className="cmd">{c.cmd}</span>
              <span className={`arg${c.danger ? ' danger' : ''}`}>{c.arg}</span>
            </button>
          ))}
          <div className="lay-term-line lay-term-line-static" aria-hidden="true">
            <span className="prompt">&gt;</span>
            <span className="cmd">license</span>
            <span className="arg">--connect</span>
          </div>
          <div className="lay-term-cursor" aria-hidden>
            <span className="prompt">&gt;</span>
            <span className="blink" />
          </div>
        </div>
      </div>

      <LayoutDock
        onHome={a.onHomeTap}
        onScanner={a.onScanner}
        onMetaTrader={a.onMetaTrader}
      />
    </LayoutBackdrop>
  );
}

/** Vortex — hex mesh + large avatar + circular action ring */
export function VortexLayout(a: LayoutActions) {
  const bg = resolveBg(a);
  return (
    <LayoutBackdrop className="lay-vortex" url={bg.url} kind={bg.kind} accentRgb={a.accentRgb}>
      <div className="lay-vortex-mesh" aria-hidden />
      <div className="lay-vortex-hero">
        <button type="button" className="lay-avatar-xl" onClick={a.onAvatarTap}>
          {isMentorProfileImage(a.eaImage) ? (
            <img src={a.eaImage} alt="" />
          ) : (
            <span className="lay-avatar-empty" aria-hidden />
          )}
        </button>
        <div className="lay-vortex-sub">{a.mainText || a.eaTitle}</div>
        <h1 className="lay-title">{a.eaTitle || 'LUMO EDGE'}</h1>
      </div>

      <div className="lay-vortex-ring">
        <VortexOrb
          label="DELETE"
          danger
          onClick={a.onDelete}
          icon={<Trash2 size={22} />}
        />
        <VortexOrb
          label="FOCUS"
          onClick={a.onPauseToggle}
          icon={a.isPaused ? <Play size={22} /> : <Grid2x2 size={22} />}
        />
        <VortexOrb
          label="SYMBOLS"
          large
          onClick={a.onSymbols}
          icon={
            isMentorProfileImage(a.eaImage) ? (
              <img
                src={a.eaImage}
                alt=""
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <Grid2x2 size={22} />
            )
          }
        />
        <VortexOrbDisplay label="CONNECT" icon={<Plus size={22} />} />
        <VortexOrb label="STYLE" onClick={a.onStyle} icon={<Box size={22} />} />
      </div>

      <LayoutDock
        onHome={a.onHomeTap}
        onScanner={a.onScanner}
        onMetaTrader={a.onMetaTrader}
      />
    </LayoutBackdrop>
  );
}

function VortexOrbDisplay({
  label,
  icon,
  large,
}: {
  label: string;
  icon: ReactNode;
  large?: boolean;
}) {
  return (
    <div
      className={`lay-vortex-orb lay-vortex-orb-static${large ? ' large' : ''}`}
      aria-hidden="true"
    >
      <span className="lay-vortex-circle">{icon}</span>
      <span className="lay-vortex-label">{label}</span>
    </div>
  );
}

function VortexOrb({
  label,
  icon,
  onClick,
  large,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  large?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lay-vortex-orb${large ? ' large' : ''}${danger ? ' danger' : ''}`}
      onClick={onClick}
    >
      <span className="lay-vortex-circle">{icon}</span>
      <span className="lay-vortex-label">{label}</span>
    </button>
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
    <nav className="lay-dock" aria-label="Main">
      <button type="button" className="lay-dock-item active" onClick={onHome}>
        <span className="lay-dock-ico">
          <Home size={20} />
        </span>
        <span>Home</span>
      </button>
      <button type="button" className="lay-dock-item" onClick={onScanner}>
        <span className="lay-dock-ico">
          <ScanSearch size={20} />
        </span>
        <span>Scanner</span>
      </button>
      <button type="button" className="lay-dock-item" onClick={onMetaTrader}>
        <span className="lay-dock-ico">
          <Monitor size={20} />
        </span>
        <span>MetaTrader</span>
      </button>
    </nav>
  );
}
