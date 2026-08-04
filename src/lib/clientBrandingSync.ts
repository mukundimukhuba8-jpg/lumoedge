/** Pull mentor branding from cloud for licensed clients — no license key writes. */

import type { LicenseSync } from '../context/AppContext';
import { dbList, firebaseFetchImage } from './firebaseDb';
import {
  isPlaceholderMentorImage,
  isGenericLumoLabel,
  normalizeCustomMedia,
  type MentorMediaItem,
  type MentorMediaSlotId,
} from './mentorMedia';
import { fetchDb } from './remote';
import {
  findInVault,
  getEaImage,
  imagePublicUrl,
  isStreamableMediaUrl,
  keysMatch,
  loadJSON,
  normalizeLicenseKey,
  saveEaImage,
  type VaultLicense,
} from './storage';

const IMAGE_STORE = 'ub-web/ea-images-v1';

type VaultLike = {
  key?: string;
  status?: string;
  ownerAdminId?: string;
  eaId?: string;
  eaName?: string;
  mainText?: string;
  symbols?: string[];
  customMedia?: unknown[];
};

/** Union media slots — later sources fill empty slots / refresh urls. */
export function mergeCustomMedia(...sources: unknown[]): MentorMediaItem[] {
  const map = new Map<MentorMediaSlotId, MentorMediaItem>();
  for (const src of sources) {
    for (const item of normalizeCustomMedia(src)) {
      if (!item.url) continue;
      const prev = map.get(item.slot);
      // Prefer non-empty, prefer http/data over bare img: when both exist
      if (!prev) {
        map.set(item.slot, item);
        continue;
      }
      const prevWeak = prev.url.startsWith('img:') || prev.url.startsWith('/api/images/');
      const nextStrong =
        item.url.startsWith('http') ||
        item.url.startsWith('data:') ||
        item.url.startsWith('blob:');
      if (prevWeak && nextStrong) map.set(item.slot, item);
      else if (!prev.url) map.set(item.slot, item);
      else map.set(item.slot, item);
    }
  }
  return [...map.values()];
}

function mediaKeyFromUrl(url: string, ownerAdminId?: string, slot?: string): string {
  const u = String(url || '').trim();
  if (u.startsWith('img:')) return u.replace(/^img:/, '');
  if (u.startsWith('/api/images/')) {
    try {
      return decodeURIComponent(u.replace('/api/images/', '').split('?')[0]);
    } catch {
      return u.replace('/api/images/', '').split('?')[0];
    }
  }
  if (ownerAdminId && slot) return `${ownerAdminId}-${slot}`;
  return '';
}

/** Pull background/profile bytes onto the client so Settings previews can render. */
export async function hydrateCustomMediaImages(
  media: MentorMediaItem[] | undefined,
  ownerAdminId?: string,
  dbImages?: Record<string, string>,
): Promise<MentorMediaItem[]> {
  const list = normalizeCustomMedia(media);
  if (!list.length) return list;

  const out: MentorMediaItem[] = [];
  for (const item of list) {
    let url = String(item.url || '').trim();
    if (!url) continue;

    const key = mediaKeyFromUrl(url, ownerAdminId, item.slot);
    const fromMap =
      (key && (dbImages?.[key] || dbImages?.[`img:${key}`])) ||
      (key && (getEaImage(key) || getEaImage(`img:${key}`))) ||
      '';

    if (fromMap && (fromMap.startsWith('data:') || isStreamableMediaUrl(fromMap))) {
      if (key) saveEaImage(key, fromMap);
      out.push({ ...item, url: fromMap.startsWith('data:') ? (key ? `img:${key}` : url) : fromMap });
      continue;
    }

    if (key) {
      const fromFb = await firebaseFetchImage(key).catch(() => '');
      if (fromFb && !isPlaceholderMentorImage(fromFb)) {
        saveEaImage(key, fromFb);
        out.push({
          ...item,
          url:
            fromFb.startsWith('http') || fromFb.startsWith('/')
              ? fromFb
              : `img:${key}`,
        });
        continue;
      }
      // Keep a fetchable public URL so <img> / CSS backgrounds still try the API
      if (url.startsWith('img:')) url = imagePublicUrl(key);
      else if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:')) {
        url = imagePublicUrl(key);
      }
    }

    out.push({ ...item, url });
  }
  return out;
}

type WorkspaceBag = {
  licenses?: VaultLike[];
  profile?: Record<string, unknown>;
  eas?: Array<{ id: string; name?: string; symbols?: string[] }>;
};

function workspaceMap(
  db: NonNullable<Awaited<ReturnType<typeof fetchDb>>>,
): Record<string, WorkspaceBag> {
  if (!db.store?.workspaces || typeof db.store.workspaces !== 'object') return {};
  return db.store.workspaces as Record<string, WorkspaceBag>;
}

function attachWorkspace(
  entry: VaultLike | null,
  db: NonNullable<Awaited<ReturnType<typeof fetchDb>>>,
): (VaultLike & { _ws?: WorkspaceBag }) | null {
  if (!entry) return null;
  const workspaces = workspaceMap(db);
  const ownerId = String(entry.ownerAdminId || '');
  // Prefer owner workspace; fall back to scanning licenses
  if (ownerId && workspaces[ownerId]) {
    return { ...entry, _ws: workspaces[ownerId] };
  }
  for (const ws of Object.values(workspaces)) {
    const hit = (ws.licenses || []).find(
      (l) => keysMatch(String(l?.key || ''), String(entry.key || '')) && l?.status !== 'deleted',
    );
    if (hit) return { ...entry, ...hit, _ws: ws };
  }
  return entry;
}

function findLicenseEntry(
  db: NonNullable<Awaited<ReturnType<typeof fetchDb>>>,
  key: string,
): (VaultLike & { _ws?: WorkspaceBag }) | null {
  // Always attach mentor workspace so profile.customMedia / names are available
  // even when the vault row is found first (previously skipped _ws attach).
  for (const v of dbList<VaultLike>(db.vault)) {
    if (keysMatch(String(v?.key || ''), key) && v?.status !== 'deleted') {
      return attachWorkspace(v, db);
    }
  }
  const workspaces = workspaceMap(db);
  for (const ws of Object.values(workspaces)) {
    const hit = (ws.licenses || []).find(
      (l) => keysMatch(String(l?.key || ''), key) && l?.status !== 'deleted',
    );
    if (hit) return { ...hit, _ws: ws };
  }
  return null;
}

function brandingFromVault(vaultHit: VaultLicense, imageUrl: string): LicenseSync {
  const eaName = isGenericLumoLabel(vaultHit.eaName) ? '' : String(vaultHit.eaName || '');
  return {
    name: eaName || 'Lumo Edge',
    displayName: eaName || 'Lumo Edge',
    mainText: String(vaultHit.mainText || ''),
    symbols: vaultHit.symbols?.length ? vaultHit.symbols : ['XAUUSD'],
    customMedia: normalizeCustomMedia(vaultHit.customMedia),
    imageUrl,
  };
}

function enrichBrandingFromWorkspace(
  base: LicenseSync,
  raw: (VaultLike & { _ws?: { profile?: Record<string, unknown>; eas?: Array<{ id: string; name?: string; symbols?: string[] }> } }) | null,
): LicenseSync {
  if (!raw) return base;
  const ws = raw._ws;
  const ownerEa = ws?.eas?.find((e) => e.id === raw.eaId);
  const eaName = isGenericLumoLabel(base.displayName)
    ? String(raw.eaName || ownerEa?.name || ws?.profile?.eaDisplayName || '')
    : String(base.displayName || '');
  const mainText = base.mainText || String(raw.mainText || ws?.profile?.mainText || '');
  // Merge vault + license + mentor profile so background slots are never dropped
  // when the vault only has profile photos.
  const customMedia = mergeCustomMedia(
    base.customMedia,
    raw.customMedia,
    ws?.profile?.customMedia,
  );
  return {
    ...base,
    name: eaName || base.name,
    displayName: eaName || base.displayName,
    mainText,
    symbols:
      base.symbols?.length && base.symbols[0] !== 'XAUUSD'
        ? base.symbols
        : Array.isArray(raw.symbols) && raw.symbols.length
          ? raw.symbols
          : ownerEa?.symbols?.length
            ? ownerEa.symbols
            : base.symbols,
    customMedia,
  };
}

/** Fast path — local vault + cached/API URL, no full fetchDb wait. */
async function resolveMentorImage(
  mentorId: string,
  dbImages?: Record<string, string>,
): Promise<string> {
  if (!mentorId) return '';
  const profileKey = `profile-${mentorId}`;
  const cached = getEaImage(profileKey) || getEaImage(`img:${profileKey}`);
  if (cached && !isPlaceholderMentorImage(cached)) {
    if (isStreamableMediaUrl(cached) || cached.startsWith('data:')) return cached;
  }

  const fromMap =
    dbImages?.[profileKey] ||
    dbImages?.[`img:${profileKey}`] ||
    dbImages?.[mentorId] ||
    '';
  if (fromMap && !isPlaceholderMentorImage(fromMap)) {
    if (isStreamableMediaUrl(fromMap) || fromMap.startsWith('data:')) return fromMap;
  }

  const apiUrl = `/api/images/${encodeURIComponent(profileKey)}`;

  void firebaseFetchImage(profileKey).then((fromFb) => {
    if (fromFb && !isPlaceholderMentorImage(fromFb)) {
      saveEaImage(profileKey, fromFb);
    }
  });

  return apiUrl;
}

/** Read mentor branding for an activated client — never mutates license keys. */
export async function fetchClientBranding(licenseKey: string): Promise<LicenseSync | null> {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  if (!normalizedKey) return null;

  const localImages = loadJSON<Record<string, string>>(IMAGE_STORE, {});
  const vaultHit = findInVault(normalizedKey);
  if (vaultHit && vaultHit.ownerAdminId) {
    const imageUrl = await resolveMentorImage(vaultHit.ownerAdminId, localImages);
    const db = await fetchDb();
    const dbImages =
      db?.images && typeof db.images === 'object'
        ? { ...localImages, ...(db.images as Record<string, string>) }
        : localImages;
    const raw = db ? findLicenseEntry(db, normalizedKey) : null;
    const ownerWs = db ? workspaceMap(db)[vaultHit.ownerAdminId] : undefined;
    const base = brandingFromVault(vaultHit, imageUrl);
    // Force-merge mentor profile media even if vault short-circuit missed _ws
    const enriched = enrichBrandingFromWorkspace(base, raw || { ...vaultHit, _ws: ownerWs });
    const withProfileMedia = {
      ...enriched,
      customMedia: mergeCustomMedia(
        enriched.customMedia,
        ownerWs?.profile?.customMedia,
        vaultHit.customMedia,
      ),
      displayName:
        (!isGenericLumoLabel(enriched.displayName) && enriched.displayName) ||
        String(ownerWs?.profile?.eaDisplayName || '') ||
        enriched.displayName,
      mainText:
        enriched.mainText ||
        String(ownerWs?.profile?.mainText || '') ||
        '',
    };
    const customMedia = await hydrateCustomMediaImages(
      withProfileMedia.customMedia,
      vaultHit.ownerAdminId,
      dbImages,
    );
    return { ...withProfileMedia, customMedia };
  }

  const db = await fetchDb();
  if (!db) return null;

  const raw = findLicenseEntry(db, normalizedKey);
  if (!raw) return null;

  const ws = (raw as VaultLike & { _ws?: { profile?: Record<string, unknown>; eas?: Array<{ id: string; name?: string; symbols?: string[] }> } })._ws;
  const mentorId = String(raw.ownerAdminId || '');
  const ownerEa = ws?.eas?.find((e) => e.id === raw.eaId);
  const dbImages =
    db.images && typeof db.images === 'object'
      ? { ...localImages, ...(db.images as Record<string, string>) }
      : localImages;
  const imageUrl = await resolveMentorImage(mentorId, dbImages);

  const eaName = String(raw.eaName || ownerEa?.name || ws?.profile?.eaDisplayName || '');
  const customMedia = await hydrateCustomMediaImages(
    mergeCustomMedia(raw.customMedia, ws?.profile?.customMedia),
    mentorId,
    dbImages,
  );
  return {
    name: eaName,
    displayName: eaName,
    mainText: String(raw.mainText || ws?.profile?.mainText || ''),
    symbols:
      Array.isArray(raw.symbols) && raw.symbols.length
        ? raw.symbols
        : ownerEa?.symbols?.length
          ? ownerEa.symbols
          : ['XAUUSD'],
    customMedia,
    imageUrl,
  };
}

export async function resolveBrandingImageUrl(imageUrl: string): Promise<string> {
  const raw = String(imageUrl || '').trim();
  if (!raw || isPlaceholderMentorImage(raw)) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:') || isStreamableMediaUrl(raw)) {
    return raw;
  }
  const { resolveDisplayImage } = await import('./storage');
  if (raw.startsWith('img:') || raw.startsWith('/api/images/')) {
    return resolveDisplayImage(raw);
  }
  return raw;
}
