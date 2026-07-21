import { ALL_MEDIA_SLOTS, type MentorMediaSlotId } from './mentorMedia';
import { loadJSON, saveJSON } from './storage';

export type LayoutId =
  | 'classic'
  | 'bold'
  | 'minimal'
  | 'expanded'
  | 'dashboard'
  | 'terminal'
  | 'focus'
  | 'vortex'
  | 'phantom'
  | 'apex';

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
  layout: 'classic',
  effect: 'none',
  accent: 'blue',
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
  schema: string;
}[] = [
  { id: 'classic', label: 'Classic', schema: 'classic' },
  { id: 'bold', label: 'Bold', schema: 'bold' },
  { id: 'minimal', label: 'Minimal', schema: 'minimal' },
  { id: 'expanded', label: 'Expanded', schema: 'expanded' },
  { id: 'dashboard', label: 'Dashboard', schema: 'dashboard' },
  { id: 'terminal', label: 'Terminal', schema: 'terminal' },
  { id: 'focus', label: 'Focus', schema: 'focus' },
  { id: 'vortex', label: 'Vortex', schema: 'vortex' },
  { id: 'phantom', label: 'Phantom', schema: 'phantom' },
  { id: 'apex', label: 'Apex', schema: 'apex' },
];

export type LayoutPresetId =
  | 'cyber-neon'
  | 'glass-elite'
  | 'dark-titanium'
  | 'matrix-green'
  | 'midnight-blue'
  | 'aurora'
  | 'obsidian-pro'
  | 'carbon-black'
  | 'ocean-tech'
  | 'neon-purple';

export const LAYOUT_PRESETS: {
  id: LayoutPresetId;
  label: string;
  description: string;
  theme: ThemeId;
  layout: LayoutId;
  effect: EffectId;
  accent: AccentId;
}[] = [
  { id: 'cyber-neon', label: 'Cyber Neon', description: 'Electric blue neon grid', theme: 'cyber-blue', layout: 'classic', effect: 'star-field', accent: 'cyan' },
  { id: 'glass-elite', label: 'Glass Elite', description: 'Frost glass with gold accents', theme: 'arctic-white', layout: 'dashboard', effect: 'none', accent: 'gold' },
  { id: 'dark-titanium', label: 'Dark Titanium', description: 'Industrial silver edges', theme: 'midnight-black', layout: 'terminal', effect: 'trader-night', accent: 'silver' },
  { id: 'matrix-green', label: 'Matrix Green', description: 'Terminal matrix rain', theme: 'matrix-green', layout: 'terminal', effect: 'profit-matrix', accent: 'green' },
  { id: 'midnight-blue', label: 'Midnight Blue', description: 'Deep ocean blues', theme: 'cyber-blue', layout: 'phantom', effect: 'trader-night', accent: 'blue' },
  { id: 'aurora', label: 'Aurora', description: 'Cyan-purple aurora glow', theme: 'neon-purple', layout: 'vortex', effect: 'star-field', accent: 'purple' },
  { id: 'obsidian-pro', label: 'Obsidian Pro', description: 'Pure black pro shell', theme: 'midnight-black', layout: 'apex', effect: 'none', accent: 'white' },
  { id: 'carbon-black', label: 'Carbon Black', description: 'Matte carbon finish', theme: 'midnight-black', layout: 'minimal', effect: 'none', accent: 'silver' },
  { id: 'ocean-tech', label: 'Ocean Tech', description: 'Teal ocean gradients', theme: 'cyber-blue', layout: 'expanded', effect: 'star-field', accent: 'teal' },
  { id: 'neon-purple', label: 'Neon Purple', description: 'Violet neon pulse', theme: 'neon-purple', layout: 'bold', effect: 'fire-mode', accent: 'pink' },
];

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
    layout: LAYOUTS.some((l) => l.id === raw.layout) ? (raw.layout as LayoutId) : DEFAULT_PREFS.layout,
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
