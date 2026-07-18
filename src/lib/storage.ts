export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function makeLicenseKey() {
  const chunk = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  // Always LUMO-XXXX-XXXX-XXXX
  return `LUMO-${chunk()}-${chunk()}-${chunk()}`;
}

/** Normalize pasted keys so spacing / case don't break activation */
export function normalizeLicenseKey(key: string) {
  const cleaned = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  // Ensure LUMO prefix
  const body = cleaned.startsWith('LUMO') ? cleaned.slice(4) : cleaned;
  const parts = body.match(/.{1,4}/g) ?? [];
  return ['LUMO', ...parts.slice(0, 3)].join('-');
}
