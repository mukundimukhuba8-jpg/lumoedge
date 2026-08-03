import { ALL_MEDIA_SLOTS, type MentorMediaSlotId } from './mentorMedia';
import { loadJSON, saveJSON } from './storage';

export type LayoutId =
  | 'full-poster'
  | 'magazine'
  | 'bento'
  | 'layered'
  | 'timeline'
  | 'offset'
  | 'sidebar'
  | 'split-canvas'
  | 'hero-overlay'
  | 'mosaic'
  | 'carousel'
  | 'floating-windows'
  | 'folded'
  | 'edge'
  | 'swiss'
  | 'rail'
  | 'editorial'
  | 'glyph'
  | 'spatial'
  | 'console';

/** Map legacy layout IDs into the architecture set. */
const LEGACY_LAYOUT_MAP: Record<string, LayoutId> = {
  classic: 'full-poster',
  bold: 'mosaic',
  minimal: 'swiss',
  expanded: 'hero-overlay',
  dashboard: 'mosaic',
  terminal: 'console',
  focus: 'layered',
  vortex: 'bento',
  phantom: 'layered',
  apex: 'edge',
  'ai-core': 'full-poster',
  orbital: 'bento',
  'infinite-canvas': 'spatial',
  holographic: 'layered',
  'floating-island': 'floating-windows',
  reactor: 'console',
  cinematic: 'full-poster',
  neural: 'timeline',
  'glass-layer': 'layered',
  'command-center': 'mosaic',
  'minimal-luxury': 'swiss',
  'zero-gravity': 'floating-windows',
  prism: 'folded',
  'hex-mesh': 'bento',
  'pulse-wave': 'rail',
  satellite: 'split-canvas',
  vault: 'folded',
  spectrum: 'rail',
  mecha: 'console',
  eclipse: 'hero-overlay',
};

export type EffectId = 'profit-matrix' | 'star-field' | 'fire-mode' | 'trader-night' | 'none';

export type AccentId =
  | 'blue'
  | 'sky'
  | 'purple'
  | 'indigo'
  | 'pink'
  | 'rose'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'gold'
  | 'silver'
  | 'white';

export type CustomBgId = 'default' | 'interface-1' | MentorMediaSlotId;

export type ThemeId =
  | 'cyber-blue'
  | 'neon-purple'
  | 'matrix-green'
  | 'crimson-red'
  | 'sunset-orange'
  | 'arctic-white'
  | 'midnight-black'
  | 'gold-elite';

export type StyleTab =
  | 'themes'
  | 'layouts'
  | 'fonts'
  | 'effects'
  | 'colours'
  | 'custom'
  | 'settings';

export type FontId =
  | 'space'
  | 'orbitron'
  | 'sora'
  | 'inter'
  | 'jetbrains'
  | 'manrope';

export type InterfacePrefs = {
  layout: LayoutId;
  effect: EffectId;
  accent: AccentId;
  customBg: CustomBgId;
  theme: ThemeId;
  font: FontId;
  animations: boolean;
};

export type ThemeTokens = {
  electric: string;
  cyan: string;
  purple: string;
  magenta: string;
  bg: string;
  panel: string;
  elevated: string;
  border: string;
  cardBorder: string;
  glow: string;
};

const KEY = 'ub-web/interface-style-v1';

const PREF_LISTENERS = new Set<() => void>();

export const DEFAULT_PREFS: InterfacePrefs = {
  layout: 'full-poster',
  effect: 'none',
  accent: 'silver',
  customBg: 'default',
  theme: 'midnight-black',
  font: 'space',
  animations: true,
};

export const FONTS: {
  id: FontId;
  label: string;
  description: string;
  display: string;
  body: string;
}[] = [
  {
    id: 'space',
    label: 'Space Grotesk',
    description: 'Clean modern OS default',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
  },
  {
    id: 'orbitron',
    label: 'Orbitron',
    description: 'Futuristic HUD display',
    display: "'Orbitron', 'Space Grotesk', sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
  },
  {
    id: 'sora',
    label: 'Sora',
    description: 'Soft premium geometric',
    display: "'Sora', 'Space Grotesk', sans-serif",
    body: "'Sora', 'Space Grotesk', sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    description: 'Neutral product UI',
    display: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    description: 'Terminal / lab console',
    display: "'JetBrains Mono', ui-monospace, monospace",
    body: "'JetBrains Mono', ui-monospace, monospace",
  },
  {
    id: 'manrope',
    label: 'Manrope',
    description: 'Elegant minimal luxury',
    display: "'Manrope', 'Space Grotesk', sans-serif",
    body: "'Manrope', 'Space Grotesk', sans-serif",
  },
];

export const THEMES: {
  id: ThemeId;
  label: string;
  description: string;
  tokens: ThemeTokens;
}[] = [
  {
    id: 'cyber-blue',
    label: 'Cyber Blue',
    description: 'Electric blue neon — default Lumo Edge.',
    tokens: {
      electric: '#3b82f6',
      cyan: '#22d3ee',
      purple: '#6366f1',
      magenta: '#ec4899',
      bg: '#06080f',
      panel: '#0e1220',
      elevated: '#121828',
      border: 'rgba(59, 130, 246, 0.35)',
      cardBorder: 'rgba(34, 211, 238, 0.45)',
      glow: 'rgba(59, 130, 246, 0.35)',
    },
  },
  {
    id: 'neon-purple',
    label: 'Neon Purple',
    description: 'Violet pulse with magenta highlights.',
    tokens: {
      electric: '#a855f7',
      cyan: '#c084fc',
      purple: '#7c3aed',
      magenta: '#f472b6',
      bg: '#08060f',
      panel: '#120e1e',
      elevated: '#181028',
      border: 'rgba(168, 85, 247, 0.38)',
      cardBorder: 'rgba(192, 132, 252, 0.5)',
      glow: 'rgba(168, 85, 247, 0.38)',
    },
  },
  {
    id: 'matrix-green',
    label: 'Matrix Green',
    description: 'Terminal green on deep black.',
    tokens: {
      electric: '#22c55e',
      cyan: '#4ade80',
      purple: '#16a34a',
      magenta: '#86efac',
      bg: '#030806',
      panel: '#07100c',
      elevated: '#0a1610',
      border: 'rgba(34, 197, 94, 0.35)',
      cardBorder: 'rgba(74, 222, 128, 0.45)',
      glow: 'rgba(34, 197, 94, 0.35)',
    },
  },
  {
    id: 'crimson-red',
    label: 'Crimson Red',
    description: 'Aggressive red heat with pink accents.',
    tokens: {
      electric: '#ef4444',
      cyan: '#f87171',
      purple: '#dc2626',
      magenta: '#fb7185',
      bg: '#0a0608',
      panel: '#140c10',
      elevated: '#1a1014',
      border: 'rgba(239, 68, 68, 0.38)',
      cardBorder: 'rgba(248, 113, 113, 0.48)',
      glow: 'rgba(239, 68, 68, 0.35)',
    },
  },
  {
    id: 'sunset-orange',
    label: 'Sunset Orange',
    description: 'Warm amber glow with coral edges.',
    tokens: {
      electric: '#f97316',
      cyan: '#fdba74',
      purple: '#ea580c',
      magenta: '#fb923c',
      bg: '#0a0806',
      panel: '#141008',
      elevated: '#1a140c',
      border: 'rgba(249, 115, 22, 0.38)',
      cardBorder: 'rgba(253, 186, 116, 0.48)',
      glow: 'rgba(249, 115, 22, 0.35)',
    },
  },
  {
    id: 'arctic-white',
    label: 'Arctic White',
    description: 'Cool frost white with icy cyan.',
    tokens: {
      electric: '#e2e8f0',
      cyan: '#67e8f9',
      purple: '#94a3b8',
      magenta: '#cbd5e1',
      bg: '#0a0c10',
      panel: '#12161e',
      elevated: '#161c28',
      border: 'rgba(226, 232, 240, 0.22)',
      cardBorder: 'rgba(103, 232, 249, 0.42)',
      glow: 'rgba(103, 232, 249, 0.28)',
    },
  },
  {
    id: 'midnight-black',
    label: 'Midnight Black',
    description: 'Pure obsidian with subtle silver edges.',
    tokens: {
      electric: '#64748b',
      cyan: '#94a3b8',
      purple: '#475569',
      magenta: '#cbd5e1',
      bg: '#020204',
      panel: '#08080c',
      elevated: '#0c0c12',
      border: 'rgba(148, 163, 184, 0.22)',
      cardBorder: 'rgba(148, 163, 184, 0.35)',
      glow: 'rgba(100, 116, 139, 0.25)',
    },
  },
  {
    id: 'gold-elite',
    label: 'Gold Elite',
    description: 'Premium gold with amber neon.',
    tokens: {
      electric: '#f5d76e',
      cyan: '#fde68a',
      purple: '#d97706',
      magenta: '#fbbf24',
      bg: '#0a0804',
      panel: '#141008',
      elevated: '#1a1408',
      border: 'rgba(245, 215, 110, 0.35)',
      cardBorder: 'rgba(253, 230, 138, 0.48)',
      glow: 'rgba(245, 215, 110, 0.32)',
    },
  },
];

function isCustomBgId(v: unknown): v is CustomBgId {
  if (v === 'default' || v === 'interface-1') return true;
  return ALL_MEDIA_SLOTS.some((s) => s.id === v);
}

export const LAYOUTS: {
  id: LayoutId;
  label: string;
  description: string;
  schema: string;
}[] = [
  { id: 'full-poster', label: 'Full Screen Poster', description: '70% hero poster with floating UI', schema: 'full-poster' },
  { id: 'magazine', label: 'Magazine', description: 'Asymmetric editorial blocks', schema: 'magazine' },
  { id: 'bento', label: 'Bento Grid', description: 'Uneven Apple-style tiles', schema: 'bento' },
  { id: 'layered', label: 'Layered', description: 'Overlapping depth layers', schema: 'layered' },
  { id: 'timeline', label: 'Vertical Timeline', description: 'Journey-style checkpoints', schema: 'timeline' },
  { id: 'offset', label: 'Offset', description: 'Intentionally unbalanced art layout', schema: 'offset' },
  { id: 'sidebar', label: 'Sidebar Mobile', description: 'Left rail + content column', schema: 'sidebar' },
  { id: 'split-canvas', label: 'Split Canvas', description: 'Unequal two-panel split', schema: 'split-canvas' },
  { id: 'hero-overlay', label: 'Hero Overlay', description: 'Massive art with invisible chrome', schema: 'hero-overlay' },
  { id: 'mosaic', label: 'Dashboard Mosaic', description: 'Mixed-height dashboard tiles', schema: 'mosaic' },
  { id: 'carousel', label: 'Carousel', description: 'Horizontal swipe sections', schema: 'carousel' },
  { id: 'floating-windows', label: 'Floating Windows', description: 'Desktop-like floating panels', schema: 'floating-windows' },
  { id: 'folded', label: 'Folded', description: 'Overlapping folded sections', schema: 'folded' },
  { id: 'edge', label: 'Edge', description: 'Content hugging screen edges', schema: 'edge' },
  { id: 'swiss', label: 'Swiss Minimal', description: 'Huge type and whitespace', schema: 'swiss' },
  { id: 'rail', label: 'Control Rail', description: 'Bottom action rail + tall hero', schema: 'rail' },
  { id: 'editorial', label: 'Editorial Strip', description: 'Stripe-like product narrative', schema: 'editorial' },
  { id: 'glyph', label: 'Glyph Sparse', description: 'Nothing OS sparse glyph grid', schema: 'glyph' },
  { id: 'spatial', label: 'Spatial Deck', description: 'Arc-like spatial panels', schema: 'spatial' },
  { id: 'console', label: 'Console Mosaic', description: 'PlayStation / Xbox tile board', schema: 'console' },
];

/** @deprecated Presets now mirror LAYOUTS — kept for older callers. */
export type LayoutPresetId = LayoutId;

export const LAYOUT_PRESETS: {
  id: LayoutPresetId;
  label: string;
  description: string;
  theme: ThemeId;
  layout: LayoutId;
  effect: EffectId;
  accent: AccentId;
}[] = LAYOUTS.map((layout, i) => {
  const themes: ThemeId[] = [
    'cyber-blue',
    'neon-purple',
    'matrix-green',
    'arctic-white',
    'midnight-black',
    'gold-elite',
    'crimson-red',
    'sunset-orange',
  ];
  const accents: AccentId[] = [
    'cyan',
    'purple',
    'green',
    'gold',
    'silver',
    'blue',
    'pink',
    'teal',
    'orange',
    'white',
  ];
  const effects: EffectId[] = [
    'star-field',
    'none',
    'profit-matrix',
    'trader-night',
    'fire-mode',
  ];
  return {
    id: layout.id,
    label: layout.label,
    description: layout.description,
    theme: themes[i % themes.length],
    layout: layout.id,
    effect: effects[i % effects.length],
    accent: accents[i % accents.length],
  };
});

export function applyLayoutPreset(presetId: LayoutPresetId, base?: InterfacePrefs): InterfacePrefs {
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  const current = base ?? loadInterfacePrefs();
  if (!preset) return current;
  return {
    ...current,
    theme: preset.theme,
    layout: preset.layout,
    effect: preset.effect,
    accent: preset.accent,
    font: current.font,
  };
}

export function resolveLayoutId(raw: unknown): LayoutId {
  if (typeof raw === 'string' && LAYOUTS.some((l) => l.id === raw)) {
    return raw as LayoutId;
  }
  if (typeof raw === 'string' && LEGACY_LAYOUT_MAP[raw]) {
    return LEGACY_LAYOUT_MAP[raw];
  }
  return DEFAULT_PREFS.layout;
}

export const EFFECTS: {
  id: Exclude<EffectId, 'none'>;
  title: string;
  description: string;
}[] = [
  { id: 'profit-matrix', title: 'Profit Matrix', description: 'Falling green code rain.' },
  { id: 'star-field', title: 'Star Field', description: 'Drifting stars + shooting stars.' },
  { id: 'fire-mode', title: 'Fire Mode', description: 'Flame edges + heat glow.' },
  { id: 'trader-night', title: 'Trader Night', description: 'Dark vignette + subtle grid.' },
];

export const ACCENTS: { id: AccentId; label: string; hex: string }[] = [
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'sky', label: 'Sky', hex: '#38bdf8' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'yellow', label: 'Yellow', hex: '#eab308' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'gold', label: 'Gold', hex: '#f5d76e' },
  { id: 'silver', label: 'Silver', hex: '#94a3b8' },
  { id: 'white', label: 'White', hex: '#f8fafc' },
];

export function loadInterfacePrefs(): InterfacePrefs {
  const raw = loadJSON<Partial<InterfacePrefs> | null>(KEY, null);
  if (!raw) return { ...DEFAULT_PREFS };
  return {
    layout: resolveLayoutId(raw.layout),
    effect: [...EFFECTS.map((e) => e.id), 'none'].includes(raw.effect as EffectId)
      ? (raw.effect as EffectId)
      : DEFAULT_PREFS.effect,
    accent: ACCENTS.some((a) => a.id === raw.accent) ? (raw.accent as AccentId) : DEFAULT_PREFS.accent,
    customBg: isCustomBgId(raw.customBg) ? raw.customBg : DEFAULT_PREFS.customBg,
    theme: THEMES.some((t) => t.id === raw.theme) ? (raw.theme as ThemeId) : DEFAULT_PREFS.theme,
    font: FONTS.some((f) => f.id === raw.font) ? (raw.font as FontId) : DEFAULT_PREFS.font,
    animations: typeof raw.animations === 'boolean' ? raw.animations : DEFAULT_PREFS.animations,
  };
}

export function saveInterfacePrefs(prefs: InterfacePrefs) {
  saveJSON(KEY, prefs);
  // Apply tokens immediately so accent/theme updates feel instant.
  applyInterfaceTheme(prefs);
  PREF_LISTENERS.forEach((cb) => cb());
}

export function subscribeInterfacePrefs(cb: () => void) {
  PREF_LISTENERS.add(cb);
  return () => {
    PREF_LISTENERS.delete(cb);
  };
}

export function accentHex(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.hex ?? '#3b82f6';
}

/** Soft RGB glow string for box-shadows from hex */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function themeTokens(id: ThemeId): ThemeTokens {
  return THEMES.find((t) => t.id === id)?.tokens ?? THEMES[0].tokens;
}

/** Apply theme + accent tokens to the document root (UI-only, no API calls). */
export function applyInterfaceTheme(prefs: InterfacePrefs = loadInterfacePrefs()) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = themeTokens(prefs.theme);
  const accent = accentHex(prefs.accent);
  const accentRgb = hexToRgb(accent);

  root.dataset.theme = prefs.theme;
  root.dataset.animations = prefs.animations ? 'on' : 'off';
  root.dataset.effect = prefs.effect;
  root.dataset.layout = prefs.layout;
  root.dataset.font = prefs.font;
  root.dataset.accent = prefs.accent;

  const font = FONTS.find((f) => f.id === prefs.font) ?? FONTS[0];
  root.style.setProperty('--font-display', font.display);
  root.style.setProperty('--font-body', font.body);
  root.style.setProperty('--os-font-display', font.display);
  root.style.setProperty('--os-font-body', font.body);
  document.body.style.fontFamily = font.body;

  // Accent drives chrome identity across the whole OS.
  root.style.setProperty('--electric', accent);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', accentRgb);
  root.style.setProperty('--accent-soft', `rgba(${accentRgb}, 0.14)`);
  root.style.setProperty('--accent-soft-2', `rgba(${accentRgb}, 0.22)`);
  root.style.setProperty('--accent-glow', `rgba(${accentRgb}, 0.42)`);
  root.style.setProperty('--accent-glow-soft', `rgba(${accentRgb}, 0.22)`);
  root.style.setProperty('--accent-border', `rgba(${accentRgb}, 0.42)`);
  root.style.setProperty('--accent-wash', `rgba(${accentRgb}, 0.08)`);
  root.style.setProperty('--accent-shadow', `0 0 22px rgba(${accentRgb}, 0.35)`);
  root.style.setProperty('--cyan', accent);
  root.style.setProperty('--theme-purple', theme.purple);
  root.style.setProperty('--theme-magenta', theme.magenta);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--panel', theme.panel);
  root.style.setProperty('--elevated', theme.elevated);
  root.style.setProperty('--border', `rgba(${accentRgb}, 0.28)`);
  root.style.setProperty('--card-border', `rgba(${accentRgb}, 0.34)`);
  root.style.setProperty('--glass-border', `rgba(${accentRgb}, 0.3)`);
  root.style.setProperty('--theme-glow', `rgba(${accentRgb}, 0.35)`);
  root.style.setProperty('--glass', theme.panel);
  root.style.setProperty('--input', theme.elevated);
  root.style.setProperty(
    '--ambient-a',
    `rgba(${accentRgb}, 0.18)`,
  );
  root.style.setProperty(
    '--ambient-b',
    `rgba(${accentRgb}, 0.08)`,
  );

  root.style.background = theme.bg;
  document.body.style.background = theme.bg;
  document.querySelectorAll('.app-shell').forEach((el) => {
    if (el instanceof HTMLElement) el.style.background = theme.bg;
  });
}
