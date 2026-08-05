import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ImagePlus,
  Layers,
  Palette,
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
  BACKGROUND_SLOTS,
  isPlaceholderMentorImage,
  normalizeCustomMedia,
  type MentorMediaItem,
} from '../../lib/mentorMedia';
import { getEaImage, resolveStoredMediaUrl } from '../../lib/storage';

function resolveBgPreview(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const stored = resolveStoredMediaUrl(raw);
  if (stored && (stored.startsWith('data:') || stored.startsWith('http') || stored.startsWith('blob:') || stored.startsWith('/'))) {
    return stored;
  }
  if (raw.startsWith('img:')) {
    const key = raw.replace(/^img:/, '');
    return getEaImage(key) || getEaImage(raw) || `/api/images/${encodeURIComponent(key)}`;
  }
  if (raw.startsWith('/api/images/') || raw.startsWith('http') || raw.startsWith('data:') || raw.startsWith('blob:')) {
    return raw;
  }
  return getEaImage(raw) || `/api/images/${encodeURIComponent(raw)}`;
}

type HubId = StyleTab;

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: InterfacePrefs;
  onChange: (next: InterfacePrefs) => void;
  avatarUrl: string;
  mentorBgUrl: string;
  mentorMedia?: MentorMediaItem[];
  /** Open directly into a section (e.g. layouts / colours). */
  initialView?: 'hub' | HubId;
  /** @deprecated Scanner is a tool, not a Settings category. */
  onOpenScanner?: () => void;
};

const HUB: {
  id: HubId;
  label: string;
  description: string;
  Icon: typeof Palette;
  size: 'hero' | 'wide' | 'tall' | 'compact';
}[] = [
  {
    id: 'themes',
    label: 'Appearance',
    description: 'Theme atmosphere and base surfaces',
    Icon: Palette,
    size: 'hero',
  },
  {
    id: 'layouts',
    label: 'Layouts',
    description: 'Interface architecture',
    Icon: Layers,
    size: 'tall',
  },
  {
    id: 'colours',
    label: 'Colours',
    description: 'Accent across the whole OS',
    Icon: Palette,
    size: 'compact',
  },
  {
    id: 'fonts',
    label: 'Typography',
    description: 'Display and body typefaces',
    Icon: Type,
    size: 'wide',
  },
  {
    id: 'custom',
    label: 'Backgrounds',
    description: 'Mentor art and custom media',
    Icon: ImagePlus,
    size: 'compact',
  },
  {
    id: 'effects',
    label: 'Effects',
    description: 'Ambient motion layers',
    Icon: Sparkles,
    size: 'compact',
  },
  {
    id: 'settings',
    label: 'Advanced',
    description: 'Motion, system polish, tool notes',
    Icon: SlidersHorizontal,
    size: 'wide',
  },
];

export function InterfaceStyleModal({
  open,
  onClose,
  prefs,
  onChange,
  avatarUrl,
  mentorBgUrl,
  mentorMedia = [],
  initialView = 'hub',
}: Props) {
  const [view, setView] = useState<'hub' | HubId>(initialView);
  const [resolvedMedia, setResolvedMedia] = useState<MentorMediaItem[]>(() =>
    normalizeCustomMedia(mentorMedia),
  );

  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  useEffect(() => {
    setResolvedMedia(normalizeCustomMedia(mentorMedia));
  }, [mentorMedia]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import('../../lib/clientBrandingSync').then(async ({ hydrateCustomMediaImages }) => {
      const next = await hydrateCustomMediaImages(mentorMedia);
      if (!cancelled) setResolvedMedia(next.length ? next : normalizeCustomMedia(mentorMedia));
    });
    return () => {
      cancelled = true;
    };
  }, [open, mentorMedia]);

  const uploaded = BACKGROUND_SLOTS.map((slot) => ({
    ...slot,
    item: resolvedMedia.find((m) => m.slot === slot.id),
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
          Customise the operating system — look, feel, motion, and behaviour.
        </p>
        <div className="iface-bento">
          {HUB.map(({ id, label, description, Icon, size }) => (
            <button
              key={id}
              type="button"
              className={`iface-bento-card iface-bento-${size}`}
              onClick={() => setView(id)}
            >
              <span className="iface-bento-ico" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="iface-bento-copy">
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
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
        <div className="iface-pack-grid iface-pack-grid-4">
          {THEMES.map((theme) => {
            const active = prefs.theme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`iface-pack${active ? ' active' : ''}`}
                onClick={() => setTheme(theme.id)}
                aria-pressed={active}
              >
                <span
                  className="iface-pack-swatch"
                  style={
                    {
                      background: `linear-gradient(145deg, ${theme.tokens.electric}, ${theme.tokens.cyan} 55%, ${theme.tokens.bg})`,
                      boxShadow: active
                        ? `0 0 0 2px #fff, 0 0 14px ${theme.tokens.electric}`
                        : undefined,
                    } as CSSProperties
                  }
                  aria-hidden
                />
                <span>{theme.label}</span>
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
        <div className="iface-pack-grid iface-pack-grid-4">
          {LAYOUTS.map((layout) => {
            const active = prefs.layout === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                className={`iface-pack${active ? ' active' : ''}`}
                onClick={() => setLayout(layout.id)}
                aria-pressed={active}
                title={layout.description}
              >
                <span
                  className={`iface-pack-swatch iface-schema iface-schema-${layout.schema}`}
                  aria-hidden
                />
                <span>{layout.label}</span>
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
        <div className="iface-pack-grid iface-pack-grid-3">
          {FONTS.map((font) => {
            const active = prefs.font === font.id;
            return (
              <button
                key={font.id}
                type="button"
                className={`iface-pack${active ? ' active' : ''}`}
                onClick={() => setFont(font.id)}
                aria-pressed={active}
                title={font.description}
              >
                <span
                  className="iface-pack-swatch iface-pack-font"
                  style={{ fontFamily: font.display } as CSSProperties}
                  aria-hidden
                >
                  Aa
                </span>
                <span style={{ fontFamily: font.body }}>{font.label}</span>
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
        <div className="iface-pack-grid iface-pack-grid-4">
          {EFFECTS.map((fx) => {
            const on = prefs.effect === fx.id;
            return (
              <button
                key={fx.id}
                type="button"
                className={`iface-pack${on ? ' active' : ''}`}
                onClick={() => toggleEffect(fx.id)}
                aria-pressed={on}
                title={fx.description}
              >
                <span className={`iface-pack-swatch iface-pack-fx${on ? ' on' : ''}`} aria-hidden>
                  <Sparkles size={18} />
                </span>
                <span>{fx.title}</span>
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
            const previewUrl = resolveBgPreview(item.url);
            return (
              <button
                key={slot.id}
                type="button"
                className={`iface-custom-card${active ? ' active' : ''}`}
                onClick={() => setCustomBg(slot.id)}
              >
                <div className="iface-custom-preview">
                  {item.kind === 'video' && previewUrl ? (
                    <video src={previewUrl} muted playsInline autoPlay loop />
                  ) : previewUrl ? (
                    <img
                      className="iface-custom-preview-img"
                      src={previewUrl}
                      alt=""
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (item.url.startsWith('img:') && !el.dataset.retry) {
                          el.dataset.retry = '1';
                          const key = item.url.replace(/^img:/, '');
                          el.src = `/api/images/${encodeURIComponent(key)}`;
                        }
                      }}
                    />
                  ) : (
                    <span className="muted">Loading…</span>
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
            No background uploads yet — mentor can add them in Admin → Profile → Background Manager.
          </p>
        ) : null}
      </>
    );
  } else if (view === 'settings') {
    body = (
      <>
        <p className="muted iface-intro">
          System behaviour and polish. Tool-specific controls stay with their screens.
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
          <div className="iface-advanced-note">
            <strong>Chart Scanner</strong>
            <p className="muted">
              Auto trade, lot size, trades count, and confidence behaviour live on the Scanner
              screen — not in system Settings.
            </p>
          </div>
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
          lines={[
            'Connecting to Unlimited Bull...',
            'License verified.',
            'Operating system online.',
            'AI ready.',
          ]}
        />
      </div>
    </div>,
    document.body,
  );
}
