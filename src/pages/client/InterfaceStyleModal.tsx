import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  Check,
  ImagePlus,
  Layers,
  Palette,
  ScanSearch,
  Sparkles,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  ACCENTS,
  EFFECTS,
  LAYOUTS,
  THEMES,
  type AccentId,
  type CustomBgId,
  type EffectId,
  type InterfacePrefs,
  type LayoutId,
  type StyleTab,
  type ThemeId,
  accentHex,
} from '../../lib/interfaceStyle';
import {
  ALL_MEDIA_SLOTS,
  isPlaceholderMentorImage,
  type MentorMediaItem,
} from '../../lib/mentorMedia';
import { resolveStoredMediaUrl } from '../../lib/storage';

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: InterfacePrefs;
  onChange: (next: InterfacePrefs) => void;
  avatarUrl: string;
  mentorBgUrl: string;
  mentorMedia?: MentorMediaItem[];
  onOpenScanner: () => void;
};

export function InterfaceStyleModal({
  open,
  onClose,
  prefs,
  onChange,
  avatarUrl,
  mentorBgUrl,
  mentorMedia = [],
  onOpenScanner,
}: Props) {
  const [tab, setTab] = useState<StyleTab>('themes');
  const accent = accentHex(prefs.accent);
  const uploaded = ALL_MEDIA_SLOTS.map((slot) => ({
    ...slot,
    item: mentorMedia.find((m) => m.slot === slot.id),
  })).filter((s) => Boolean(s.item?.url));

  const tabs = useMemo(
    () =>
      [
        { id: 'themes' as const, label: 'Themes', Icon: Palette },
        { id: 'layouts' as const, label: 'Layouts', Icon: Layers },
        { id: 'effects' as const, label: 'Effects', Icon: Sparkles },
        { id: 'colours' as const, label: 'Colours', Icon: Palette },
        { id: 'custom' as const, label: 'Backgrounds', Icon: ImagePlus },
        { id: 'settings' as const, label: 'Settings', Icon: SlidersHorizontal },
      ] as const,
    [],
  );

  const setLayout = (layout: LayoutId) => onChange({ ...prefs, layout });
  const setTheme = (theme: ThemeId) => onChange({ ...prefs, theme });
  const setAccent = (next: AccentId) => onChange({ ...prefs, accent: next });
  const setCustomBg = (customBg: CustomBgId) => {
    onChange({ ...prefs, customBg });
  };
  const toggleEffect = (id: Exclude<EffectId, 'none'>) => {
    onChange({ ...prefs, effect: prefs.effect === id ? 'none' : id });
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
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
            <strong>Appearance</strong>
          </div>
          <div className="iface-avatar-wrap">
            {avatarUrl && !isPlaceholderMentorImage(avatarUrl) ? (
              <img src={avatarUrl} alt="" className="iface-avatar" />
            ) : (
              <div className="iface-avatar iface-avatar-empty" aria-hidden />
            )}
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
          {tab === 'themes' ? (
            <>
              <p className="muted iface-intro">
                Premium cyberpunk themes — updates buttons, cards, navigation, and accents instantly.
              </p>
              <div className="iface-theme-grid">
                {THEMES.map((theme) => {
                  const active = prefs.theme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`iface-theme-card${active ? ' active' : ''}`}
                      onClick={() => setTheme(theme.id)}
                      style={
                        {
                          '--theme-preview-a': theme.tokens.electric,
                          '--theme-preview-b': theme.tokens.cyan,
                          '--theme-preview-c': theme.tokens.purple,
                        } as CSSProperties
                      }
                    >
                      <span className="iface-theme-preview" aria-hidden />
                      <strong>{theme.label}</strong>
                      <span className="muted">{theme.description}</span>
                      {active ? <Check size={14} className="iface-theme-check" /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === 'layouts' ? (
            <>
              <p className="muted iface-intro">
                Choose a futuristic OS layout — same controls, completely different composition.
              </p>
              <div className="iface-theme-grid">
                {LAYOUTS.map((layout, i) => {
                  const active = prefs.layout === layout.id;
                  const themeTokens = THEMES[i % THEMES.length]?.tokens;
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      className={`iface-theme-card${active ? ' active' : ''}`}
                      onClick={() => setLayout(layout.id)}
                      style={
                        themeTokens
                          ? ({
                              '--theme-preview-a': themeTokens.electric,
                              '--theme-preview-b': themeTokens.cyan,
                              '--theme-preview-c': themeTokens.purple,
                            } as CSSProperties)
                          : undefined
                      }
                    >
                      <span className="iface-theme-preview" aria-hidden />
                      <strong>{layout.label}</strong>
                      <span className="muted">{layout.description}</span>
                      {active ? <Check size={14} className="iface-theme-check" /> : null}
                    </button>
                  );
                })}
              </div>
            </>
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
                Tap a picture or video from your mentor to set it as the platform
                background. Choose{' '}
                <strong style={{ color: 'var(--text)' }}>Default</strong> to clear it.
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
                    <span>EA Image</span>
                  </div>
                </button>
                {uploaded.map((slot) => {
                  const active = prefs.customBg === slot.id;
                  const item = slot.item!;
                  const previewUrl = resolveStoredMediaUrl(item.url) || item.url;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`iface-custom-card${active ? ' active' : ''}`}
                      onClick={() => setCustomBg(slot.id)}
                    >
                      <div className="iface-custom-preview">
                        {item.kind === 'video' ? (
                          <video src={previewUrl} muted playsInline />
                        ) : (
                          <span
                            className="iface-custom-preview-img"
                            style={{ backgroundImage: `url(${previewUrl})` }}
                          />
                        )}
                      </div>
                      <div className="iface-custom-meta">
                        {active ? <Check size={14} color="var(--electric)" /> : null}
                        <span>{slot.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {uploaded.length === 0 ? (
                <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                  No custom uploads yet — your mentor can add them in Admin → Profile.
                </p>
              ) : null}
            </>
          ) : null}

          {tab === 'settings' ? (
            <>
              <p className="muted iface-intro">
                Control motion and polish across the app. Disabling animations improves battery on older devices.
              </p>
              <div className="iface-settings-list">
                <label className="iface-setting-row">
                  <div>
                    <strong>Premium animations</strong>
                    <span className="muted">Page transitions, cards, and loading effects</span>
                  </div>
                  <button
                    type="button"
                    className={`scan-toggle${prefs.animations ? ' on' : ''}`}
                    onClick={() => onChange({ ...prefs, animations: !prefs.animations })}
                    aria-pressed={prefs.animations}
                  >
                    <span />
                  </button>
                </label>
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
    </div>,
    document.body,
  );
}
