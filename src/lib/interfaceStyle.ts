import { ALL_MEDIA_SLOTS, type MentorMediaSlotId } from './mentorMedia';
import { loadJSON, saveJSON } from './storage';

export type LayoutId =
  | 'hero'
  | 'split'
  | 'dominant'
  | 'vertical'
  | 'desktop'
  | 'rail'
  | 'connect'
  | 'pills'
  | 'tiles'
  | 'orbit'
  | 'stack'
  | 'frame';

/** Map legacy layout IDs into the current compositions. */
const LEGACY_LAYOUT_MAP: Record<string, LayoutId> = {
  'full-poster': 'hero',
  'hero-overlay': 'hero',
  classic: 'hero',
  cinematic: 'hero',
  'ai-core': 'hero',
  eclipse: 'hero',
  expanded: 'hero',
  'split-canvas': 'split',
  satellite: 'split',
  magazine: 'split',
  sidebar: 'split',
  layered: 'dominant',
  folded: 'dominant',
  focus: 'dominant',
  phantom: 'dominant',
  holographic: 'dominant',
  'glass-layer': 'dominant',
  timeline: 'vertical',
  editorial: 'vertical',
  neural: 'vertical',
  offset: 'vertical',
  'floating-windows': 'desktop',
  'floating-island': 'desktop',
  'zero-gravity': 'desktop',
  spatial: 'desktop',
  mosaic: 'desktop',
  bold: 'desktop',
  dashboard: 'desktop',
  'command-center': 'desktop',
  rail: 'rail',
  edge: 'rail',
  swiss: 'rail',
  glyph: 'rail',
  console: 'rail',
  terminal: 'rail',
  mecha: 'rail',
  spectrum: 'rail',
  'pulse-wave': 'rail',
  apex: 'rail',
  bento: 'split',
  vortex: 'split',
  orbital: 'split',
  'hex-mesh': 'split',
  carousel: 'vertical',
  'infinite-canvas': 'desktop',
  reactor: 'rail',
  vault: 'dominant',
  prism: 'dominant',
  'minimal-luxury': 'rail',
  minimal: 'rail',
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
  layout: 'hero',
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
    description: 'Electric blue night OS',
    tokens: {
      electric: '#3b82f6',
      cyan: '#22d3ee',
      purple: '#6366f1',
      magenta: '#818cf8',
      bg: '#04060c',
      panel: '#0a101c',
      elevated: '#121a2a',
      border: 'rgba(59,130,246,0.28)',
      cardBorder: 'rgba(59,130,246,0.35)',
      glow: 'rgba(59,130,246,0.35)',
    },
  },
  {
    id: 'neon-purple',
    label: 'Neon Purple',
    description: 'Violet neon cockpit',
    tokens: {
      electric: '#a855f7',
      cyan: '#c084fc',
      purple: '#7c3aed',
      magenta: '#e879f9',
      bg: '#08050f',
      panel: '#120a1c',
      elevated: '#1a1028',
      border: 'rgba(168,85,247,0.3)',
      cardBorder: 'rgba(168,85,247,0.38)',
      glow: 'rgba(168,85,247,0.35)',
    },
  },
  {
    id: 'matrix-green',
    label: 'Matrix Green',
    description: 'Terminal green signal',
    tokens: {
      electric: '#22c55e',
      cyan: '#4ade80',
      purple: '#16a34a',
      magenta: '#86efac',
      bg: '#030806',
      panel: '#07140c',
      elevated: '#0c1c12',
      border: 'rgba(34,197,94,0.28)',
      cardBorder: 'rgba(34,197,94,0.36)',
      glow: 'rgba(34,197,94,0.32)',
    },
  },
  {
    id: 'crimson-red',
    label: 'Crimson Red',
    description: 'Hot signal red',
    tokens: {
      electric: '#ef4444',
      cyan: '#f87171',
      purple: '#b91c1c',
      magenta: '#fb7185',
      bg: '#0a0406',
      panel: '#16080c',
      elevated: '#1f0c12',
      border: 'rgba(239,68,68,0.3)',
      cardBorder: 'rgba(239,68,68,0.38)',
      glow: 'rgba(239,68,68,0.32)',
    },
  },
  {
    id: 'sunset-orange',
    label: 'Sunset Orange',
    description: 'Warm trading dusk',
    tokens: {
      electric: '#f97316',
      cyan: '#fb923c',
      purple: '#ea580c',
      magenta: '#fdba74',
      bg: '#0a0603',
      panel: '#161008',
      elevated: '#20160c',
      border: 'rgba(249,115,22,0.3)',
      cardBorder: 'rgba(249,115,22,0.38)',
      glow: 'rgba(249,115,22,0.32)',
    },
  },
  {
    id: 'arctic-white',
    label: 'Arctic White',
    description: 'Bright frost panels',
    tokens: {
      electric: '#38bdf8',
      cyan: '#7dd3fc',
      purple: '#94a3b8',
      magenta: '#e2e8f0',
      bg: '#0b1220',
      panel: '#111827',
      elevated: '#1e293b',
      border: 'rgba(148,163,184,0.35)',
      cardBorder: 'rgba(226,232,240,0.28)',
      glow: 'rgba(56,189,248,0.28)',
    },
  },
  {
    id: 'midnight-black',
    label: 'Midnight Black',
    description: 'Deep charcoal OS',
    tokens: {
      electric: '#94a3b8',
      cyan: '#cbd5e1',
      purple: '#64748b',
      magenta: '#e2e8f0',
      bg: '#050608',
      panel: '#0c0e12',
      elevated: '#141820',
      border: 'rgba(148,163,184,0.22)',
      cardBorder: 'rgba(148,163,184,0.3)',
      glow: 'rgba(148,163,184,0.22)',
    },
  },
  {
    id: 'gold-elite',
    label: 'Gold Elite',
    description: 'Luxury gold trim',
    tokens: {
      electric: '#f5d76e',
      cyan: '#fde68a',
      purple: '#ca8a04',
      magenta: '#fef3c7',
      bg: '#0a0804',
      panel: '#141008',
      elevated: '#1c160c',
      border: 'rgba(245,215,110,0.28)',
      cardBorder: 'rgba(245,215,110,0.36)',
      glow: 'rgba(245,215,110,0.28)',
    },
  },
];

export const LAYOUTS: {
  id: LayoutId;
  label: string;
  description: string;
  schema: string;
}[] = [
  {
    id: 'hero',
    label: 'Hero',
    description: 'Full-screen hero, circular Start, swipe-up nav',
    schema: 'hero',
  },
  {
    id: 'split',
    label: 'Split',
    description: 'Control column + large hero canvas',
    schema: 'split',
  },
  {
    id: 'dominant',
    label: 'Dominant',
    description: 'Hero top, thick control sheet below',
    schema: 'dominant',
  },
  {
    id: 'vertical',
    label: 'Vertical',
    description: 'Scrolling journey from hero to robots',
    schema: 'vertical',
  },
  {
    id: 'desktop',
    label: 'Desktop',
    description: 'Draggable floating windows',
    schema: 'desktop',
  },
  {
    id: 'rail',
    label: 'Rail',
    description: 'Left icon rail + wide hero canvas',
    schema: 'rail',
  },
  {
    id: 'connect',
    label: 'Connect',
    description: 'Avatar + circular Start + Connect Robot strip',
    schema: 'connect',
  },
  {
    id: 'pills',
    label: 'Pills',
    description: 'Equal Remove / Start / Symbols pill row',
    schema: 'pills',
  },
  {
    id: 'tiles',
    label: 'Tiles',
    description: 'Signals / List / History square grid',
    schema: 'tiles',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    description: 'Glowing circle avatar + mentor chips',
    schema: 'orbit',
  },
  {
    id: 'stack',
    label: 'Stack',
    description: 'Left action stack + right robots panel',
    schema: 'stack',
  },
  {
    id: 'frame',
    label: 'Frame',
    description: 'Framed avatar + equal square controls',
    schema: 'frame',
  },
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
  ];
  const accents: AccentId[] = ['cyan', 'purple', 'green', 'gold', 'silver', 'blue'];
  const effects: EffectId[] = ['star-field', 'none', 'profit-matrix', 'trader-night', 'fire-mode', 'none'];
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

function isCustomBgId(value: unknown): value is CustomBgId {
  if (value === 'default' || value === 'interface-1') return true;
  return typeof value === 'string' && ALL_MEDIA_SLOTS.some((s) => s.id === value);
}

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
  applyInterfaceTheme(prefs);
  PREF_LISTENERS.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
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
  if (prefs.layout !== 'hero') {
    delete root.dataset.dockReveal;
  }

  const font = FONTS.find((f) => f.id === prefs.font) ?? FONTS[0];
  root.style.setProperty('--font-display', font.display);
  root.style.setProperty('--font-body', font.body);
  root.style.setProperty('--os-font-display', font.display);
  root.style.setProperty('--os-font-body', font.body);
  document.body.style.fontFamily = font.body;

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
  root.style.setProperty('--ambient-a', `rgba(${accentRgb}, 0.18)`);
  root.style.setProperty('--ambient-b', `rgba(${accentRgb}, 0.08)`);
  root.style.setProperty('--os-card-border', `rgba(${accentRgb}, 0.28)`);
  root.style.setProperty('--os-glow', `0 0 22px rgba(${accentRgb}, 0.28)`);
  root.style.setProperty('--pink', theme.magenta || theme.purple);
  root.style.setProperty('--os-accent', accent);

  root.style.background = theme.bg;
  document.body.style.background = theme.bg;
  document.querySelectorAll('.app-shell, .os-shell').forEach((el) => {
    if (el instanceof HTMLElement) {
      if (el.classList.contains('os-shell')) {
        el.style.background = 'transparent';
      } else if (el.classList.contains('lumo-app')) {
        el.style.background = theme.bg;
      }
    }
  });
}
