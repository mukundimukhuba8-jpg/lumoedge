export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (
      fallback !== null &&
      typeof fallback === 'object' &&
      !Array.isArray(fallback) &&
      typeof parsed === 'object'
    ) {
      return { ...fallback, ...parsed } as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Short key: LUMO-XXXX-XXXX-XXXX */
export function makeLicenseKey() {
  const chunk = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return `LUMO-${chunk()}-${chunk()}-${chunk()}`;
}

export function normalizeLicenseKey(key: string) {
  const cleaned = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  const body = cleaned.startsWith('LUMO') ? cleaned.slice(4) : cleaned;
  const parts = body.match(/.{1,4}/g) ?? [];
  return ['LUMO', ...parts.slice(0, 3)].join('-');
}

const VAULT_KEY = 'ub-web/license-vault-v1';

export type VaultLicense = {
  id: string;
  key: string;
  email: string;
  clientName: string;
  eaName: string;
  mainText: string;
  symbols: string[];
  eaImage: string;
  duration: string;
  ownerAdminId: string;
  eaId: string;
  status: 'active' | 'deleted' | 'assigned';
  assignedEmail?: string;
  assignedAt?: string;
};

export function loadVault(): VaultLicense[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVault(entries: VaultLicense[]) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(entries));
}

export function upsertVault(entry: VaultLicense) {
  const all = loadVault();
  const norm = normalizeLicenseKey(entry.key);
  const idx = all.findIndex(
    (e) => e.id === entry.id || normalizeLicenseKey(e.key) === norm,
  );
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  saveVault(all);
  return entry;
}

export function findInVault(key: string): VaultLicense | undefined {
  const norm = normalizeLicenseKey(key);
  if (!norm || norm === 'LUMO') return undefined;
  return loadVault().find((e) => normalizeLicenseKey(e.key) === norm);
}
