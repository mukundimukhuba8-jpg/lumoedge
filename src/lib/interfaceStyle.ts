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

export type StyleTab = 'layouts' | 'effects' | 'colours' | 'custom';

export type InterfacePrefs = {
  layout: LayoutId;
  effect: EffectId;
  accent: AccentId;
  customBg: CustomBgId;
};

const KEY = 'ub-web/interface-style-v1';

const PREF_LISTENERS = new Set<() => void>();

export const DEFAULT_PREFS: InterfacePrefs = {
  layout: 'classic',
  effect: 'none',
  accent: 'blue',
  customBg: 'default',
};

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
