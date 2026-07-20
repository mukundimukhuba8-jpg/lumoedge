import {
  getEaImage,
  isRevokedKey,
  keyFingerprint,
  keysMatch,
  loadVault,
  normalizeLicenseKey,
  type VaultLicense,
} from './storage';
import { isPlaceholderMentorImage } from './mentorMedia';

/** Single client-facing message for any failed activation. */
export const INVALID_KEY_MESSAGE = 'Invalid key';

export type ClaimLicenseRecord = {
  id: string;
  key: string;
  eaId: string;
  eaName: string;
  eaImage: string;
  mainText: string;
  symbols: string[];
  customMedia?: VaultLicense['customMedia'];
  ownerAdminId: string;
  clientName: string;
  clientEmail: string;
  duration: string;
  status: 'active' | 'deleted' | 'assigned';
  assignedEmail?: string;
  assignedAt?: string;
};

type WorkspaceLike = {
  eas?: Array<{ id: string; name?: string; imageUrl?: string; symbols?: string[] }>;
  licenses?: ClaimLicenseRecord[];
  profile?: {
    eaDisplayName?: string;
    mainText?: string;
    eaImage?: string;
    customMedia?: VaultLicense['customMedia'];
  };
};

export function vaultToLicense(v: VaultLicense): ClaimLicenseRecord {
  return {
    id: v.id,
    key: v.key,
    eaId: v.eaId,
    eaName: v.eaName,
    eaImage: v.eaImage,
    mainText: v.mainText,
    symbols: v.symbols ?? [],
    customMedia: v.customMedia ?? [],
    ownerAdminId: v.ownerAdminId,
    clientName: v.clientName,
    clientEmail: v.email,
    duration: v.duration,
    status: v.status,
    assignedEmail: v.assignedEmail,
    assignedAt: v.assignedAt,
  };
}

export function findLicenseByKey(
  key: string,
  workspaces: Record<string, WorkspaceLike>,
): { license: ClaimLicenseRecord; ownerId: string | null } | null {
  const vault = findInVaultLocal(key);
  if (vault && vault.status !== 'deleted') {
    return { license: vaultToLicense(vault), ownerId: vault.ownerAdminId || null };
  }
  for (const [ownerId, ws] of Object.entries(workspaces)) {
    const found = (ws.licenses || []).find(
      (l) => keysMatch(l.key, key) && l.status !== 'deleted',
    );
    if (found) return { license: found, ownerId };
  }
  return null;
}

function findInVaultLocal(key: string): VaultLicense | undefined {
  const fp = keyFingerprint(key);
  if (!fp || fp === 'LUMO') return undefined;
  return loadVault().find((e) => keysMatch(e.key, key));
}

/** Returns an error message, or null when this email may use the key. */
export function validateLicenseEmailAccess(
  license: ClaimLicenseRecord,
  email: string,
  workspaces: Record<string, WorkspaceLike>,
  vault: VaultLicense[] = loadVault(),
): string | null {
  const normalizedEmail = email.trim().toLowerCase();

  if (license.status === 'assigned') {
    if (license.assignedEmail?.toLowerCase() === normalizedEmail) return null;
    return 'This license key is already used by another account.';
  }

  const issuedFor = String(
    license.clientEmail || (license as { email?: string }).email || '',
  )
    .trim()
    .toLowerCase();
  if (issuedFor && issuedFor !== normalizedEmail) {
    return `This key was issued for ${issuedFor}. Log in as that email, or ask your admin for a key for ${normalizedEmail}.`;
  }

  for (const entry of vault) {
    if (
      entry.status === 'assigned' &&
      entry.assignedEmail?.toLowerCase() === normalizedEmail &&
      !keysMatch(entry.key, license.key) &&
      (entry.ownerAdminId || '') === (license.ownerAdminId || '')
    ) {
      return 'This email already has an active license. Use that key or contact your admin.';
    }
  }

  for (const ws of Object.values(workspaces)) {
    for (const lic of ws.licenses || []) {
      if (
        lic.status === 'assigned' &&
        lic.assignedEmail?.toLowerCase() === normalizedEmail &&
        !keysMatch(lic.key, license.key) &&
        (lic.ownerAdminId || '') === (license.ownerAdminId || '')
      ) {
        return 'This email already has an active license. Use that key or contact your admin.';
      }
    }
  }

  return null;
}

/** Resolve branding from local cache only — no network (fast activate). */
export function resolveLicenseBrandingSync(
  license: ClaimLicenseRecord,
  workspaces: Record<string, WorkspaceLike>,
  remoteImages: Record<string, string> = {},
): ClaimLicenseRecord {
  const ownerId = license.ownerAdminId || null;
  const ownerWs = ownerId ? workspaces[ownerId] : undefined;
  const ownerEa = ownerWs?.eas?.find((e) => e.id === license.eaId);
  const profileAdminId = ownerId || license.ownerAdminId || '';
  const normalizedKey = normalizeLicenseKey(license.key);

  const fromRemoteProfile =
    (profileAdminId && remoteImages[`profile-${profileAdminId}`]) ||
    (license.id && remoteImages[license.id]) ||
    remoteImages[`key-${normalizedKey}`] ||
    '';

  const resolvedMedia =
    ownerWs?.profile?.customMedia?.length
      ? ownerWs.profile.customMedia
      : license.customMedia;

  const candidateImages = [
    license.eaImage,
    ownerWs?.profile?.eaImage,
    fromRemoteProfile,
    getEaImage(license.id),
    getEaImage(`key-${normalizedKey}`),
    ownerEa?.imageUrl,
    getEaImage(`profile-${profileAdminId}`),
  ];

  let resolvedImage = '';
  for (const c of candidateImages) {
    const v = String(c || '').trim();
    if (!v || isPlaceholderMentorImage(v) || v.startsWith('blob:')) continue;
    if (v.startsWith('img:')) {
      const id = v.slice(4);
      const embedded = remoteImages[id] || getEaImage(id) || getEaImage(v);
      if (embedded) {
        resolvedImage = embedded;
        break;
      }
      continue;
    }
    if (v.startsWith('/api/images/')) {
      const imgKey = decodeURIComponent(v.replace('/api/images/', '').split('?')[0]);
      const embedded = remoteImages[imgKey] || getEaImage(imgKey);
      if (embedded && embedded.startsWith('data:')) {
        resolvedImage = embedded;
        break;
      }
      if (remoteImages[imgKey]) {
        resolvedImage = remoteImages[imgKey];
        break;
      }
      continue;
    }
    if (v.startsWith('data:') || v.startsWith('http') || v.startsWith('/')) {
      resolvedImage = v;
      break;
    }
  }

  return {
    ...license,
    eaImage: resolvedImage,
    eaName: license.eaName || ownerEa?.name || ownerWs?.profile?.eaDisplayName || 'Lumo Edge',
    mainText: license.mainText || ownerWs?.profile?.mainText || '',
    symbols: ownerEa?.symbols?.length
      ? ownerEa.symbols
      : license.symbols?.length
        ? license.symbols
        : ['XAUUSD'],
    customMedia: resolvedMedia ?? [],
  };
}

export function prepareAssignedLicense(
  license: ClaimLicenseRecord,
  email: string,
): ClaimLicenseRecord {
  const normalizedEmail = email.trim().toLowerCase();
  if (license.status === 'assigned' && license.assignedEmail?.toLowerCase() === normalizedEmail) {
    return license;
  }
  return {
    ...license,
    status: 'assigned',
    assignedEmail: normalizedEmail,
    assignedAt: new Date().toISOString(),
  };
}

/** Unassign other keys bound to this email so a new mentor key can take over. */
export function releaseOtherAssignedForEmail(
  email: string,
  keepKey: string,
  vault: VaultLicense[] = loadVault(),
): VaultLicense[] {
  const normalizedEmail = email.trim().toLowerCase();
  return vault.map((entry) => {
    if (
      entry.status === 'assigned' &&
      entry.assignedEmail?.toLowerCase() === normalizedEmail &&
      !keysMatch(entry.key, keepKey)
    ) {
      return {
        ...entry,
        status: 'active' as const,
        assignedEmail: undefined,
        assignedAt: undefined,
      };
    }
    return entry;
  });
}

export function isClaimableKey(key: string): string | null {
  const fp = keyFingerprint(key);
  if (!fp || fp.length < 8) {
    return 'Enter a full LUMO-XXXX-XXXX-XXXX key.';
  }
  if (isRevokedKey(key)) {
    return 'This license key was deleted and is no longer valid. Generate a new one.';
  }
  return null;
}
