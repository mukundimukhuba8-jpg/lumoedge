import { ALL_MEDIA_SLOTS, type MentorMediaSlotId } from './mentorMedia';
import { loadJSON, saveJSON } from './storage';

export type LayoutId =
  | 'ai-core'
  | 'orbital'
  | 'infinite-canvas'
  | 'holographic'
  | 'floating-island'
  | 'reactor'
  | 'cinematic'
  | 'neural'
  | 'glass-layer'
  | 'command-center'
  | 'minimal-luxury'
  | 'zero-gravity'
  | 'prism'
  | 'hex-mesh'
  | 'pulse-wave'
  | 'satellite'
  | 'vault'
  | 'spectrum'
  | 'mecha'
  | 'eclipse';

/** Map legacy layout IDs from older installs into the OS layout set. */
const LEGACY_LAYOUT_MAP: Record<string, LayoutId> = {
  classic: 'ai-core',
  bold: 'reactor',
  minimal: 'minimal-luxury',
  expanded: 'cinematic',
  dashboard: 'command-center',
  terminal: 'mecha',
  focus: 'holographic',
  vortex: 'orbital',
  phantom: 'glass-layer',
  apex: 'eclipse',
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

export type StyleTab = 'themes' | 'layouts' | 'effects' | 'colours' | 'custom' | 'settings';

export type InterfacePrefs = {
  layout: LayoutId;
  effect: EffectId;
  accent: AccentId;
  customBg: CustomBgId;
  theme: ThemeId;
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
  layout: 'ai-core',
  effect: 'star-field',
  accent: 'cyan',
  customBg: 'default',
  theme: 'cyber-blue',
  animations: true,
};

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
  { id: 'ai-core', label: 'AI Core', description: 'Living AI center with orbiting controls', schema: 'ai-core' },
  { id: 'orbital', label: 'Orbital', description: 'Circular rings of actions around the AI', schema: 'orbital' },
  { id: 'infinite-canvas', label: 'Infinite Canvas', description: 'Drag a free-form OS canvas', schema: 'infinite-canvas' },
  { id: 'holographic', label: 'Holographic', description: 'Floating glass panels with glow edges', schema: 'holographic' },
  { id: 'floating-island', label: 'Floating Island', description: 'Independent islands with premium depth', schema: 'floating-island' },
  { id: 'reactor', label: 'Reactor', description: 'Energy core command reactor', schema: 'reactor' },
  { id: 'cinematic', label: 'Cinematic', description: 'Full-bleed AI art with floating controls', schema: 'cinematic' },
  { id: 'neural', label: 'Neural', description: 'Connected neural-net UI nodes', schema: 'neural' },
  { id: 'glass-layer', label: 'Glass Layer', description: 'Parallax translucent layers', schema: 'glass-layer' },
  { id: 'command-center', label: 'Command Center', description: 'Modular control-room panels', schema: 'command-center' },
  { id: 'minimal-luxury', label: 'Minimal Luxury', description: 'Oversized type, invisible chrome', schema: 'minimal-luxury' },
  { id: 'zero-gravity', label: 'Zero Gravity', description: 'Cards drifting at different depths', schema: 'zero-gravity' },
  { id: 'prism', label: 'Prism', description: 'Faceted crystal panels and light splits', schema: 'prism' },
  { id: 'hex-mesh', label: 'Hex Mesh', description: 'Hexagonal tactical lattice', schema: 'hex-mesh' },
  { id: 'pulse-wave', label: 'Pulse Wave', description: 'Waveform-driven action rails', schema: 'pulse-wave' },
  { id: 'satellite', label: 'Satellite', description: 'Telemetry rings and status pods', schema: 'satellite' },
  { id: 'vault', label: 'Vault', description: 'Secure chamber with stacked vault doors', schema: 'vault' },
  { id: 'spectrum', label: 'Spectrum', description: 'Spectrum bars and light-band navigation', schema: 'spectrum' },
  { id: 'mecha', label: 'Mecha', description: 'Armored HUD with industrial modules', schema: 'mecha' },
  { id: 'eclipse', label: 'Eclipse', description: 'Dark eclipse corona around the AI', schema: 'eclipse' },
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
    animations: typeof raw.animations === 'boolean' ? raw.animations : DEFAULT_PREFS.animations,
  };
}

export function saveInterfacePrefs(prefs: InterfacePrefs) {
  saveJSON(KEY, prefs);
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

  root.style.setProperty('--electric', accent);
  root.style.setProperty('--accent-rgb', accentRgb);
  root.style.setProperty('--cyan', theme.cyan);
  root.style.setProperty('--theme-purple', theme.purple);
  root.style.setProperty('--theme-magenta', theme.magenta);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--panel', theme.panel);
  root.style.setProperty('--elevated', theme.elevated);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--card-border', theme.cardBorder);
  root.style.setProperty('--glass-border', theme.cardBorder);
  root.style.setProperty('--theme-glow', theme.glow);
  root.style.setProperty('--glass', theme.panel);
  root.style.setProperty('--input', theme.elevated);

  root.style.background = theme.bg;
  document.body.style.background = theme.bg;
  document.querySelectorAll('.app-shell').forEach((el) => {
    if (el instanceof HTMLElement) el.style.background = theme.bg;
  });
}
