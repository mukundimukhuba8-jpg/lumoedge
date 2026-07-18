export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback) && typeof parsed === 'object') {
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

export type LicensePayload = {
  v: 1;
  id: string;
  email: string;
  eaName: string;
  mainText: string;
  symbols: string[];
  eaImage: string;
  duration: string;
  ownerAdminId: string;
  clientName: string;
};

function toBase64Url(text: string) {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  return decodeURIComponent(escape(atob(pad)));
}

/** Random short display code: LUMO-XXXX-XXXX-XXXX */
export function makeShortLicenseCode() {
  const chunk = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return `LUMO-${chunk()}-${chunk()}-${chunk()}`;
}

/** Self-contained key — works across devices/URLs without shared storage */
export function packLicenseKey(payload: LicensePayload) {
  return `LUMO.${toBase64Url(JSON.stringify(payload))}`;
}

export function unpackLicenseKey(key: string): LicensePayload | null {
  const raw = key.trim();
  if (!raw.toUpperCase().startsWith('LUMO.')) return null;
  try {
    const json = fromBase64Url(raw.slice(5));
    const data = JSON.parse(json) as LicensePayload;
    if (data?.v !== 1 || !data.email || !data.eaName || !data.id) return null;
    return data;
  } catch {
    return null;
  }
}

export function makeLicenseKey() {
  return makeShortLicenseCode();
}

/** Normalize short LUMO-XXXX keys for vault lookup */
export function normalizeLicenseKey(key: string) {
  const trimmed = key.trim();
  // Packed self-contained keys — keep as-is (case-sensitive base64)
  if (trimmed.toUpperCase().startsWith('LUMO.') || trimmed.startsWith('LUMO.')) {
    return trimmed.startsWith('LUMO.') || trimmed.startsWith('lumo.')
      ? `LUMO.${trimmed.slice(5)}`
      : trimmed;
  }
  const cleaned = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  const body = cleaned.startsWith('LUMO') ? cleaned.slice(4) : cleaned;
  const parts = body.match(/.{1,4}/g) ?? [];
  return ['LUMO', ...parts.slice(0, 3)].join('-');
}

const VAULT_KEY = 'ub-web/license-vault-v1';

export type VaultLicense = LicensePayload & {
  key: string;
  shortCode: string;
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
  const idx = all.findIndex(
    (e) => e.id === entry.id || e.shortCode === entry.shortCode || e.key === entry.key,
  );
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  saveVault(all);
  return entry;
}

export function findInVault(keyOrCode: string): VaultLicense | undefined {
  const packed = unpackLicenseKey(keyOrCode);
  const all = loadVault();
  if (packed) {
    return (
      all.find((e) => e.id === packed.id) || {
        ...packed,
        key: packLicenseKey(packed),
        shortCode: makeShortLicenseCode(),
        status: 'active' as const,
      }
    );
  }
  const code = normalizeLicenseKey(keyOrCode);
  return all.find(
    (e) =>
      normalizeLicenseKey(e.shortCode) === code ||
      normalizeLicenseKey(e.key) === code ||
      e.key === keyOrCode.trim(),
  );
}
