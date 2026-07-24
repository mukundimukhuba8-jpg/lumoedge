import type { MentorMediaItem } from './mentorMedia';
import { isFirebaseConfigured } from './firebase';
import {
  firebaseFetchImage,
  firebaseSaveImage,
  firebaseUploadDataUrl,
  isFirebaseImageRef,
} from './firebaseDb';
import { isPlaceholderMentorImage, looksLikeVideoUrl, normalizeCustomMedia } from './mentorMedia';
import { pushDb } from './remote';

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
  saveJSONSafe(key, value);
}

/** Never throw — trims payload on quota errors (mobile clients). */
export function saveJSONSafe(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    try {
      if (Array.isArray(value)) {
        for (let n = Math.min(value.length, 20); n >= 1; n -= 1) {
          try {
            localStorage.setItem(key, JSON.stringify(value.slice(0, n)));
            return true;
          } catch {
            /* try smaller */
          }
        }
      } else if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        for (let n = entries.length; n >= 1; n -= 1) {
          try {
            localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries.slice(0, n))));
            return true;
          } catch {
            /* try smaller */
          }
        }
      }
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return false;
  }
}

const ADMIN_AUTH_KEY = 'ub-web/admin-auth-v3';
const CLIENT_STORE_KEY = 'ub-web/admin-store-v3';

/** True when a mentor/super admin is logged into the portal on this device. */
export function isAdminPortalSession(): boolean {
  try {
    const raw = localStorage.getItem(ADMIN_AUTH_KEY);
    if (!raw) return false;
    const auth = JSON.parse(raw) as { admin?: { id?: string } | null };
    return Boolean(auth?.admin?.id);
  } catch {
    return false;
  }
}

/** Drop admin-only bulk cache from client phones (prevents quota errors). */
export function pruneClientDeviceStorage() {
  if (isAdminPortalSession()) return;
  try {
    localStorage.removeItem(CLIENT_STORE_KEY);
    const images = loadJSON<Record<string, string>>(IMAGE_STORE, {});
    const slim: Record<string, string> = {};
    for (const [id, url] of Object.entries(images)) {
      if (typeof url !== 'string' || !url) continue;
      const isProfile = id.includes('profile-') || id.startsWith('img:profile-');
      if (url.startsWith('data:') && url.length > 8000 && !isProfile) continue;
      if (url.startsWith('http') || url.startsWith('/') || url.startsWith('img:')) {
        slim[id] = url;
      }
    }
    saveJSONSafe(IMAGE_STORE, slim);
    const vault = loadVault();
    if (vault.length > 1) {
      saveVaultLocal(vault.slice(0, 1));
    }
  } catch {
    /* ignore */
  }
}

/** Strip heavy blobs — vault rows must stay small on client devices. */
export function stripVaultEntryForLocal(entry: VaultLicense): VaultLicense {
  const eaImage = String(entry.eaImage || '').trim();
  let safeImage = eaImage;
  if (eaImage.startsWith('data:') || eaImage.length > 512) {
    safeImage =
      entry.ownerAdminId && !eaImage.startsWith('data:')
        ? eaImage
        : entry.ownerAdminId
          ? `img:profile-${entry.ownerAdminId}`
          : '';
  }
  const ownerId = String(entry.ownerAdminId || '').trim();
  const customMedia = normalizeCustomMedia(entry.customMedia)
    .filter((item) => item.url && !item.url.startsWith('blob:'))
    .map((item) => {
      let url = item.url;
      if (url.startsWith('data:')) {
        url = ownerId ? imagePublicUrl(`${ownerId}-${item.slot}`) : '';
      }
      return url ? { ...item, url } : null;
    })
    .filter((item): item is MentorMediaItem => Boolean(item));
  return {
    ...entry,
    eaImage: safeImage,
    customMedia,
  };
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
  const stripped = entries.map(stripVaultEntryForLocal);
  const attempts = [
    stripped,
    stripped.slice(0, 25),
    stripped.slice(0, 10),
    stripped.slice(0, 3),
    stripped.slice(0, 1),
  ];
  for (const batch of attempts) {
    if (saveJSONSafe(VAULT_KEY, batch)) return;
  }
}

/** Client phones keep only their own license row — never the full mentor vault. */
export function upsertClientVault(entry: VaultLicense, _clientEmail: string) {
  saveVaultLocal([stripVaultEntryForLocal(entry)]);
}

export function saveVault(entries: VaultLicense[]) {
  saveVaultLocal(entries);
  void pushDb({ vault: entries }).catch(() => undefined);
}

export function upsertVault(entry: VaultLicense) {
  const all = loadVault();
  const slim = stripVaultEntryForLocal(entry);
  const idx = all.findIndex(
    (e) => e.id === slim.id || keysMatch(e.key, slim.key),
  );
  if (idx >= 0) all[idx] = slim;
  else all.unshift(slim);
  saveVaultLocal(all);
  void pushDb({ vault: [slim] }).catch(() => undefined);
  return slim;
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

/** Extract storage key from `/api/images/{key}` public URLs. */
export function imageKeyFromPublicUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u.startsWith('/api/images/')) return '';
  try {
    return decodeURIComponent(u.slice('/api/images/'.length));
  } catch {
    return u.slice('/api/images/'.length);
  }
}

/** Resolve mentor media refs to a displayable URL — local cache first. */
export function resolveStoredMediaUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u || isPlaceholderMentorImage(u)) return '';
  if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('http')) return u;
  if (u.startsWith('img:')) {
    const id = u.replace(/^img:/, '');
    return getEaImage(id) || getEaImage(u) || imagePublicUrl(id);
  }
  if (u.startsWith('/api/images/')) {
    const key = imageKeyFromPublicUrl(u);
    const local = key ? getEaImage(key) : '';
    if (local && (local.startsWith('data:') || local.startsWith('blob:') || local.startsWith('http'))) {
      return local;
    }
    return u;
  }
  return u.startsWith('/') ? u : '';
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

/** Upload profile/EA image — Firebase Storage, else RTDB images map, else data URL */
export async function publishEaImage(id: string, dataUrl: string): Promise<string> {
  if (!id || !dataUrl) return '';
  saveEaImage(id, dataUrl);

  if (isFirebaseConfigured()) {
    const hosted = await firebaseUploadDataUrl(`images/${id}.jpg`, dataUrl);
    if (hosted) {
      saveEaImage(id, hosted);
      void pushDbImages(id, hosted);
      return hosted;
    }
    const refId = await firebaseSaveImage(id, dataUrl);
    if (refId) {
      saveEaImage(id, dataUrl);
      saveEaImage(refId, dataUrl);
      void pushDbImages(id, dataUrl);
      // Short ref for shared DB; local cache keeps the displayable data URL
      return refId;
    }
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
  return dataUrl;
}

/** Same cloud sync path as profile EA image — used for backgrounds and custom media. */
export async function publishMentorMediaImage(
  id: string,
  dataUrl: string,
  timeoutMs = 20_000,
): Promise<string> {
  if (!id || !dataUrl) return '';
  saveEaImage(id, dataUrl);
  saveEaImage(`img:${id}`, dataUrl);

  await Promise.race([
    firebaseSaveImage(id, dataUrl),
    new Promise<void>((resolve) => window.setTimeout(resolve, 12_000)),
  ]).catch(() => undefined);

  const published = await Promise.race([
    publishEaImage(id, dataUrl),
    new Promise<string>((resolve) => window.setTimeout(() => resolve(`img:${id}`), timeoutMs)),
  ]);

  if (published.startsWith('img:')) return published;
  if (published.startsWith('http') || published.startsWith('/')) return published;
  return `img:${id}`;
}

async function pushDbImages(id: string, dataUrl: string) {
  try {
    await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: { [id]: dataUrl } }),
    });
  } catch {
    // ignore
  }
  try {
    const { firebasePushDb } = await import('./firebaseDb');
    await firebasePushDb({ images: { [id]: dataUrl } });
  } catch {
    // ignore
  }
}

/** Resolve img: refs / API paths / data URLs to something <img> can display */
/** Remove stock bull/logo art cached in local image store. */
export function purgePlaceholderEaImages() {
  try {
    const all = loadJSON<Record<string, string>>(IMAGE_STORE, {});
    let changed = false;
    for (const [id, value] of Object.entries(all)) {
      if (isPlaceholderMentorImage(id) || isPlaceholderMentorImage(value)) {
        delete all[id];
        changed = true;
      }
    }
    if (changed) saveJSON(IMAGE_STORE, all);
  } catch {
    // ignore
  }
}

/** URLs the browser can load directly — never base64-convert these (videos are huge). */
export function isStreamableMediaUrl(value: string): boolean {
  const v = String(value || '').trim();
  return (
    v.startsWith('http://') ||
    v.startsWith('https://') ||
    v.startsWith('/api/media/') ||
    v.startsWith('/api/images/')
  );
}

export async function resolveDisplayImage(value: string): Promise<string> {
  const v = String(value || '').trim();
  if (!v || isPlaceholderMentorImage(v)) return '';
  if (v.startsWith('data:') || v.startsWith('blob:')) {
    return isPlaceholderMentorImage(v) ? '' : v;
  }
  if (isStreamableMediaUrl(v)) {
    return v;
  }
  if (isFirebaseImageRef(v) || v.startsWith('img:')) {
    const id = v.replace(/^img:/, '');
    const fromLocal = getEaImage(id) || getEaImage(`img:${id}`);
    if (fromLocal && !isPlaceholderMentorImage(fromLocal)) {
      if (isStreamableMediaUrl(fromLocal) || fromLocal.startsWith('data:')) return fromLocal;
    }
    const apiUrl = imagePublicUrl(id);
    void firebaseFetchImage(id).then((fromFb) => {
      if (fromFb && !isPlaceholderMentorImage(fromFb) && !looksLikeVideoUrl(fromFb)) {
        saveEaImage(id, fromFb);
      }
    });
    return apiUrl;
  }
  if (v.startsWith('/api/images/')) {
    return resolveStoredMediaUrl(v);
  }
  return v.startsWith('/') ? v : '';
}

export function getEaImage(id: string): string {
  if (!id) return '';
  try {
    const all = loadJSON<Record<string, string>>(IMAGE_STORE, {});
    const key = id.replace(/^img:/, '');
    const hit = all[id] || all[key] || all[`img:${key}`] || '';
    return hit && !isPlaceholderMentorImage(hit) ? hit : '';
  } catch {
    return '';
  }
}

/** Resolve stored image refs (/api/images/...) or raw data URLs for display */
export function resolveEaImageUrl(value: string, fallbackIds: string[] = []): string {
  if (value && !isPlaceholderMentorImage(value)) {
    if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) {
      return value;
    }
  }
  for (const id of fallbackIds) {
    const local = getEaImage(id);
    if (local) return local;
    if (id) return imagePublicUrl(id);
  }
  return isPlaceholderMentorImage(value) ? '' : value || '';
}

/** Turn a temporary blob preview URL into a data URL for cloud upload. */
export async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image preview'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
