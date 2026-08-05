/** Pull mentor branding from cloud for licensed clients — no license key writes. */

import type { LicenseSync } from '../context/AppContext';
import { dbList, firebaseFetchWorkspace } from './firebaseDb';
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
  normalizeLicenseKey,
  type VaultLicense,
} from './storage';

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

function urlStrength(url: string): number {
  const u = String(url || '').trim();
  if (u.startsWith('https://') || u.startsWith('http://')) return 5;
  if (u.startsWith('/api/media/')) return 4;
  if (u.startsWith('/api/images/')) return 4;
  if (u.startsWith('blob:')) return 3;
  if (u.startsWith('data:')) return 2;
  if (u.startsWith('img:')) return 1;
  return 0;
}

/** Union media slots — prefer stronger/streamable URLs to avoid remount churn. */
export function mergeCustomMedia(...sources: unknown[]): MentorMediaItem[] {
  const map = new Map<MentorMediaSlotId, MentorMediaItem>();
  for (const src of sources) {
    for (const item of normalizeCustomMedia(src)) {
      if (!item.url) continue;
      const prev = map.get(item.slot);
      if (!prev) {
        map.set(item.slot, item);
        continue;
      }
      if (urlStrength(item.url) >= urlStrength(prev.url)) {
        map.set(item.slot, item);
      }
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
  if (u.startsWith('/api/media/')) {
    try {
      return decodeURIComponent(u.replace('/api/media/', '').split('?')[0]);
    } catch {
      return u.replace('/api/media/', '').split('?')[0];
    }
  }
  if (ownerAdminId && slot) return `${ownerAdminId}-${slot}`;
  return '';
}

/**
 * Resolve media to streamable URLs for client phones.
 * NEVER firebaseFetch / saveEaImage base64 blobs here — that froze taps after re-login
 * on small phones (Gunner Scalper Pro and other branded mentors).
 */
export async function hydrateCustomMediaImages(
  media: MentorMediaItem[] | undefined,
  ownerAdminId?: string,
  _dbImages?: Record<string, string>,
): Promise<MentorMediaItem[]> {
  const list = normalizeCustomMedia(media);
  if (!list.length) return list;

  const out: MentorMediaItem[] = [];
  for (const item of list) {
    let url = String(item.url || '').trim();
    if (!url) continue;

    const key = mediaKeyFromUrl(url, ownerAdminId, item.slot);

    if (item.kind === 'video') {
      if (isStreamableMediaUrl(url) || url.startsWith('http') || url.startsWith('blob:')) {
        out.push({ ...item, url });
        continue;
      }
      if (key) {
        out.push({ ...item, url: `/api/media/${encodeURIComponent(key)}` });
        continue;
      }
      if (url.startsWith('img:')) {
        out.push({
          ...item,
          url: `/api/media/${encodeURIComponent(url.replace(/^img:/, ''))}`,
        });
        continue;
      }
      out.push({ ...item, url });
      continue;
    }

    // Images: stream only — local cache may already have a tiny preview
    if (isStreamableMediaUrl(url) || url.startsWith('http') || url.startsWith('data:')) {
      out.push({ ...item, url });
      continue;
    }

    if (key) {
      const cached = getEaImage(key) || getEaImage(`img:${key}`);
      if (cached && isStreamableMediaUrl(cached)) {
        out.push({ ...item, url: cached });
        continue;
      }
      // Prefer public API URL — browser loads it; no RTDB base64 pull
      out.push({ ...item, url: imagePublicUrl(key) });
      continue;
    }

    if (url.startsWith('img:')) {
      url = imagePublicUrl(url.replace(/^img:/, ''));
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

/** Cheap branding fingerprint — skip useless refreshBranding writes. */
export function brandingSignature(sync: {
  displayName?: string;
  mainText?: string;
  imageUrl?: string;
  symbols?: string[];
  customMedia?: MentorMediaItem[];
}): string {
  const media = normalizeCustomMedia(sync.customMedia)
    .map((m) => `${m.slot}:${m.kind}:${String(m.url || '').slice(0, 120)}`)
    .sort()
    .join('|');
  return [
    String(sync.displayName || ''),
    String(sync.mainText || ''),
    String(sync.imageUrl || '').slice(0, 120),
    (sync.symbols || []).join(','),
    media,
  ].join('::');
}

/** Fast path — streamable profile URL only, no RTDB image blob pull. */
async function resolveMentorImage(mentorId: string): Promise<string> {
  if (!mentorId) return '';
  const profileKey = `profile-${mentorId}`;
  const cached = getEaImage(profileKey) || getEaImage(`img:${profileKey}`);
  if (cached && !isPlaceholderMentorImage(cached)) {
    if (isStreamableMediaUrl(cached) || cached.startsWith('data:')) return cached;
  }
  return `/api/images/${encodeURIComponent(profileKey)}`;
}

/** Read mentor branding for an activated client — never mutates license keys. */
export async function fetchClientBranding(licenseKey: string): Promise<LicenseSync | null> {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  if (!normalizedKey) return null;

  const vaultHit = findInVault(normalizedKey);
  if (vaultHit && vaultHit.ownerAdminId) {
    const imageUrl = await resolveMentorImage(vaultHit.ownerAdminId);
    // Scoped workspace read — never pull the full platform DB on client phones
    const ownerWsRaw = await firebaseFetchWorkspace(vaultHit.ownerAdminId);
    const ownerWs = ownerWsRaw
      ? ({
          profile: (ownerWsRaw.profile || {}) as Record<string, unknown>,
          eas: dbList<{ id: string; name?: string; symbols?: string[] }>(ownerWsRaw.eas),
        } as {
          profile?: Record<string, unknown>;
          eas?: Array<{ id: string; name?: string; symbols?: string[] }>;
        })
      : undefined;
    const base = brandingFromVault(vaultHit, imageUrl);
    const enriched = enrichBrandingFromWorkspace(base, {
      ...vaultHit,
      _ws: ownerWs,
    });
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
  const imageUrl = await resolveMentorImage(mentorId);

  const eaName = String(raw.eaName || ownerEa?.name || ws?.profile?.eaDisplayName || '');
  const customMedia = await hydrateCustomMediaImages(
    mergeCustomMedia(raw.customMedia, ws?.profile?.customMedia),
    mentorId,
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
