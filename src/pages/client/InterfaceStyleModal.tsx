import { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ImagePlus,
  Layers,
  Palette,
  ScanSearch,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ACCENTS,
  EFFECTS,
  LAYOUTS,
  type AccentId,
  type CustomBgId,
  type EffectId,
  type InterfacePrefs,
  type LayoutId,
  type StyleTab,
  accentHex,
} from '../../lib/interfaceStyle';

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: InterfacePrefs;
  onChange: (next: InterfacePrefs) => void;
  avatarUrl: string;
  mentorBgUrl: string;
  onOpenScanner: () => void;
};

function LayoutGlyph({ schema, active }: { schema: string; active: boolean }) {
  const ink = active ? 'var(--electric)' : '#64748b';
  const fill = active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
      {schema === 'classic' && (
        <>
          <rect x="8" y="6" width="24" height="10" rx="2" fill={ink} opacity={0.9} />
          <circle cx="14" cy="22" r="2.2" fill={ink} />
          <circle cx="20" cy="22" r="2.2" fill={ink} />
          <circle cx="26" cy="22" r="2.2" fill={ink} />
          <rect x="10" y="28" width="20" height="4" rx="2" fill={fill} stroke={ink} />
        </>
      )}
      {schema === 'bold' && (
        <>
          <rect x="7" y="6" width="26" height="16" rx="3" fill={ink} opacity={0.85} />
          <circle cx="14" cy="30" r="2" fill={ink} />
          <circle cx="20" cy="30" r="2" fill={ink} />
          <circle cx="26" cy="30" r="2" fill={ink} />
        </>
      )}
      {schema === 'minimal' && (
        <>
          <circle cx="20" cy="12" r="6" fill="none" stroke={ink} strokeWidth="2" />
          <circle cx="14" cy="28" r="2" fill={ink} />
          <circle cx="20" cy="28" r="2" fill={ink} />
          <circle cx="26" cy="28" r="2" fill={ink} />
        </>
      )}
      {schema === 'expanded' && (
        <>
          <circle cx="12" cy="12" r="5" fill={ink} opacity={0.85} />
          <rect x="20" y="8" width="12" height="2.5" rx="1" fill={ink} />
          <rect x="20" y="13" width="9" height="2" rx="1" fill={ink} opacity={0.6} />
          <circle cx="14" cy="28" r="2" fill={ink} />
          <circle cx="20" cy="28" r="2" fill={ink} />
          <circle cx="26" cy="28" r="2" fill={ink} />
        </>
      )}
      {schema === 'dashboard' && (
        <>
          <rect x="7" y="7" width="11" height="11" rx="2" fill={ink} opacity={0.85} />
          <rect x="22" y="7" width="11" height="11" rx="2" fill={fill} stroke={ink} />
          <rect x="7" y="22" width="11" height="11" rx="2" fill={fill} stroke={ink} />
          <rect x="22" y="22" width="11" height="11" rx="2" fill={ink} opacity={0.55} />
        </>
      )}
      {schema === 'terminal' && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x="8"
              y={8 + i * 5}
              width={18 + (i % 3) * 3}
              height="2.5"
              rx="1"
              fill={ink}
              opacity={0.5 + i * 0.1}
            />
          ))}
        </>
      )}
      {schema === 'focus' && (
        <>
          <rect x="8" y="8" width="24" height="16" rx="3" fill={ink} opacity={0.85} />
          <circle cx="16" cy="30" r="2" fill={ink} />
          <circle cx="24" cy="30" r="2" fill={ink} />
        </>
      )}
      {schema === 'vortex' && (
        <>
          <circle cx="20" cy="20" r="12" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle cx="20" cy="20" r="7" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle cx="20" cy="20" r="2.5" fill={ink} />
          <circle cx="20" cy="8" r="1.6" fill={ink} />
          <circle cx="31" cy="20" r="1.6" fill={ink} />
          <circle cx="20" cy="32" r="1.6" fill={ink} />
        </>
      )}
      {schema === 'phantom' && (
        <>
          <rect x="8" y="6" width="24" height="12" rx="2" fill={ink} opacity={0.85} />
          <rect x="8" y="22" width="11" height="10" rx="2" fill={fill} stroke={ink} />
          <rect x="21" y="22" width="11" height="10" rx="2" fill={fill} stroke={ink} />
        </>
      )}
      {schema === 'apex' && (
        <>
          <rect x="8" y="6" width="24" height="6" rx="2" fill={ink} opacity={0.9} />
          <rect x="8" y="15" width="24" height="10" rx="2" fill={fill} stroke={ink} />
          <rect x="8" y="28" width="10" height="4" rx="2" fill={ink} opacity={0.7} />
          <rect x="22" y="28" width="10" height="4" rx="2" fill={ink} opacity={0.7} />
        </>
      )}
    </svg>
  );
}

export function InterfaceStyleModal({
  open,
  onClose,
  prefs,
  onChange,
  avatarUrl,
  mentorBgUrl,
  onOpenScanner,
}: Props) {
  const [tab, setTab] = useState<StyleTab>('layouts');
  const accent = accentHex(prefs.accent);

  const tabs = useMemo(
    () =>
      [
        { id: 'layouts' as const, label: 'Layouts', Icon: Layers },
        { id: 'effects' as const, label: 'Effects', Icon: Sparkles },
        { id: 'colours' as const, label: 'Colours', Icon: Palette },
        { id: 'custom' as const, label: 'Custom', Icon: ImagePlus },
      ] as const,
    [],
  );

  if (!open) return null;

  const setLayout = (layout: LayoutId) => onChange({ ...prefs, layout });
  const setAccent = (next: AccentId) => onChange({ ...prefs, accent: next });
  const setCustomBg = (customBg: CustomBgId) => onChange({ ...prefs, customBg });
  const toggleEffect = (id: Exclude<EffectId, 'none'>) => {
    onChange({ ...prefs, effect: prefs.effect === id ? 'none' : id });
  };

  return (
    <div
      className="iface-backdrop smooth-fade"
      role="dialog"
      aria-modal="true"
      aria-label="Interface Style"
      onClick={onClose}
    >
      <div className="iface-sheet smooth-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="iface-handle" />
        <div className="iface-header">
          <div className="iface-title-row">
            <Layers size={18} color="var(--electric)" />
            <strong>Interface Style</strong>
          </div>
          <div className="iface-avatar-wrap">
            <img src={avatarUrl || '/bull-avatar.jpg'} alt="" className="iface-avatar" />
          </div>
          <button type="button" className="iface-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="iface-section-label">TOOLS</div>
        <button type="button" className="iface-tool" onClick={onOpenScanner}>
          <span className="iface-tool-icon">
            <ScanSearch size={20} />
          </span>
          <span>
            <strong>Chart Scanner</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              AI-powered chart analysis &amp; auto trade
            </div>
          </span>
        </button>

        <div className="iface-tabs">
          {tabs.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className={`iface-tab${active ? ' active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="iface-body">
          {tab === 'layouts' ? (
            <div className="iface-layout-grid">
              {LAYOUTS.map((item) => {
                const active = prefs.layout === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`iface-layout${active ? ' active' : ''}`}
                    onClick={() => setLayout(item.id)}
                  >
                    <span className="iface-layout-circle">
                      <LayoutGlyph schema={item.schema} active={active} />
                    </span>
                    <span className="iface-layout-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {tab === 'effects' ? (
            <>
              {prefs.effect !== 'none' ? (
                <div className="iface-effect-status">
                  <span>
                    <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                    {EFFECTS.find((e) => e.id === prefs.effect)?.title} is ON
                  </span>
                  <button
                    type="button"
                    className="iface-turn-off"
                    onClick={() => onChange({ ...prefs, effect: 'none' })}
                  >
                    TURN OFF
                  </button>
                </div>
              ) : null}
              <div className="iface-effect-grid">
                {EFFECTS.map((fx) => {
                  const on = prefs.effect === fx.id;
                  return (
                    <button
                      key={fx.id}
                      type="button"
                      className={`iface-effect-card${on ? ' active' : ''}`}
                      onClick={() => toggleEffect(fx.id)}
                    >
                      <span className="iface-effect-orb">
                        <Sparkles size={22} color={on ? 'var(--electric)' : '#64748b'} />
                      </span>
                      <strong>{fx.title}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {fx.description}
                      </span>
                      <span className={`iface-onoff${on ? ' on' : ''}`}>{on ? 'ON' : 'OFF'}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === 'colours' ? (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Choose your accent colour — applies across all layouts.
              </p>
              <div className="iface-colour-grid">
                {ACCENTS.map((c) => {
                  const active = prefs.accent === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`iface-colour${active ? ' active' : ''}`}
                      onClick={() => setAccent(c.id)}
                    >
                      <span
                        className="iface-swatch"
                        style={{
                          background: c.hex,
                          boxShadow: active ? `0 0 0 2px #fff, 0 0 14px ${c.hex}` : undefined,
                        }}
                      />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === 'custom' ? (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Choose a background image uploaded by your mentor. Select{' '}
                <strong style={{ color: 'var(--text)' }}>Default</strong> to remove a custom
                background.
              </p>
              <div className="iface-custom-row">
                <button
                  type="button"
                  className={`iface-custom-card${prefs.customBg === 'default' ? ' active' : ''}`}
                  onClick={() => setCustomBg('default')}
                >
                  <div className="iface-custom-preview default">Default</div>
                  <div className="iface-custom-meta">
                    {prefs.customBg === 'default' ? (
                      <Check size={14} color="var(--electric)" />
                    ) : null}
                    <span>Default</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`iface-custom-card${prefs.customBg === 'interface-1' ? ' active' : ''}`}
                  onClick={() => setCustomBg('interface-1')}
                  disabled={!mentorBgUrl}
                >
                  <div
                    className="iface-custom-preview"
                    style={{
                      backgroundImage: mentorBgUrl
                        ? `url(${mentorBgUrl})`
                        : undefined,
                    }}
                  >
                    {!mentorBgUrl ? 'No image' : null}
                  </div>
                  <div className="iface-custom-meta">
                    {prefs.customBg === 'interface-1' ? (
                      <Check size={14} color="var(--electric)" />
                    ) : null}
                    <span>Interface 1</span>
                  </div>
                </button>
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          className="iface-fab"
          aria-label="AI assistant"
          style={{ background: accent, boxShadow: `0 0 22px ${accent}` }}
          onClick={() =>
            alert('Lumo AI assistant will help with chart scans and trade tips soon.')
          }
        >
          <Bot size={22} color="#061018" />
        </button>
      </div>
    </div>
  );
}
