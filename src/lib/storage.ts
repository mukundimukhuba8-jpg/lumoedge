import type { MentorMediaItem } from './mentorMedia';
import { firebaseUploadDataUrl } from './firebaseDb';
import { isFirebaseConfigured } from './firebase';

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

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(len = 4) {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  }
  return out;
}

/** Short key: LUMO-XXXX-XXXX-XXXX (always 4-char chunks) */
export function makeLicenseKey() {
  return `LUMO-${randomChunk()}-${randomChunk()}-${randomChunk()}`;
}

/** Strip to A-Z0-9 for reliable compare (ignores dashes/spaces) */
export function keyFingerprint(key: string) {
  return key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Map look-alike chars so phone OCR / font mix-ups still match */
export function canonicalKeyFingerprint(key: string) {
  return keyFingerprint(key)
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2')
    .replace(/8/g, '6'); // 8 and 6 often confused on mobile screens
}

export function keysMatch(a: string, b: string) {
  const fa = keyFingerprint(a);
  const fb = keyFingerprint(b);
  if (fa && fb && fa === fb) return true;
  const ca = canonicalKeyFingerprint(a);
  const cb = canonicalKeyFingerprint(b);
  return Boolean(ca && cb && ca === cb);
}

export function normalizeLicenseKey(key: string) {
  const cleaned = keyFingerprint(key);
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
  customMedia?: MentorMediaItem[];
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

/** Local only — used during hydrate so we don't race-overwrite the server */
export function saveVaultLocal(entries: VaultLicense[]) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(entries));
}

export function saveVault(entries: VaultLicense[]) {
  saveVaultLocal(entries);
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
  const idx = all.findIndex(
    (e) => e.id === entry.id || keysMatch(e.key, entry.key),
  );
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  saveVault(all);
  return entry;
}

export function findInVault(key: string): VaultLicense | undefined {
  const fp = keyFingerprint(key);
  if (!fp || fp === 'LUMO') return undefined;
  return loadVault().find((e) => keysMatch(e.key, key));
}

/** Permanently remove a key from the vault (not soft-delete). */
export function removeFromVault(keyOrId: string) {
  const next = loadVault().filter(
    (e) => e.id !== keyOrId && !keysMatch(e.key, keyOrId),
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
    return Array.isArray(parsed)
      ? parsed.map((k) => normalizeLicenseKey(String(k))).filter(Boolean)
      : [];
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

export function saveRevokedKeysLocal(keys: string[]) {
  const unique = [...new Set(keys.map((k) => normalizeLicenseKey(k)).filter(Boolean))];
  localStorage.setItem(REVOKED_KEY, JSON.stringify(unique));
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
  const fp = keyFingerprint(key);
  if (!fp) return false;
  return loadRevokedKeys().some((k) => keyFingerprint(k) === fp);
}

const IMAGE_STORE = 'ub-web/ea-images-v1';

export function imagePublicUrl(id: string) {
  return `/api/images/${encodeURIComponent(id)}`;
}

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
      body: JSON.stringify({ images: { [id]: dataUrl } }),
    }).catch(() => undefined);
    void fetch(imagePublicUrl(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    }).catch(() => undefined);
  } catch {
    // quota — ignore
  }
}

/** Upload profile/EA image and return a stable public URL for client cards */
export async function publishEaImage(id: string, dataUrl: string): Promise<string> {
  if (!id || !dataUrl) return '';
  saveEaImage(id, dataUrl);

  // Prefer Firebase Storage — durable HTTPS URL for every client device
  if (isFirebaseConfigured()) {
    const url = await firebaseUploadDataUrl(`images/${id}.jpg`, dataUrl);
    if (url) return url;
  }

  try {
    const health = await fetch('/api/health')
      .then((r) => r.json())
      .catch(() => null as { durable?: boolean } | null);
    const res = await fetch(imagePublicUrl(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl }),
    });
    if (res.ok && health?.durable) {
      const body = (await res.json()) as { url?: string };
      return body.url || imagePublicUrl(id);
    }
  } catch {
    // fall through
  }
  // Embed compressed data URL so home cards always show the photo
  return dataUrl;
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

/** Resolve stored image refs (/api/images/...) or raw data URLs for display */
export function resolveEaImageUrl(value: string, fallbackIds: string[] = []): string {
  if (value) {
    if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) {
      return value;
    }
  }
  for (const id of fallbackIds) {
    const local = getEaImage(id);
    if (local) return local;
    if (id) return imagePublicUrl(id);
  }
  return value || '';
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
