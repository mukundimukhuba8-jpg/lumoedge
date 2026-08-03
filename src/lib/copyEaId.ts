const COPY_EA_KEY = 'ub-web/copy-ea-id-v1';

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COPY_EA_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>) {
  localStorage.setItem(COPY_EA_KEY, JSON.stringify(map));
}

function randomSegment() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Stable Copy EA ID for this license — used by the MT5 VPS script. */
export function getOrCreateCopyEaId(licenseKey: string): string {
  const key = licenseKey.trim().toUpperCase();
  if (!key) return '';
  const map = loadMap();
  if (map[key]) return map[key];
  const id = `CT-${randomSegment()}`;
  map[key] = id;
  saveMap(map);
  return id;
}

export function getCopyEaId(licenseKey: string): string {
  const key = licenseKey.trim().toUpperCase();
  return loadMap()[key] || '';
}
