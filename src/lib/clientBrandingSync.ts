/** Pull mentor branding from cloud for licensed clients — no license key writes. */

import type { LicenseSync } from '../context/AppContext';
import { dbList, firebaseFetchImage } from './firebaseDb';
import { isPlaceholderMentorImage, isGenericLumoLabel, normalizeCustomMedia } from './mentorMedia';
import { fetchDb } from './remote';
import {
  findInVault,
  getEaImage,
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

function findLicenseEntry(db: NonNullable<Awaited<ReturnType<typeof fetchDb>>>, key: string) {
  for (const v of dbList<VaultLike>(db.vault)) {
    if (keysMatch(String(v?.key || ''), key) && v?.status !== 'deleted') return v;
  }
  if (db.store?.workspaces && typeof db.store.workspaces === 'object') {
    for (const ws of Object.values(
      db.store.workspaces as Record<string, { licenses?: VaultLike[]; profile?: Record<string, unknown>; eas?: Array<{ id: string; name?: string; symbols?: string[] }> }>,
    )) {
      const hit = (ws.licenses || []).find(
        (l) => keysMatch(String(l?.key || ''), key) && l?.status !== 'deleted',
      );
      if (hit) return { ...hit, _ws: ws };
    }
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
  const customMedia = base.customMedia?.some((m) => m.url)
    ? base.customMedia
    : normalizeCustomMedia(
        (Array.isArray(raw.customMedia) ? raw.customMedia : ws?.profile?.customMedia) as [],
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
    const raw = db ? findLicenseEntry(db, normalizedKey) : null;
    const base = brandingFromVault(vaultHit, imageUrl);
    return enrichBrandingFromWorkspace(base, raw);
  }

  const db = await fetchDb();
  if (!db) return null;

  const raw = findLicenseEntry(db, normalizedKey);
  if (!raw) return null;

  const ws = (raw as VaultLike & { _ws?: { profile?: Record<string, unknown>; eas?: Array<{ id: string; name?: string; symbols?: string[] }> } })._ws;
  const mentorId = String(raw.ownerAdminId || '');
  const ownerEa = ws?.eas?.find((e) => e.id === raw.eaId);
  const imageUrl = await resolveMentorImage(
    mentorId,
    db.images && typeof db.images === 'object'
      ? { ...localImages, ...(db.images as Record<string, string>) }
      : localImages,
  );

  const eaName = String(raw.eaName || ownerEa?.name || ws?.profile?.eaDisplayName || '');
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
    customMedia: normalizeCustomMedia(
      (Array.isArray(raw.customMedia) ? raw.customMedia : ws?.profile?.customMedia) as [],
    ),
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
