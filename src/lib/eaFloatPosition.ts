/** Persist draggable LIVE float position across sessions. */

const KEY = 'ub-web/ea-float-pos-v1';

export type EaFloatPos = { x: number; y: number };

const SIZE = 64;
const MARGIN = 8;
/** Clearance under iOS status / notch */
const TOP_Y = 56;

export function loadEaFloatPos(): EaFloatPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EaFloatPos;
    if (
      typeof parsed?.x !== 'number' ||
      typeof parsed?.y !== 'number' ||
      Number.isNaN(parsed.x) ||
      Number.isNaN(parsed.y)
    ) {
      return null;
    }
    return clampEaFloatPos(parsed);
  } catch {
    return null;
  }
}

export function saveEaFloatPos(pos: EaFloatPos) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(clampEaFloatPos(pos)));
  } catch {
    // ignore quota
  }
}

/** Default / Start position — top of the screen (user asked for top after Start). */
export function topEaFloatPos(): EaFloatPos {
  if (typeof window === 'undefined') return { x: 14, y: TOP_Y };
  return clampEaFloatPos({
    x: MARGIN + 6,
    y: TOP_Y + (typeof window !== 'undefined' ? 0 : 0),
  });
}

export function defaultEaFloatPos(): EaFloatPos {
  return topEaFloatPos();
}

export function clampEaFloatPos(pos: EaFloatPos): EaFloatPos {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(MARGIN, pos.y)),
  };
}
