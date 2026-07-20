/** Pull mentor branding from cloud for licensed clients — no license key writes. */

import type { LicenseSync } from '../context/AppContext';
import { dbList, firebaseFetchImage } from './firebaseDb';
import { isPlaceholderMentorImage, normalizeCustomMedia } from './mentorMedia';
import { fetchDb } from './remote';
import { keysMatch, normalizeLicenseKey } from './storage';

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

async function resolveMentorImage(
  mentorId: string,
  dbImages?: Record<string, string>,
): Promise<string> {
  if (!mentorId) return '';
  const fromFb =
    (await firebaseFetchImage(`profile-${mentorId}`)) ||
    (await firebaseFetchImage(`img:profile-${mentorId}`));
  if (fromFb) return fromFb;
  const fromMap =
    dbImages?.[`profile-${mentorId}`] ||
    dbImages?.[`img:profile-${mentorId}`] ||
    dbImages?.[mentorId] ||
    '';
  if (fromMap) return fromMap;
  return `/api/images/profile-${encodeURIComponent(mentorId)}`;
}

/** Read mentor branding for an activated client — never mutates license keys. */
export async function fetchClientBranding(licenseKey: string): Promise<LicenseSync | null> {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  if (!normalizedKey) return null;

  const db = await fetchDb();
  if (!db) return null;

  const raw = findLicenseEntry(db, normalizedKey);
  if (!raw) return null;

  const ws = (raw as VaultLike & { _ws?: { profile?: Record<string, unknown>; eas?: Array<{ id: string; name?: string; symbols?: string[] }> } })._ws;
  const mentorId = String(raw.ownerAdminId || '');
  const ownerEa = ws?.eas?.find((e) => e.id === raw.eaId);
  const imageUrl = await resolveMentorImage(
    mentorId,
    db.images && typeof db.images === 'object' ? (db.images as Record<string, string>) : undefined,
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
  if (raw.startsWith('data:') || raw.startsWith('http') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('img:') || raw.startsWith('/api/images/')) {
    const { resolveDisplayImage } = await import('./storage');
    return (await resolveDisplayImage(raw)) || (raw.startsWith('/api/images/') ? raw : '');
  }
  return raw;
}
