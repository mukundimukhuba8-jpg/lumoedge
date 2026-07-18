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
  void syncVaultRemote(entries);
}

async function syncVaultRemote(entries: VaultLicense[]) {
  try {
    await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: entries }),
    });
  } catch {
    // static host / offline
  }
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

/** Permanently remove a key from the vault (not soft-delete). */
export function removeFromVault(keyOrId: string) {
  const norm = normalizeLicenseKey(keyOrId);
  const next = loadVault().filter(
    (e) => e.id !== keyOrId && normalizeLicenseKey(e.key) !== norm,
  );
  saveVault(next);
  return next;
}

const REVOKED_KEY = 'ub-web/revoked-keys-v1';

export function loadRevokedKeys(): string[] {
  try {
    const raw = localStorage.getItem(REVOKED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((k) => normalizeLicenseKey(String(k))) : [];
  } catch {
    return [];
  }
}

export function saveRevokedKeys(keys: string[]) {
  const unique = [...new Set(keys.map((k) => normalizeLicenseKey(k)).filter(Boolean))];
  localStorage.setItem(REVOKED_KEY, JSON.stringify(unique));
  void fetch('/api/db', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revokedKeys: unique }),
  }).catch(() => undefined);
}

/** Ban a key forever — deleted keys can never activate again. */
export function revokeLicenseKey(key: string) {
  const norm = normalizeLicenseKey(key);
  if (!norm || norm === 'LUMO') return;
  const all = loadRevokedKeys();
  if (!all.includes(norm)) {
    saveRevokedKeys([norm, ...all]);
  }
  removeFromVault(norm);
}

export function isRevokedKey(key: string) {
  const norm = normalizeLicenseKey(key);
  return Boolean(norm && loadRevokedKeys().includes(norm));
}

const IMAGE_STORE = 'ub-web/ea-images-v1';

/** Keep EA images outside huge JSON blobs so they survive reliably */
export function saveEaImage(id: string, dataUrl: string) {
  if (!id || !dataUrl) return;
  try {
    const all = loadJSON<Record<string, string>>(IMAGE_STORE, {});
    all[id] = dataUrl;
    saveJSON(IMAGE_STORE, all);
    void fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: all }),
    }).catch(() => undefined);
  } catch {
    // quota — ignore
  }
}

export function getEaImage(id: string): string {
  if (!id) return '';
  try {
    const all = loadJSON<Record<string, string>>(IMAGE_STORE, {});
    return all[id] || '';
  } catch {
    return '';
  }
}

/** Compress uploads so profile + license sync fits in localStorage */
export function compressImageFile(file: File, maxSize = 512, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
