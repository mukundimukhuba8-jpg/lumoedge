import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ImagePlus,
  Layers,
  Palette,
  ScanSearch,
  Sparkles,
  SlidersHorizontal,
  Type,
  X,
} from 'lucide-react';
import { FloatingAiAssistant } from '../../components/FloatingAiAssistant';
import {
  ACCENTS,
  EFFECTS,
  FONTS,
  LAYOUTS,
  THEMES,
  type AccentId,
  type CustomBgId,
  type EffectId,
  type FontId,
  type InterfacePrefs,
  type LayoutId,
  type StyleTab,
  type ThemeId,
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

type HubId = StyleTab;

const HUB: {
  id: HubId;
  label: string;
  description: string;
  Icon: typeof Palette;
}[] = [
  { id: 'themes', label: 'Appearance', description: 'Theme atmosphere and base surfaces', Icon: Palette },
  { id: 'fonts', label: 'Typography', description: 'Display and body typefaces', Icon: Type },
  { id: 'colours', label: 'Colours', description: 'Accent colour across the whole OS', Icon: Palette },
  { id: 'effects', label: 'Effects', description: 'Ambient motion layers', Icon: Sparkles },
  { id: 'custom', label: 'Backgrounds', description: 'Mentor art and custom media', Icon: ImagePlus },
  { id: 'layouts', label: 'Layouts', description: 'Interface architecture', Icon: Layers },
  { id: 'settings', label: 'Advanced', description: 'Motion and system polish', Icon: SlidersHorizontal },
];

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
  const [view, setView] = useState<'hub' | HubId>('hub');
  const uploaded = ALL_MEDIA_SLOTS.map((slot) => ({
    ...slot,
    item: mentorMedia.find((m) => m.slot === slot.id),
  })).filter((s) => Boolean(s.item?.url));

  const activeHub = useMemo(() => HUB.find((h) => h.id === view), [view]);

  const setLayout = (layout: LayoutId) => onChange({ ...prefs, layout });
  const setFont = (font: FontId) => onChange({ ...prefs, font });
  const setTheme = (theme: ThemeId) => onChange({ ...prefs, theme });
  const setAccent = (next: AccentId) => onChange({ ...prefs, accent: next });
  const setCustomBg = (customBg: CustomBgId) => onChange({ ...prefs, customBg });
  const toggleEffect = (id: Exclude<EffectId, 'none'>) => {
    onChange({ ...prefs, effect: prefs.effect === id ? 'none' : id });
  };

  if (!open || typeof document === 'undefined') return null;

  let body: ReactNode = null;

  if (view === 'hub') {
    body = (
      <>
        <p className="muted iface-intro">
          Personalize your operating system. Each category opens a focused settings panel.
        </p>
        <button type="button" className="iface-tool iface-tool-premium" onClick={onOpenScanner}>
          <span className="iface-tool-icon">
            <ScanSearch size={20} />
          </span>
          <span className="iface-tool-copy">
            <strong>Chart Scanner</strong>
            <span className="muted">AI chart analysis &amp; auto trade</span>
          </span>
          <ChevronRight size={16} className="iface-tool-chevron" aria-hidden />
        </button>
        <div className="iface-settings-hub">
          {HUB.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              type="button"
              className="iface-hub-card"
              onClick={() => setView(id)}
            >
              <span className="iface-hub-ico" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="iface-hub-copy">
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
              <ChevronRight size={16} className="iface-hub-chevron" aria-hidden />
            </button>
          ))}
        </div>
      </>
    );
  } else if (view === 'themes') {
    body = (
      <>
        <p className="muted iface-intro">
          Premium atmospheres — surfaces, depth, and mood update instantly.
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
    );
  } else if (view === 'layouts') {
    body = (
      <>
        <p className="muted iface-intro">
          Completely different interface architectures — same controls, new visual hierarchy.
        </p>
        <div className="iface-layout-list">
          {LAYOUTS.map((layout) => {
            const active = prefs.layout === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                className={`iface-layout-row${active ? ' active' : ''}`}
                onClick={() => setLayout(layout.id)}
              >
                <span className="iface-layout-copy">
                  <strong>{layout.label}</strong>
                  <span>{layout.description}</span>
                </span>
                {active ? <Check size={16} className="iface-layout-check" /> : null}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (view === 'fonts') {
    body = (
      <>
        <p className="muted iface-intro">Choose typography for the whole operating system.</p>
        <div className="iface-layout-list">
          {FONTS.map((font) => {
            const active = prefs.font === font.id;
            return (
              <button
                key={font.id}
                type="button"
                className={`iface-layout-row${active ? ' active' : ''}`}
                onClick={() => setFont(font.id)}
                style={{ fontFamily: font.body } as CSSProperties}
              >
                <span className="iface-layout-copy">
                  <strong style={{ fontFamily: font.display }}>{font.label}</strong>
                  <span>{font.description}</span>
                </span>
                {active ? <Check size={16} className="iface-layout-check" /> : null}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (view === 'effects') {
    body = (
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
    );
  } else if (view === 'colours') {
    body = (
      <>
        <p className="muted iface-intro">
          Accent colour updates navigation, buttons, borders, glows, scanner, and switches instantly.
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
    );
  } else if (view === 'custom') {
    body = (
      <>
        <p className="muted iface-intro">
          Tap mentor media as the platform background. Choose{' '}
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
              {prefs.customBg === 'default' ? <Check size={14} color="var(--electric)" /> : null}
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
                backgroundImage: mentorBgUrl ? `url(${mentorBgUrl})` : undefined,
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
    );
  } else if (view === 'settings') {
    body = (
      <>
        <p className="muted iface-intro">
          Control motion and polish. Disabling animations improves battery on older devices.
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
    );
  }

  return createPortal(
    <div
      className="iface-backdrop iface-backdrop-os smooth-fade"
      role="dialog"
      aria-modal="true"
      aria-label="Interface Style"
      onClick={() => {
        setView('hub');
        onClose();
      }}
    >
      <div className="iface-sheet iface-sheet-settings smooth-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="iface-handle" />
        <div className="iface-header">
          {view !== 'hub' ? (
            <button
              type="button"
              className="iface-back"
              onClick={() => setView('hub')}
              aria-label="Back to settings"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="iface-title-row">
              <SlidersHorizontal size={18} color="var(--electric)" />
              <strong>Settings</strong>
            </div>
          )}
          {view !== 'hub' ? (
            <div className="iface-title-row iface-title-center">
              <strong>{activeHub?.label || 'Settings'}</strong>
            </div>
          ) : (
            <div className="iface-avatar-wrap">
              {avatarUrl && !isPlaceholderMentorImage(avatarUrl) ? (
                <img src={avatarUrl} alt="" className="iface-avatar" />
              ) : (
                <div className="iface-avatar iface-avatar-empty" aria-hidden />
              )}
            </div>
          )}
          <button
            type="button"
            className="iface-close"
            onClick={() => {
              setView('hub');
              onClose();
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="iface-body iface-body-settings">{body}</div>

        <FloatingAiAssistant
          className="iface-ai-orb"
          title="Lumo AI"
          message="Lumo AI assistant will help with chart scans and trade tips soon."
        />
      </div>
    </div>,
    document.body,
  );
}
