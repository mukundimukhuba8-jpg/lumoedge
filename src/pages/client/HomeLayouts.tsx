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

export type LayoutActions = {
  eaTitle: string;
  eaImage: string;
  mainText: string;
  isPaused: boolean;
  accentRgb: string;
  onPauseToggle: () => void;
  onSymbols: () => void;
  onConnect: () => void;
  onStyle: () => void;
  onDelete: () => void;
  onHomeTap: () => void;
  onMetaTrader: () => void;
  onScanner: () => void;
  onAvatarTap: () => void;
};

function bgStyle(eaImage: string, accentRgb: string) {
  const img = eaImage || '/bull-hero.jpg';
  return {
    minHeight: '100%',
    backgroundImage: `
      linear-gradient(180deg, rgba(6,8,14,0.55) 0%, rgba(6,8,14,0.82) 45%, rgba(6,8,14,0.96) 100%),
      url(${img})
    `,
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
    padding: '28px 18px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    color: 'var(--text)',
    boxShadow: `inset 0 0 80px rgba(${accentRgb},0.12)`,
  };
}

/** Focus — vertical glass action list over full-bleed EA art */
export function FocusLayout(a: LayoutActions) {
  const rows: {
    key: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
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
      onClick: a.onConnect,
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
    <div className="lay-focus" style={bgStyle(a.eaImage, a.accentRgb)}>
      <div className="lay-focus-hero">
        <button type="button" className="lay-avatar-lg" onClick={a.onAvatarTap}>
          <img src={a.eaImage || '/bull-avatar.jpg'} alt="" />
        </button>
        <h1 className="lay-title">{a.eaTitle || a.mainText || 'LUMO EDGE'}</h1>
      </div>

      <div className="lay-focus-list">
        {rows.map((row) => (
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
        ))}
      </div>

      <LayoutTabBar
        active="home"
        onHome={a.onHomeTap}
        onMetaTrader={a.onMetaTrader}
        accentRgb={a.accentRgb}
      />
    </div>
  );
}

/** Terminal — mac-style exe window with CLI commands */
export function TerminalLayout(a: LayoutActions) {
  const cmds: {
    key: string;
    cmd: string;
    arg: string;
    onClick: () => void;
    danger?: boolean;
  }[] = [
    { key: 'pause', cmd: 'ea', arg: a.isPaused ? '--resume' : '--pause', onClick: a.onPauseToggle },
    { key: 'symbols', cmd: 'symbols', arg: '--configure', onClick: a.onSymbols },
    { key: 'connect', cmd: 'license', arg: '--connect', onClick: a.onConnect },
    { key: 'style', cmd: 'interface', arg: '--settings', onClick: a.onStyle },
    { key: 'delete', cmd: 'license', arg: '--delete', onClick: a.onDelete, danger: true },
  ];

  return (
    <div className="lay-terminal" style={bgStyle(a.eaImage, a.accentRgb)}>
      <div className="lay-term-window">
        <div className="lay-term-chrome">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
          <span className="lay-term-title">lumo-edge.exe</span>
        </div>

        <div className="lay-term-id">
          <button type="button" className="lay-avatar-sm" onClick={a.onAvatarTap}>
            <img src={a.eaImage || '/bull-avatar.jpg'} alt="" />
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
          <div className="lay-term-cursor" aria-hidden>
            <span className="prompt">&gt;</span>
            <span className="blink" />
          </div>
        </div>
      </div>

      <LayoutTabBar
        active="home"
        onHome={a.onHomeTap}
        onMetaTrader={a.onMetaTrader}
        accentRgb={a.accentRgb}
      />
    </div>
  );
}

/** Vortex — hex mesh + large avatar + circular action ring */
export function VortexLayout(a: LayoutActions) {
  return (
    <div className="lay-vortex" style={bgStyle(a.eaImage, a.accentRgb)}>
      <div className="lay-vortex-mesh" aria-hidden />
      <div className="lay-vortex-hero">
        <button type="button" className="lay-avatar-xl" onClick={a.onAvatarTap}>
          <img src={a.eaImage || '/bull-avatar.jpg'} alt="" />
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
            <img
              src={a.eaImage || '/bull-avatar.jpg'}
              alt=""
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
            />
          }
        />
        <VortexOrb label="CONNECT" onClick={a.onConnect} icon={<Plus size={22} />} />
        <VortexOrb label="STYLE" onClick={a.onStyle} icon={<Box size={22} />} />
      </div>

      <div style={{ flex: 1 }} />

      <div className="lay-vortex-tabbar">
        <button type="button" className="active" onClick={a.onHomeTap}>
          <Home size={20} />
          <span>Home</span>
        </button>
        <button type="button" onClick={a.onScanner}>
          <ScanSearch size={20} />
          <span>Scanner</span>
        </button>
        <button type="button" onClick={a.onMetaTrader}>
          <Monitor size={20} />
          <span>MetaTrader</span>
        </button>
      </div>
    </div>
  );
}

function VortexOrb({
  label,
  icon,
  onClick,
  danger,
  large,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lay-vortex-orb${danger ? ' danger' : ''}${large ? ' large' : ''}`}
      onClick={onClick}
    >
      <span className="lay-vortex-circle">{icon}</span>
      <span className="lay-vortex-label">{label}</span>
    </button>
  );
}

function LayoutTabBar({
  active,
  onHome,
  onMetaTrader,
  accentRgb,
}: {
  active: 'home' | 'mt';
  onHome: () => void;
  onMetaTrader: () => void;
  accentRgb: string;
}) {
  return (
    <div
      className="lay-tabbar"
      style={{ borderTopColor: `rgba(${accentRgb},0.35)` }}
    >
      <button type="button" className={active === 'home' ? 'active' : ''} onClick={onHome}>
        <Home size={20} />
        <span>Home</span>
      </button>
      <button type="button" className={active === 'mt' ? 'active' : ''} onClick={onMetaTrader}>
        <Monitor size={20} />
        <span>MetaTrader</span>
      </button>
    </div>
  );
}
