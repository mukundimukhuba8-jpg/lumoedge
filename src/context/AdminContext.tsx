import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isAdminUiBusy } from '../lib/adminUiGate';
import { saveDashStats } from '../lib/adminDashCache';
import {
  claimLicenseRemote,
  deleteClientRemote,
  fetchAdmins,
  fetchAdminsForLogin,
  fetchClients,
  fetchDb,
  fetchImagesMap,
  invalidateFetchDbCache,
  loginMentorRemote,
  patchClient,
  postClient,
  postMentorRegistration,
  publishLicensesRemote,
  patchAdminRole,
  pushDb,
  pushSession,
  repairAdminQueueRemote,
  repairClientQueueRemote,
  type RemoteDb,
} from '../lib/remote';
import {
  findPrepaidClient,
  isPrepaidEmail,
  PREPAID_CLIENTS,
} from '../lib/prepaidClients';
import {
  emptyCustomMedia,
  isPlaceholderMentorImage,
  normalizeCustomMedia,
  type MentorMediaItem,
} from '../lib/mentorMedia';
import {
  findInVault,
  getEaImage,
  imageKeyFromPublicUrl,
  isRevokedKey,
  keyFingerprint,
  keysMatch,
  loadJSON,
  loadRevokedKeys,
  loadVault,
  makeLicenseKey,
  normalizeLicenseKey,
  publishEaImage,
  publishMentorMediaImage,
  pruneClientDeviceStorage,
  revokeLicenseKey,
  saveEaImage,
  saveJSON,
  saveRevokedKeysLocal,
  saveVaultLocal,
  stripVaultEntryForLocal,
  unrevokeLicenseKeys,
  upsertClientVault,
  upsertVault,
  isAdminPortalSession,
  isSuperAdminSession,
  type VaultLicense,
} from '../lib/storage';
import {
  firebaseSaveImage,
  mergeAdmins,
  dbList,
} from '../lib/firebaseDb';
import { WelcomeSplash } from '../components/WelcomeSplash';
import {
  findLicenseByKey,
  INVALID_KEY_MESSAGE,
  isClaimableKey,
  prepareAssignedLicense,
  resolveLicenseBrandingSync,
  resolveLicenseImageAsync,
  validateLicenseEmailAccess,
} from '../lib/licenseClaim';
import { isFirebaseConfigured } from '../lib/firebase';
import { approvalError, approvalLog, approvalWarn } from '../lib/approvalLog';
import {
  countAdminQueue,
  isApprovedAdminRole,
  mergeAdminsForApprovalSync,
  normalizeAdminRole,
  pickAdminRole,
} from '../lib/adminQueue';
import { MENTOR_AUTH_MSG } from '../lib/mentorAuthUi';
import {
  countClientQueue,
  mergeClientsLive,
  normalizeClientStatus,
  pickClientStatus,
} from '../lib/clientQueue';
import {
  isRegistrationEmail,
  normalizeRegistrationEmail,
  splitNameFromEmail,
} from '../lib/registrationEmail';
import { licenseError, licenseLog, licenseWarn } from '../lib/licenseLog';
import { countExpectedEas, repairWorkspaceEas } from '../lib/repairEas';
import { healLicensesFromVault } from '../lib/repairLicenses';

/** Blocks destructive vault sync while a publish is in flight. */
let licensePublishInFlight = 0;
const IMAGE_STORE = 'ub-web/ea-images-v1';
const lastServerEasRepair = new Map<string, number>();
/** One empty-license heal per mentor per session — stops fetch storms that freeze phones */
const emptyLicenseHealedAt = new Map<string, number>();
const SERVER_EAS_REPAIR_COOLDOWN_MS = 45_000;
const SUPER_ADMIN_ID = 'LM-004821';

/** Vault rows visible to this portal — Super Admin sees the full vault. */
function vaultForMentor(mentorId: string, isSuper = false): VaultLicense[] {
  const revoked = loadRevokedKeys();
  return loadVault().filter(
    (v) =>
      v.status !== 'deleted' &&
      // Super Admin always keeps every vault key for the license list
      (isSuper || !revoked.some((k) => keysMatch(k, v.key))) &&
      (isSuper || !mentorId || !v.ownerAdminId || v.ownerAdminId === mentorId),
  );
}

function healWorkspaceEas(
  ws: Partial<AdminWorkspace> | undefined,
  ownerAdminId = '',
  vault?: VaultLicense[],
): { workspace: AdminWorkspace; restored: number; restoredLicenses: number } {
  const isSuper = ownerAdminId === SUPER_ADMIN_ID;
  const seed = ownerAdminId ? ({ id: ownerAdminId } as AdminUser) : undefined;
  const normalized = normalizeWorkspaceCore(ws, seed);
  const wsRevoked = dbList<string>(normalized.revokedKeys);
  const vaultSlice = vault ?? vaultForMentor(ownerAdminId, isSuper);
  const licenseHeal = healLicensesFromVault<LicenseRecord>(
    normalized,
    ownerAdminId,
    vaultSlice,
    isSuper ? [] : wsRevoked,
    { includeAllVault: isSuper },
  );
  const withLicenses: AdminWorkspace = {
    ...normalized,
    licenses: licenseHeal.licenses,
  };
  const { workspace: repaired, restored } = repairWorkspaceEas(
    withLicenses as unknown as Record<string, unknown>,
    ownerAdminId,
    vaultSlice,
  );
  return {
    workspace: normalizeWorkspaceCore(repaired as Partial<AdminWorkspace>, seed),
    restored,
    restoredLicenses: licenseHeal.restored,
  };
}

async function maybeRepairEasOnServer(mentorId: string): Promise<boolean> {
  const last = lastServerEasRepair.get(mentorId) || 0;
  if (Date.now() - last < SERVER_EAS_REPAIR_COOLDOWN_MS) return false;
  lastServerEasRepair.set(mentorId, Date.now());
  try {
    const res = await fetch('/api/workspaces/repair-eas', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Always heal from merged local vault — remote-only vault misses keys saved on this device. */
function mergedVaultForMentor(mentorId: string): VaultLicense[] {
  return vaultForMentor(mentorId, mentorId === SUPER_ADMIN_ID);
}
function hydrateLicenseRemote(remote: RemoteDb | null): StoreState | null {
  if (!remote) return null;
  const adminSession = isAdminPortalSession();
  if (Array.isArray(remote.revokedKeys)) {
    const cloudRevoked = remote.revokedKeys
      .map((k) => normalizeLicenseKey(k))
      .filter(Boolean);
    if (adminSession) {
      saveRevokedKeysLocal([...loadRevokedKeys(), ...cloudRevoked]);
    } else {
      // Clients must mirror cloud — old local bans blocked keys after restore
      saveRevokedKeysLocal(cloudRevoked);
    }
  }
  if (adminSession && remote.vault) {
    // Keep every non-deleted vault key locally — never drop by revoked list during hydrate
    saveVaultLocal(
      mergeVaultKeepAll(
        loadVault(),
        dbList<VaultLicense>(remote.vault).filter((v) => v.status !== 'deleted'),
      ),
    );
  }
  if (remote.images && typeof remote.images === 'object') {
    mergeRemoteImages(remote.images);
  }
  if (adminSession && remote.store?.workspaces && typeof remote.store.workspaces === 'object') {
    const local = loadJSON<StoreState>(STORE_KEY, { workspaces: {} });
    const remoteWs: StoreState['workspaces'] = {};
    for (const [id, ws] of Object.entries(
      remote.store.workspaces as StoreState['workspaces'],
    )) {
      const isSuper = id === SUPER_ADMIN_ID;
      remoteWs[id] = healWorkspaceEas(
        ws,
        id,
        vaultForMentor(id, isSuper),
      ).workspace;
    }
    const merged = healAllWorkspacesFromVault(
      mergeStoresKeepAll(local, { workspaces: remoteWs }),
    );
    saveJSON(STORE_KEY, merged);
    return merged;
  }
  if (adminSession) {
    // Vault arrived without workspaces — still rebuild Super Admin list from vault
    const local = loadJSON<StoreState>(STORE_KEY, { workspaces: {} });
    const healed = healAllWorkspacesFromVault(local);
    if (healed !== local) {
      saveJSON(STORE_KEY, healed);
      return healed;
    }
  }
  return null;
}

/** Live portal license list — always includes vault keys (no Restore button). */
function licensesVisibleInPortal(
  workspace: AdminWorkspace,
  adminId: string,
  isSuper: boolean,
): LicenseRecord[] {
  if (!adminId) return [];
  const vault = vaultForMentor(adminId, isSuper);
  // Super Admin: show every vault key even if a stale revoked list hid them
  const healed = healLicensesFromVault<LicenseRecord>(
    workspace,
    adminId,
    vault,
    isSuper ? [] : workspace.revokedKeys || [],
    { includeAllVault: isSuper },
  );
  return filterOwnLicenses(
    healed.licenses,
    adminId,
    isSuper ? [] : workspace.revokedKeys || [],
    isSuper,
  );
}

function licenseRecordToVault(
  license: LicenseRecord,
  normalizedEmail: string,
): VaultLicense {
  return {
    id: license.id,
    key: license.key,
    email: license.clientEmail,
    clientName: license.clientName,
    eaName: license.eaName,
    mainText: license.mainText,
    symbols: license.symbols,
    eaImage: license.eaImage,
    customMedia: license.customMedia,
    duration: license.duration,
    ownerAdminId: license.ownerAdminId,
    eaId: license.eaId,
    status: 'assigned',
    assignedEmail: normalizedEmail,
    assignedAt: license.assignedAt || new Date().toISOString(),
  };
}

export type AdminRole = 'super' | 'admin' | 'pending';

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  password?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
};

export type ClientRequest = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  notifiedAt?: string;
  paymentClaimed?: boolean;
  paymentClaimedAt?: string;
  licenseReleasedAt?: string;
};

export type ManagedEA = {
  id: string;
  name: string;
  symbols: string[];
  lotSize: number;
  direction: 'buy' | 'sell' | 'both';
  imageUrl?: string;
  /** Mentor who created this EA — EAs never show in another portal */
  ownerAdminId?: string;
};

export type LicenseRecord = {
  id: string;
  key: string;
  eaId: string;
  eaName: string;
  eaImage: string;
  mainText: string;
  symbols: string[];
  customMedia: MentorMediaItem[];
  ownerAdminId: string;
  clientName: string;
  clientEmail: string;
  duration: string;
  status: 'active' | 'deleted' | 'assigned';
  assignedEmail?: string;
  assignedAt?: string;
};

export type Mt5Connection = {
  broker: string;
  server: string;
  accountType: string;
  login: string;
  password: string;
  eaName: string;
  connected: boolean;
};

export type AdminProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mentorName: string;
  mentorId: string;
  eaDisplayName: string;
  mainText: string;
  eaImage: string;
  /** 2 profile + 3 background media slots (image/video) */
  customMedia: MentorMediaItem[];
};

export type CopyOrder = {
  id: string;
  eaId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  stopLoss: number;
  takeProfit: number;
  comment: string;
  trades: number;
  copiedTo: number;
  createdAt?: string;
};

export type AdminWorkspace = {
  eas: ManagedEA[];
  licenses: LicenseRecord[];
  clientRequests: ClientRequest[];
  mt5: Mt5Connection;
  profile: AdminProfile;
  orders: CopyOrder[];
  /** Keys this mentor revoked — private to their portal stats */
  revokedKeys: string[];
  /** Tombstones — deleted EAs can never be merged back by another device */
  deletedEaIds?: string[];
};

/** Resolve stored img:/data/http refs to something an <img> can show. */
function displayableImage(value: string | undefined, adminId?: string): string {
  const v = String(value || '').trim();
  if (!v || isPlaceholderMentorImage(v) || v.startsWith('blob:')) return '';
  if (v.startsWith('img:')) {
    const id = v.replace(/^img:/, '');
    return getEaImage(id) || getEaImage(v) || getEaImage(`profile-${adminId || ''}`) || '';
  }
  if (v.startsWith('data:') || v.startsWith('http') || v.startsWith('/')) return v;
  return getEaImage(v) || '';
}

/**
 * Push mentor profile image + EA symbols onto licenses already activated by clients.
 * Never auto-assign license keys — admin sends the key manually; client enters it.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function syncPortalBrandingToClients(
  adminId: string,
  ws: AdminWorkspace,
  options?: { imageRef?: string; displayImage?: string },
) {
  const imageRef =
    options?.imageRef !== undefined
      ? options.imageRef
      : ws.profile.eaImage && !isPlaceholderMentorImage(ws.profile.eaImage)
        ? ws.profile.eaImage.startsWith('data:')
          ? `img:profile-${adminId}`
          : ws.profile.eaImage
        : '';
  const displayImage =
    options?.displayImage ||
    displayableImage(imageRef, adminId) ||
    displayableImage(ws.profile.eaImage, adminId);

  if (displayImage) {
    saveEaImage(`profile-${adminId}`, displayImage);
    saveEaImage(`img:profile-${adminId}`, displayImage);
  }

  const easById = new Map(ws.eas.map((ea) => [ea.id, ea]));
  const nextLicenses = ws.licenses.map((lic) => {
    if (lic.status === 'deleted') return lic;
    const ea = easById.get(lic.eaId);
    const symbols = ea?.symbols?.length ? ea.symbols : lic.symbols;
    // Profile EA display name is what mentors edit — prefer it for clients
    const eaName =
      pickNonEmptyStr(ws.profile.eaDisplayName, ea?.name, lic.eaName) || lic.eaName;
    return {
      ...lic,
      eaImage: imageRef || '',
      mainText: pickNonEmptyStr(ws.profile.mainText, lic.mainText),
      eaName,
      symbols,
      customMedia: (() => {
        const map = new Map(
          normalizeCustomMedia(lic.customMedia).map((m) => [m.slot, m]),
        );
        for (const m of normalizeCustomMedia(ws.profile.customMedia)) {
          if (m.url) map.set(m.slot, m);
        }
        return [...map.values()];
      })(),
    };
  });

  for (const lic of nextLicenses) {
    if (lic.status === 'deleted') continue;
    if (displayImage) {
      saveEaImage(lic.id, displayImage);
      saveEaImage(`key-${normalizeLicenseKey(lic.key)}`, displayImage);
    }
    upsertVault({
      id: lic.id,
      key: lic.key,
      email: lic.clientEmail,
      clientName: lic.clientName,
      eaName: lic.eaName,
      mainText: lic.mainText,
      symbols: lic.symbols,
      eaImage: imageRef || '',
      customMedia: lic.customMedia,
      duration: lic.duration,
      ownerAdminId: lic.ownerAdminId,
      eaId: lic.eaId,
      status: lic.status,
      assignedEmail: lic.assignedEmail,
      assignedAt: lic.assignedAt,
    });
  }

    // Only refresh branding for clients who already activated this exact key
  try {
    const db = await fetchDb();
    const sessions = {
      ...((db?.sessions || {}) as Record<string, Record<string, unknown>>),
    };
    let changed = false;
    for (const lic of nextLicenses) {
      if (lic.status === 'deleted') continue;
      const emails = new Set<string>();
      if (lic.clientEmail) emails.add(lic.clientEmail.toLowerCase());
      if (lic.assignedEmail) emails.add(lic.assignedEmail.toLowerCase());
      for (const email of emails) {
        const prev = sessions[email];
        if (!prev || typeof prev !== 'object') continue;
        const bot = ((prev as { bot?: Record<string, unknown> }).bot ||
          {}) as Record<string, unknown>;
        const key = String(bot.licenseKey || '');
        if (!key || !keysMatch(key, lic.key)) continue;
        const clientImage = (() => {
          if (displayImage?.startsWith('data:') || displayImage?.startsWith('http')) {
            return displayImage;
          }
          const ref = imageRef || (displayImage ? `img:profile-${adminId}` : '');
          if (ref.startsWith('img:')) {
            return `/api/images/${encodeURIComponent(ref.slice(4))}`;
          }
          if (ref.startsWith('/api/images/')) return ref;
          return `/api/images/${encodeURIComponent(`profile-${adminId}`)}`;
        })();
        sessions[email] = {
          ...prev,
          bot: {
            ...bot,
            imageUrl: clientImage,
            displayName: lic.eaName || String(bot.displayName || ''),
            name: String(lic.eaName || bot.name || '')
              .replace(/\s+/g, '')
              .toUpperCase(),
            mainText: lic.mainText || String(bot.mainText || ''),
            symbols: lic.symbols?.length ? lic.symbols : (bot.symbols as string[]) || [],
            customMedia: lic.customMedia,
          },
        };
        changed = true;
      }
    }
    const imagePayload: Record<string, string> = {};
    if (displayImage) {
      imagePayload[`profile-${adminId}`] = displayImage;
    }
    for (const item of normalizeCustomMedia(ws.profile.customMedia)) {
      if (!item.url) continue;
      const mediaKeyId = `${adminId}-${item.slot}`;
      const bytes =
        item.url.startsWith('data:')
          ? item.url
          : getEaImage(mediaKeyId) ||
            getEaImage(`img:${mediaKeyId}`) ||
            getEaImage(imageKeyFromPublicUrl(item.url));
      if (bytes && bytes.startsWith('data:')) {
        imagePayload[mediaKeyId] = bytes;
      } else if (
        item.url.startsWith('http') ||
        item.url.startsWith('/api/')
      ) {
        // Hosted background URL — same durable pattern as profile picture
        imagePayload[mediaKeyId] = item.url;
      }
    }
    const payload: Parameters<typeof pushDb>[0] = {
      store: { workspaces: { [adminId]: { ...ws, licenses: nextLicenses } } },
      vault: loadVault(),
    };
    if (Object.keys(imagePayload).length) {
      payload.images = imagePayload;
    }
    if (changed) payload.sessions = sessions;
    await pushDb(payload);
  } catch {
    const imagePayload: Record<string, string> = {};
    if (displayImage) {
      imagePayload[`profile-${adminId}`] = displayImage;
    }
    for (const item of normalizeCustomMedia(ws.profile.customMedia)) {
      if (!item.url) continue;
      const mediaKeyId = `${adminId}-${item.slot}`;
      const bytes =
        item.url.startsWith('data:')
          ? item.url
          : getEaImage(mediaKeyId) ||
            getEaImage(`img:${mediaKeyId}`) ||
            getEaImage(imageKeyFromPublicUrl(item.url));
      if (bytes && bytes.startsWith('data:')) {
        imagePayload[mediaKeyId] = bytes;
      } else if (
        item.url.startsWith('http') ||
        item.url.startsWith('/api/')
      ) {
        imagePayload[mediaKeyId] = item.url;
      }
    }
    await pushDb({
      store: { workspaces: { [adminId]: { ...ws, licenses: nextLicenses } } },
      vault: loadVault(),
      ...(Object.keys(imagePayload).length ? { images: imagePayload } : {}),
    });
  }

  return nextLicenses;
}

const AUTH_KEY = 'ub-web/admin-auth-v3';
const STORE_KEY = 'ub-web/admin-store-v3';
const CLIENT_QUEUE_CACHE_KEY = 'ub-web/subscriber-queue-v1';
const ADMIN_ROSTER_CACHE_KEY = 'ub-web/admin-roster-v1';

export const SUPER_ADMIN = {
  email: 'mukundimukhuba8@gmail.com',
  /** SHA-256 of the Super Admin password — never stored in plain text */
  passwordSha256:
    '18026064be7ec28f428f49e9c93cc0c1f86d3883f11189805f592298467663c9',
  user: {
    id: 'LM-004821',
    email: 'mukundimukhuba8@gmail.com',
    fullName: 'Mukundi',
    role: 'super' as const,
  },
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type AuthState = {
  portalOpen: boolean;
  admin: AdminUser | null;
  admins: AdminUser[];
};

type StoreState = {
  workspaces: Record<string, AdminWorkspace>;
};

function emptyMt5(eaName = ''): Mt5Connection {
  return {
    broker: 'RazorMarkets',
    server: 'RazorMarkets-Live',
    accountType: '100% Bonus Standard',
    login: '',
    password: '',
    eaName,
    connected: false,
  };
}

function emptyProfile(seed?: {
  id?: string;
  email?: string;
  fullName?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}): AdminProfile {
  const parts = (seed?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    email: seed?.email ?? '',
    phone: seed?.phone ?? '',
    mentorName: seed?.mentorName ?? '',
    mentorId: seed?.id ?? '',
    eaDisplayName: seed?.eaName ?? '',
    mainText: seed?.mainText ?? '',
    eaImage: '',
    customMedia: emptyCustomMedia(),
  };
}

/** Brand-new admin portals start empty — nothing shared. */
export function createEmptyWorkspace(seed?: {
  id?: string;
  email?: string;
  fullName?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}): AdminWorkspace {
  return {
    eas: [],
    licenses: [],
    clientRequests: [],
    mt5: emptyMt5(seed?.eaName ?? ''),
    profile: emptyProfile(seed),
    orders: [],
    revokedKeys: [],
    deletedEaIds: [],
  };
}

/** Cheap change detection — avoids JSON.stringify on large license/image payloads. */
function workspaceDataFingerprint(ws: AdminWorkspace): string {
  const lic = ws.licenses
    .map((l) => `${l.id}:${normalizeLicenseKey(l.key)}:${l.status}`)
    .sort()
    .join(',');
  const ea = ws.eas
    .map((e) => `${e.id}:${e.name}:${e.ownerAdminId || ''}:${e.symbols.length}`)
    .sort()
    .join(',');
  const mediaSig = normalizeCustomMedia(ws.profile.customMedia)
    .map((m) => `${m.slot}:${m.url?.length || 0}`)
    .sort()
    .join(',');
  const prof = [
    ws.profile.mentorId || '',
    ws.profile.firstName || '',
    ws.profile.lastName || '',
    ws.profile.phone || '',
    ws.profile.mentorName || '',
    ws.profile.eaDisplayName || '',
    ws.profile.eaImage?.length || 0,
    ws.profile.mainText?.length || 0,
    mediaSig,
  ].join(':');
  return `${lic}|${ea}|${prof}|${(ws.revokedKeys || []).length}|${(ws.deletedEaIds || []).length}`;
}

function pickNonEmptyStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return String(v);
  }
  return '';
}

/** Merge remote image refs without rewriting the full local map every poll. */
function mergeRemoteImages(remote: Record<string, string> | undefined) {
  if (!remote || typeof remote !== 'object') return;
  const local = loadJSON<Record<string, string>>(IMAGE_STORE, {});
  let changed = false;
  for (const [k, v] of Object.entries(remote)) {
    if (typeof v !== 'string' || !v || local[k] === v) continue;
    local[k] = v;
    changed = true;
  }
  if (changed) saveJSON(IMAGE_STORE, local);
}

function normalizeWorkspaceCore(
  ws: Partial<AdminWorkspace> | undefined,
  seed?: {
    id?: string;
    email?: string;
    fullName?: string;
    mentorName?: string;
    eaName?: string;
    phone?: string;
    mainText?: string;
  },
): AdminWorkspace {
  const base = createEmptyWorkspace(seed);
  if (!ws) return base;
  const tombstones = new Set(dbList<string>(ws.deletedEaIds));
  const ownerId = seed?.id || '';
  return {
    ...base,
    ...ws,
    deletedEaIds: [...tombstones],
    eas: dbList<ManagedEA>(ws.eas)
      .filter((e) => e?.id && !tombstones.has(e.id))
      .map((e) => ({
        ...e,
        ownerAdminId: e.ownerAdminId || ownerId,
      })),
    licenses: dbList<LicenseRecord>(ws.licenses)
      .filter((l) => l.status !== 'deleted')
      .filter((l) => !isLicenseRevoked(l.key, ws.revokedKeys ?? []))
      .map((l) => ({
        ...l,
        ownerAdminId: l.ownerAdminId || seed?.id || '',
        customMedia: normalizeCustomMedia(l.customMedia),
      })),
    clientRequests: dbList<ClientRequest>(ws.clientRequests),
    orders: dbList<CopyOrder>(ws.orders),
    revokedKeys: dbList<string>(ws.revokedKeys),
    profile: {
      ...base.profile,
      ...(ws.profile ?? {}),
      customMedia: normalizeCustomMedia(
        (ws.profile as AdminProfile | undefined)?.customMedia ??
          base.profile.customMedia,
      ),
    },
    mt5: { ...base.mt5, ...(ws.mt5 ?? {}) },
  };
}

function normalizeWorkspace(
  ws: Partial<AdminWorkspace> | undefined,
  seed?: {
    id?: string;
    email?: string;
    fullName?: string;
    mentorName?: string;
    eaName?: string;
    phone?: string;
    mainText?: string;
    role?: string;
  },
): AdminWorkspace {
  const id = seed?.id || '';
  const isSuper = normalizeAdminRole(seed?.role) === 'super' || id === SUPER_ADMIN_ID;
  return healWorkspaceEas(ws, id, vaultForMentor(id, isSuper)).workspace;
}

/** Merge two workspaces — keep every EA and license from either side. */
function mergeWorkspaceKeepAll(a: AdminWorkspace, b: AdminWorkspace): AdminWorkspace {
  const deletedEaIds = new Set([
    ...(a.deletedEaIds || []),
    ...(b.deletedEaIds || []),
  ]);
  const easById = new Map<string, ManagedEA>();
  for (const ea of [...dbList<ManagedEA>(a.eas), ...dbList<ManagedEA>(b.eas)]) {
    if (!ea?.id || deletedEaIds.has(ea.id)) continue;
    const prev = easById.get(ea.id);
    easById.set(ea.id, prev ? { ...prev, ...ea, imageUrl: ea.imageUrl || prev.imageUrl || '' } : ea);
  }
  const licByKey = new Map<string, LicenseRecord>();
  const wsRevoked = [...new Set([...(a.revokedKeys || []), ...(b.revokedKeys || [])])];
  for (const lic of [...dbList<LicenseRecord>(a.licenses), ...dbList<LicenseRecord>(b.licenses)]) {
    if (!lic?.key || isLicenseRevoked(lic.key, wsRevoked)) continue;
    const mergeKey = keyFingerprint(lic.key) || lic.id || lic.key;
    const prev = licByKey.get(mergeKey);
    if (!prev) {
      licByKey.set(mergeKey, lic);
      continue;
    }
    // Prefer non-deleted; keep richer fields
    const preferIncoming = lic.status !== 'deleted' && prev.status === 'deleted';
    const base = preferIncoming ? { ...prev, ...lic } : { ...lic, ...prev, ...lic };
    licByKey.set(mergeKey, {
      ...base,
      eaImage: lic.eaImage || prev.eaImage || '',
      customMedia: normalizeCustomMedia(
        (lic.customMedia?.length ? lic.customMedia : prev.customMedia) || [],
      ),
      assignedEmail: lic.assignedEmail || prev.assignedEmail,
      assignedAt: lic.assignedAt || prev.assignedAt,
      status: lic.status === 'deleted' || prev.status === 'deleted'
        ? lic.status === 'deleted' && prev.status === 'deleted'
          ? 'deleted'
          : lic.status !== 'deleted'
            ? lic.status
            : prev.status
        : lic.status || prev.status,
    });
  }
  // Drop tombstones for EAs that still exist — fixes laptop showing zero EAs
  const reconciledDeleted = [...deletedEaIds].filter((id) => !easById.has(id));
  return normalizeWorkspace({
    ...a,
    ...b,
    deletedEaIds: reconciledDeleted,
    eas: Array.from(easById.values()),
    licenses: Array.from(licByKey.values()).filter((l) => l.status !== 'deleted'),
    profile: {
      ...a.profile,
      ...b.profile,
      // Never let an empty cloud poll wipe live names / branding
      firstName: pickNonEmptyStr(b.profile?.firstName, a.profile?.firstName),
      lastName: pickNonEmptyStr(b.profile?.lastName, a.profile?.lastName),
      email: pickNonEmptyStr(b.profile?.email, a.profile?.email),
      phone: pickNonEmptyStr(b.profile?.phone, a.profile?.phone),
      mentorName: pickNonEmptyStr(b.profile?.mentorName, a.profile?.mentorName),
      eaDisplayName: pickNonEmptyStr(b.profile?.eaDisplayName, a.profile?.eaDisplayName),
      mainText: pickNonEmptyStr(b.profile?.mainText, a.profile?.mainText),
      eaImage:
        (a.profile?.eaImage && String(a.profile.eaImage).trim()) ||
        (b.profile?.eaImage && String(b.profile.eaImage).trim()) ||
        '',
      customMedia: (() => {
        const map = new Map(
          normalizeCustomMedia(a.profile?.customMedia).map((m) => [m.slot, m]),
        );
        for (const m of normalizeCustomMedia(b.profile?.customMedia)) {
          if (m.url) map.set(m.slot, m);
        }
        return [...map.values()];
      })(),
    },
    revokedKeys: Array.from(new Set([...(a.revokedKeys || []), ...(b.revokedKeys || [])])),
  });
}

function mergeStoresKeepAll(local: StoreState, remote: StoreState): StoreState {
  const ids = new Set([
    ...Object.keys(local.workspaces || {}),
    ...Object.keys(remote.workspaces || {}),
  ]);
  const workspaces: StoreState['workspaces'] = {};
  for (const id of ids) {
    const a = local.workspaces[id];
    const b = remote.workspaces[id];
    if (a && b) workspaces[id] = mergeWorkspaceKeepAll(a, b);
    else workspaces[id] = normalizeWorkspace(a || b, { id });
  }
  return { workspaces };
}

function isLicenseRevoked(key: string, wsRevoked: string[] = []): boolean {
  return isRevokedKey(key) || wsRevoked.some((k) => keysMatch(k, key));
}

/** Only licenses this mentor owns — never show another portal's keys. */
function filterOwnLicenses(
  licenses: LicenseRecord[],
  ownerAdminId: string,
  wsRevoked: string[] = [],
  isSuper = false,
): LicenseRecord[] {
  if (!ownerAdminId && !isSuper) return [];
  return licenses
    .filter((l) => l.status !== 'deleted')
    .filter((l) => !isLicenseRevoked(l.key, wsRevoked))
    .filter((l) => isSuper || !l.ownerAdminId || l.ownerAdminId === ownerAdminId)
    .map((l) => ({
      ...l,
      ownerAdminId: l.ownerAdminId || ownerAdminId,
    }));
}

function findLiveLicenseForOwner(
  email: string,
  ownerAdminId: string,
  workspace: AdminWorkspace,
  vault: VaultLicense[],
): LicenseRecord | VaultLicense | undefined {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !ownerAdminId) return undefined;
  const wsRevoked = workspace.revokedKeys || [];
  const fromVault = vault.find(
    (v) =>
      v.ownerAdminId === ownerAdminId &&
      v.email?.toLowerCase() === normalized &&
      (v.status === 'active' || v.status === 'assigned') &&
      !isLicenseRevoked(v.key, wsRevoked),
  );
  if (fromVault) return fromVault;
  return workspace.licenses.find(
    (l) =>
      (l.ownerAdminId || ownerAdminId) === ownerAdminId &&
      l.clientEmail?.toLowerCase() === normalized &&
      (l.status === 'active' || l.status === 'assigned') &&
      !isLicenseRevoked(l.key, wsRevoked),
  );
}

function mergeVaultKeepAll(local: VaultLicense[], remote: VaultLicense[]): VaultLicense[] {
  const byKey = new Map<string, VaultLicense>();
  for (const v of [...local, ...remote]) {
    if (!v?.key || v.status === 'deleted') continue;
    const mergeKey = keyFingerprint(v.key) || v.id || v.key;
    const prev = byKey.get(mergeKey);
    if (!prev) {
      byKey.set(mergeKey, v);
      continue;
    }
    byKey.set(mergeKey, {
      ...prev,
      ...v,
      eaImage: v.eaImage || prev.eaImage || '',
      customMedia: normalizeCustomMedia(
        (v.customMedia?.length ? v.customMedia : prev.customMedia) || [],
      ),
    });
  }
  return Array.from(byKey.values());
}

function saveMergedVaultForMentor(
  _adminId: string,
  remoteVault: VaultLicense[],
  extraLocal: VaultLicense[] = [],
) {
  const revoked = loadRevokedKeys();
  const merged = mergeVaultKeepAll(loadVault(), [...extraLocal, ...remoteVault]);
  // Keep the full merged vault — never drop other mentors' keys from this device
  saveVaultLocal(
    merged.filter(
      (v) =>
        v.status !== 'deleted' &&
        !revoked.some((k) => keysMatch(k, v.key)),
    ),
  );
}

function licenseToVaultEntry(lic: LicenseRecord): VaultLicense {
  return {
    id: lic.id,
    key: lic.key,
    email: lic.clientEmail,
    clientName: lic.clientName,
    eaName: lic.eaName,
    mainText: lic.mainText,
    symbols: lic.symbols,
    eaImage: lic.eaImage,
    customMedia: lic.customMedia,
    duration: lic.duration,
    ownerAdminId: lic.ownerAdminId,
    eaId: lic.eaId,
    status: lic.status,
    assignedEmail: lic.assignedEmail,
    assignedAt: lic.assignedAt,
  };
}

/** Push mentor licenses + vault entries to Firebase (fixes keys that only existed locally). */
async function pushLicensesToRemote(adminId: string, ws: AdminWorkspace) {
  licensePublishInFlight += 1;
  try {
    let active = filterOwnLicenses(ws.licenses, adminId, ws.revokedKeys);
    if (!active.length) {
      const fromVault = healLicensesFromVault<LicenseRecord>(
        ws,
        adminId,
        loadVault().filter(
          (v) => (v.ownerAdminId || adminId) === adminId && v.status !== 'deleted',
        ),
        ws.revokedKeys || [],
      ).licenses;
      active = filterOwnLicenses(fromVault, adminId, ws.revokedKeys);
    }
    if (!active.length) return;

    const publishWs = { ...ws, licenses: active };
    const entries = active.map(licenseToVaultEntry);
    licenseLog('publish', 'saving to cloud', {
      adminId,
      count: entries.length,
      keys: entries.map((e) => normalizeLicenseKey(e.key)),
    });

    const published = await publishLicensesRemote({
      adminId,
      vaultEntries: entries,
      workspace: publishWs,
      revokedKeys: loadRevokedKeys(),
    });

    if (published.ok) {
      saveMergedVaultForMentor(adminId, [], entries);
      licenseLog('publish', 'cloud save confirmed', { key: published.key });
      return;
    }

    licenseWarn('publish', 'API publish failed, trying client fallback', {
      error: published.error,
      status: published.status,
    });

    const fb = await pushDb({
      vault: entries,
      store: { workspaces: { [adminId]: publishWs } },
      revokedKeys: loadRevokedKeys(),
    });
    if (fb) {
      saveMergedVaultForMentor(adminId, [], entries);
      licenseLog('publish', 'fallback pushDb succeeded');
      return;
    }

    throw new Error(published.error || 'License cloud save failed');
  } finally {
    licensePublishInFlight -= 1;
  }
}

function uniqueKey(existing: LicenseRecord[]) {
  const vaultKeys = loadVault().map((v) => v.key);
  const revoked = loadRevokedKeys();
  let key = makeLicenseKey();
  let guard = 0;
  while (
    (existing.some((l) => keysMatch(l.key, key)) ||
      vaultKeys.some((k) => keysMatch(k, key)) ||
      revoked.some((k) => keysMatch(k, key))) &&
    guard < 30
  ) {
    key = makeLicenseKey();
    guard += 1;
  }
  return key;
}

function hasCachedSubscriberQueue(): boolean {
  return loadJSON<ClientRequest[]>(CLIENT_QUEUE_CACHE_KEY, []).length > 0;
}

function saveCachedClientQueue(list: ClientRequest[]) {
  if (!list.length) return;
  const existing = loadJSON<ClientRequest[]>(CLIENT_QUEUE_CACHE_KEY, []);
  const merged = existing.length ? mergeClientLists(existing, list) : list;
  saveJSON(CLIENT_QUEUE_CACHE_KEY, merged);
}

function loadCachedClientQueue(): ClientRequest[] {
  const cached = loadJSON<ClientRequest[]>(CLIENT_QUEUE_CACHE_KEY, []);
  if (cached.length) {
    return mergeSubscriberQueue(prepaidAsClientRequests(), cached, loadDeletedClients());
  }
  const store = loadJSON<StoreState>(STORE_KEY, { workspaces: {} });
  const legacy = store.workspaces[SUPER_ADMIN.user.id]?.clientRequests;
  if (legacy?.length) {
    const merged = mergeSubscriberQueue(prepaidAsClientRequests(), legacy, loadDeletedClients());
    saveCachedClientQueue(merged);
    return merged;
  }
  return prepaidAsClientRequests();
}

function portalAdminId(): string {
  try {
    const session = loadJSON<AuthState>(AUTH_KEY, {
      portalOpen: false,
      admin: null,
      admins: [],
    });
    return session.admin?.id || '';
  } catch {
    return '';
  }
}

/** Rebuild workspace licenses/EAs from merged local vault — never drops existing rows. */
function healMentorWorkspaceInStore(
  prev: StoreState,
  mentorId: string,
  localWs?: Partial<AdminWorkspace>,
  remoteWs?: Partial<AdminWorkspace>,
): StoreState {
  if (!mentorId) return prev;
  const isSuper = mentorId === SUPER_ADMIN_ID;
  const base = localWs ?? prev.workspaces[mentorId] ?? createEmptyWorkspace({ id: mentorId });
  const mergedWs = remoteWs
    ? mergeWorkspaceKeepAll(
        normalizeWorkspaceCore(base, { id: mentorId }),
        normalizeWorkspaceCore(remoteWs, { id: mentorId }),
      )
    : normalizeWorkspaceCore(base, { id: mentorId });
  const vaultNow = vaultForMentor(mentorId, isSuper);
  const healed = healWorkspaceEas(mergedWs, mentorId, vaultNow);
  const workspace = {
    ...healed.workspace,
    // Super Admin portal must always surface the full vault list
    licenses: licensesVisibleInPortal(healed.workspace, mentorId, isSuper),
  };
  const beforeCount = prev.workspaces[mentorId]?.licenses?.length ?? 0;
  if (
    healed.restoredLicenses === 0 &&
    healed.restored === 0 &&
    workspace.licenses.length === beforeCount &&
    workspaceDataFingerprint(workspace) ===
      workspaceDataFingerprint(prev.workspaces[mentorId] ?? createEmptyWorkspace({ id: mentorId }))
  ) {
    return prev;
  }
  const next = {
    ...prev,
    workspaces: { ...prev.workspaces, [mentorId]: workspace },
  };
  saveJSON(STORE_KEY, next);
  return next;
}

function healAllWorkspacesFromVault(prev: StoreState): StoreState {
  let next = prev;
  for (const id of Object.keys(prev.workspaces || {})) {
    next = healMentorWorkspaceInStore(next, id);
  }
  const portalId = portalAdminId();
  if (portalId && !next.workspaces[portalId]) {
    next = healMentorWorkspaceInStore(next, portalId);
  }
  return next;
}

function withoutAdminPassword(admin: AdminUser): AdminUser {
  const { password: _drop, ...rest } = admin;
  return rest;
}

function withoutAdminPasswords(list: AdminUser[]): AdminUser[] {
  return list.map(withoutAdminPassword);
}

function saveCachedAdminRoster(list: AdminUser[]) {
  if (!list.length) return;
  saveJSON(ADMIN_ROSTER_CACHE_KEY, withoutAdminPasswords(list));
}

function loadCachedAdminRoster(): AdminUser[] {
  return withoutAdminPasswords(loadJSON<AdminUser[]>(ADMIN_ROSTER_CACHE_KEY, []));
}

function migrateAuth(): AuthState {
  const cachedRoster = loadCachedAdminRoster();
  const v3 = loadJSON<AuthState | null>(AUTH_KEY, null as unknown as AuthState);
  if (v3 && Array.isArray(v3.admins)) {
    const admins = (
      cachedRoster.length
        ? mergeAdminsForApprovalSync(v3.admins, cachedRoster)
        : v3.admins.length
          ? v3.admins
          : cachedRoster
    ).map((a) => ({ ...a, role: normalizeAdminRole(a.role) })) as AdminUser[];
    // Session user never keeps a password; roster may keep a same-device register secret
    const admin = v3.admin ? withoutAdminPassword(v3.admin) : null;
    return { ...v3, admin, admins, portalOpen: false };
  }
  const v1 = loadJSON<{
    portalOpen?: boolean;
    admin?: AdminUser | null;
    pendingAdmins?: AdminUser[];
  }>('ub-web/admin-auth-v1', {});
  return {
    portalOpen: false,
    admin: null,
    admins: cachedRoster.length
      ? cachedRoster.map((a) => ({ ...a, role: normalizeAdminRole(a.role) })) as AdminUser[]
      : (v1.pendingAdmins ?? []),
  };
}

function migrateStore(admins: AdminUser[]): StoreState {
  const v3 = loadJSON<StoreState | null>(STORE_KEY, null as unknown as StoreState);
  if (v3?.workspaces && typeof v3.workspaces === 'object') {
    const workspaces: Record<string, AdminWorkspace> = {};
    for (const [id, ws] of Object.entries(v3.workspaces)) {
      workspaces[id] = normalizeWorkspace(ws, { id } as AdminUser);
    }
    for (const a of admins) {
      if (!workspaces[a.id]) workspaces[a.id] = createEmptyWorkspace(a);
    }
    return { workspaces };
  }

  // Migrate legacy shared data into Super Admin workspace only
  const legacy = loadJSON<Partial<AdminWorkspace>>('ub-web/admin-data-v2', {});
  const legacyV1 = loadJSON<Partial<AdminWorkspace>>('ub-web/admin-data-v1', {});
  const merged = { ...legacyV1, ...legacy };
  const workspaces: Record<string, AdminWorkspace> = {};

  const superWs = createEmptyWorkspace({
    id: SUPER_ADMIN.user.id,
    email: SUPER_ADMIN.email,
    fullName: SUPER_ADMIN.user.fullName,
  });

  if (merged.eas?.length || merged.licenses?.length || merged.profile) {
    superWs.eas = (merged.eas ?? []).map((ea) => ({ ...ea, imageUrl: ea.imageUrl ?? '' }));
    superWs.licenses = (merged.licenses ?? []).map((l) => ({
      ...l,
      eaImage: l.eaImage ?? '',
      mainText: l.mainText ?? merged.profile?.mainText ?? '',
      symbols: l.symbols ?? [],
      ownerAdminId: SUPER_ADMIN.user.id,
    }));
    superWs.clientRequests = merged.clientRequests ?? [];
    superWs.mt5 = { ...emptyMt5(), ...merged.mt5 };
    superWs.profile = {
      ...emptyProfile({
        id: SUPER_ADMIN.user.id,
        email: SUPER_ADMIN.email,
        fullName: SUPER_ADMIN.user.fullName,
      }),
      ...merged.profile,
      eaImage: merged.profile?.eaImage ?? '',
    };
    superWs.orders = merged.orders ?? [];
  }
  workspaces[SUPER_ADMIN.user.id] = superWs;

  for (const a of admins) {
    if (!workspaces[a.id]) {
      workspaces[a.id] = createEmptyWorkspace(a);
    }
  }

  return { workspaces };
}

type Ctx = {
  portalOpen: boolean;
  admin: AdminUser | null;
  admins: AdminUser[];
  openPortal: () => void;
  closePortal: () => void;
  login: (email: string, password: string) => Promise<string | null>;
  registerAdmin: (
    data: Omit<AdminUser, 'id' | 'role'> & { password: string },
  ) => Promise<string | null>;
  logout: () => void;
  approveAdmin: (id: string) => Promise<void>;
  approveAdmins: (ids: string[]) => Promise<void>;
  deleteAdmin: (id: string) => void;
  clientRequests: ClientRequest[];
  submitClientRegistration: (input: {
    email: string;
    firstName: string;
    lastName: string;
  }) => ClientRequest;
  approveClient: (id: string) => Promise<void>;
  /** Super Admin — add a subscriber who never appeared in the queue */
  addApprovedSubscriber: (input: {
    email: string;
    firstName: string;
    lastName: string;
  }) => Promise<{ ok: true; client: ClientRequest } | { ok: false; error: string }>;
  markClientPaid: (id: string) => void;
  rejectClient: (id: string) => void;
  deleteClient: (id: string) => void;
  claimClientPayment: (email: string) => Promise<ClientRequest | null>;
  getClientByEmail: (email: string) => ClientRequest | undefined;
  /** Pull live subscriber queue from Firebase and repair durable backup */
  refreshClientQueue: () => Promise<{
    ok: boolean;
    total?: number;
    pending?: number;
    approved?: number;
    error?: string;
  }>;
  /** Pull live mentor queue from Firebase — restores pending mentors hidden by stale sync */
  refreshAdminQueue: () => Promise<{
    ok: boolean;
    total?: number;
    pending?: number;
    approved?: number;
    error?: string;
  }>;
  eas: ManagedEA[];
  licenses: LicenseRecord[];
  mt5: Mt5Connection;
  profile: AdminProfile;
  orders: CopyOrder[];
  createEA: (ea: Omit<ManagedEA, 'id'>) => void;
  updateEA: (id: string, patch: Partial<Omit<ManagedEA, 'id'>>) => void;
  deleteEA: (id: string) => void;
  generateLicense: (input: {
    eaId: string;
    clientName: string;
    clientEmail: string;
    duration: string;
  }) => Promise<{ ok: true; license: LicenseRecord } | { ok: false; error: string }>;
  deleteLicense: (id: string) => Promise<void>;
  claimLicense: (
    key: string,
    email: string,
  ) => Promise<{ ok: true; license: LicenseRecord } | { ok: false; error: string }>;
  findLicense: (key: string) => LicenseRecord | undefined;
  resyncLicenses: () => void;
  /** Pull license vault from cloud so activation can read keys instantly. */
  warmLicenseCache: () => void;
  restoreEAsFromCloud: () => Promise<{ ok: boolean; restored?: number; eas?: number; error?: string }>;
  restoreLicensesFromCloud: () => Promise<{
    ok: boolean;
    restored?: number;
    licenses?: number;
    error?: string;
  }>;
  /** True until the first subscriber queue fetch finishes (Super Admin). */
  clientsLoading: boolean;
  saveMt5: (mt5: Mt5Connection) => void;
  updateProfile: (patch: Partial<AdminProfile>) => Promise<void>;
  executeOrder: (order: Omit<CopyOrder, 'id' | 'copiedTo'>) => CopyOrder;
  stats: {
    activeLicenses: number;
    deletedLicenses: number;
    totalClients: number;
    pendingClients: number;
    approvedClients: number;
  };
};

function prepaidAsClientRequests(): ClientRequest[] {
  const now = new Date().toISOString();
  return PREPAID_CLIENTS.map((c, i) => ({
    id: `cli-prepaid-${String(i + 1).padStart(4, '0')}`,
    email: c.email.toLowerCase(),
    firstName: c.firstName,
    lastName: c.lastName,
    status: 'approved' as const,
    createdAt: now,
    notifiedAt: now,
    paymentClaimed: true,
    paymentClaimedAt: now,
  }));
}

const DELETED_CLIENTS_KEY = 'ub-web/deleted-clients-v1';

function loadDeletedClients(): Set<string> {
  return new Set(
    loadJSON<string[]>(DELETED_CLIENTS_KEY, []).map((e) => e.toLowerCase()),
  );
}

function rememberDeletedClient(email: string) {
  const all = loadDeletedClients();
  all.add(email.toLowerCase());
  saveJSON(DELETED_CLIENTS_KEY, [...all]);
}

/** Registration again lifts the local tombstone for that email */
function forgetDeletedClient(email: string) {
  const all = loadDeletedClients();
  if (all.delete(email.toLowerCase())) {
    saveJSON(DELETED_CLIENTS_KEY, [...all]);
  }
}

function withoutDeleted(
  list: ClientRequest[],
  extra?: Iterable<string>,
): ClientRequest[] {
  const deleted = loadDeletedClients();
  for (const e of extra || []) deleted.add(String(e).toLowerCase());
  if (!deleted.size) return list;
  return list.filter((c) => !deleted.has(c.email.toLowerCase()));
}

function mergeClientRecord(prev: ClientRequest, incoming: ClientRequest): ClientRequest {
  const email = incoming.email.toLowerCase();
  return {
    ...prev,
    ...incoming,
    email,
    status: pickClientStatus(prev.status, incoming.status),
    paymentClaimed:
      'paymentClaimed' in incoming
        ? Boolean(incoming.paymentClaimed)
        : Boolean(prev.paymentClaimed),
    paymentClaimedAt:
      'paymentClaimedAt' in incoming
        ? incoming.paymentClaimedAt || undefined
        : prev.paymentClaimedAt,
    licenseReleasedAt:
      'licenseReleasedAt' in incoming
        ? incoming.licenseReleasedAt || undefined
        : prev.licenseReleasedAt,
  };
}

function adminsMatch(a: AdminUser[], b: AdminUser[]) {
  if (a.length !== b.length) return false;
  const byEmail = new Map(b.map((x) => [x.email.toLowerCase(), x]));
  return a.every((x) => {
    const y = byEmail.get(x.email.toLowerCase());
    return (
      y &&
      normalizeAdminRole(y.role) === normalizeAdminRole(x.role) &&
      y.fullName === x.fullName
    );
  });
}

/** Prevent parallel admin syncs from creating duplicate pending queue signals. */
let mentorAdminSyncInflight = false;
let mentorAdminSyncTimer: ReturnType<typeof setTimeout> | undefined;

/** One in-flight registration promise per email. */
const mentorRegistrationInflight = new Map<string, Promise<string | null>>();

const MENTOR_LOGIN_TIMEOUT_MS = 16_000;

async function fetchMentorRosterForLogin(
  localAdmins: AdminUser[],
): Promise<AdminUser[] | null> {
  const remote = (await Promise.race([
    fetchAdminsForLogin(),
    new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), MENTOR_LOGIN_TIMEOUT_MS),
    ),
  ])) as AdminUser[] | null;

  if (remote && remote.length > 0) {
    return mergeAdminsForApprovalSync(localAdmins, remote) as AdminUser[];
  }

  if (localAdmins.length > 0) {
    approvalWarn('mentor', 'login_roster_local_fallback', {
      count: localAdmins.length,
    });
    console.warn('[mentor-auth] Using locally cached mentor roster for login');
    return localAdmins;
  }

  return null;
}

function mentorPendingLoginMessage(): string {
  return MENTOR_AUTH_MSG.pending;
}

function applyRemoteAdmins(
  prev: AuthState,
  remoteAdmins: AdminUser[],
): AuthState {
  const admins = mergeAdminsForApprovalSync(prev.admins, remoteAdmins).map((a) => ({
    ...a,
    role: normalizeAdminRole(a.role),
  })) as AdminUser[];
  const healedApproved = admins.some((a) => {
    const remote = remoteAdmins.find(
      (r) => r.email.toLowerCase() === a.email.toLowerCase(),
    );
    return (
      remote &&
      normalizeAdminRole(a.role) === 'admin' &&
      normalizeAdminRole(remote.role) === 'pending'
    );
  });
  const healedPending = admins.some((a) => {
    if (normalizeAdminRole(a.role) !== 'pending') return false;
    return !remoteAdmins.some(
      (r) => r.email.toLowerCase() === a.email.toLowerCase(),
    );
  });
  if (healedApproved || healedPending) {
    void pushDb({ auth: { admins, admin: null } }).catch(() => undefined);
  }
  let admin = prev.admin;
  if (admin && normalizeAdminRole(admin.role) !== 'super') {
    const remote = admins.find(
      (a) => a.email.toLowerCase() === admin!.email.toLowerCase(),
    );
    // Keep mentor session when either roster says admin (Firebase lag after approve)
    const effective = pickAdminRole(remote?.role, admin.role);
    if (effective !== 'admin') {
      admin = null;
    } else if (normalizeAdminRole(admin.role) !== 'admin') {
      admin = { ...admin, role: 'admin' };
    }
  }
  return { portalOpen: prev.portalOpen, admin, admins };
}

function mergeClientLists(...lists: ClientRequest[][]): ClientRequest[] {
  const byEmail = new Map<string, ClientRequest>();
  for (const list of lists) {
    for (const c of list) {
      const email = c.email.toLowerCase();
      const prev = byEmail.get(email);
      byEmail.set(email, prev ? mergeClientRecord(prev, { ...c, email }) : { ...c, email });
    }
  }
  return [...byEmail.values()].sort((a, b) =>
    (b.paymentClaimedAt || b.createdAt).localeCompare(a.paymentClaimedAt || a.createdAt),
  );
}

async function fetchRemoteDeletedClients(): Promise<string[]> {
  try {
    const { firebaseFetchDeletedClients } = await import('../lib/firebaseDb');
    return await firebaseFetchDeletedClients();
  } catch {
    return [];
  }
}

function clientQueueFingerprint(list: ClientRequest[]): string {
  return list
    .map((c) => `${c.id}:${normalizeClientStatus(c.status)}:${c.email}`)
    .sort()
    .join('|');
}

function mergeSubscriberQueue(
  prev: ClientRequest[],
  remoteList: ClientRequest[] | null | undefined,
  remoteDeleted?: Iterable<string>,
): ClientRequest[] {
  const backup = mergeClientLists(prepaidAsClientRequests(), prev);
  return withoutDeleted(mergeClientsLive(remoteList || [], backup), remoteDeleted);
}

const AdminContext = createContext<Ctx | null>(null);
/** Splash is optional polish only — never wait on network */
const SPLASH_MAX_MS = 0;

type AdminSessionCtx = {
  admin: AdminUser | null;
  portalOpen: boolean;
  logout: () => void;
};

const AdminSessionContext = createContext<AdminSessionCtx | null>(null);

function scheduleIdle(fn: () => void, timeout = 1200): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 0);
  return () => window.clearTimeout(id);
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => migrateAuth());
  // Empty store on first paint — migrateStore can freeze phones before UI appears
  const [store, setStore] = useState<StoreState>({ workspaces: {} });
  // Don't parse 900+ cached clients on the first paint — hydrate after UI is up
  const [clients, setClients] = useState<ClientRequest[]>([]);
  const [clientsLoading, setClientsLoading] = useState(() => !hasCachedSubscriberQueue());
  const [booting, setBooting] = useState(false);
  const clientsSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    // Hydrate local store after first paint so boot splash can dismiss
    return scheduleIdle(() => {
      setStore(migrateStore(auth.admins));
    }, 0);
  }, []);

  useEffect(() => {
    // Offline-first: paint shell, then load cached subscriber queue
    return scheduleIdle(() => {
      if (!isSuperAdminSession()) {
        setClientsLoading(false);
        return;
      }
      const cached = loadCachedClientQueue();
      if (cached.length) setClients(cached);
      setClientsLoading(false);
    }, 200);
  }, []);

  useEffect(() => {
    if (clientsSaveTimer.current) window.clearTimeout(clientsSaveTimer.current);
    clientsSaveTimer.current = window.setTimeout(() => {
      if (clients.length) saveCachedClientQueue(clients);
    }, 900);
    return () => {
      if (clientsSaveTimer.current) window.clearTimeout(clientsSaveTimer.current);
    };
  }, [clients]);

  useEffect(() => {
    saveCachedAdminRoster(auth.admins);
  }, [auth.admins]);

  useEffect(() => {
    pruneClientDeviceStorage();
  }, []);

  // Defer vault heal — portal workspace only (N× heal-all freezes Super Admin taps)
  useEffect(() => {
    return scheduleIdle(() => {
      if (isAdminUiBusy()) return;
      const mentorId = portalAdminId();
      if (!mentorId) return;
      setStore((prev) => healMentorWorkspaceInStore(prev, mentorId));
    }, 1600);
  }, []);

  // Hydrate from disk-backed API so data survives new preview links
  useEffect(() => {
    let cancelled = false;
    let dismissed = false;

    const dismissSplash = () => {
      if (cancelled || dismissed) return;
      dismissed = true;
      setBooting(false);
      try {
        sessionStorage.setItem('lumo-was-ready', '1');
      } catch {
        /* ignore */
      }
      try {
        window.dispatchEvent(new Event('lumo-ready'));
        (
          window as Window & { __lumoMarkReady?: () => void }
        ).__lumoMarkReady?.();
      } catch {
        /* ignore */
      }
    };

    // Instant — never block the dashboard on Firebase / splash polish
    dismissSplash();
    const paintDismiss = window.requestAnimationFrame(() => dismissSplash());
    const hardCap = window.setTimeout(dismissSplash, SPLASH_MAX_MS);

    const applyRemoteDb = (db: RemoteDb | null) => {
      if (cancelled || !db) return;
      // Never stampede React while the drawer/nav is painting — vault can still land.
      const uiBusy = isAdminUiBusy();
      if (Array.isArray(db.auth?.admins) && !uiBusy) {
        // Never take remote "admin" (logged-in user) — that is per-device only.
        // Syncing it made Super Admin and mentors overwrite each other.
        setAuth((prev) => {
          const nextAuth = applyRemoteAdmins(prev, db.auth!.admins as AdminUser[]);
          saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
          return nextAuth;
        });
      }
      if (Array.isArray((db as { revokedKeys?: string[] }).revokedKeys)) {
        saveRevokedKeysLocal([
          ...loadRevokedKeys(),
          ...((db as { revokedKeys?: string[] }).revokedKeys || []),
        ]);
      }
      const adminSession = isAdminPortalSession();
      if (adminSession && db.vault) {
        const revoked = loadRevokedKeys();
        const localVault = loadVault();
        saveVaultLocal(
          mergeVaultKeepAll(
            localVault,
            dbList<VaultLicense>(db.vault).filter(
              (v) =>
                v.status !== 'deleted' &&
                !revoked.some((k) => keysMatch(k, v.key)),
            ),
          ),
        );
        // Defer heal — portal workspace only (heal-all freezes Super on phones)
        scheduleIdle(() => {
          if (cancelled || isAdminUiBusy()) return;
          const mentorId = portalAdminId();
          if (!mentorId) return;
          setStore((prev) => healMentorWorkspaceInStore(prev, mentorId));
        }, 2000);
      }
      if (
        !uiBusy &&
        adminSession &&
        db.store?.workspaces &&
        typeof db.store.workspaces === 'object'
      ) {
        const remoteWs: StoreState['workspaces'] = {};
        const mentorId = portalAdminId();
        // Hot path: heal portal workspace only. Super still merges other mentors
        // cheaply (normalize) so roster pages work without N× vault heals.
        const entries = Object.entries(
          db.store.workspaces as StoreState['workspaces'],
        ).filter(([id]) => isSuperAdminSession() || !mentorId || id === mentorId);
        const vaultNow = loadVault();
        for (const [id, ws] of entries) {
          if (mentorId && id === mentorId) {
            remoteWs[id] = healWorkspaceEas(ws, id, vaultNow).workspace;
          } else {
            remoteWs[id] = normalizeWorkspace(ws, { id } as AdminUser);
          }
        }
        // Merge — never let a thinner remote wipe local EAs / license keys
        setStore((local) => {
          const merged = mergeStoresKeepAll(local, { workspaces: remoteWs });
          saveJSON(STORE_KEY, merged);
          return merged;
        });
      }
      // Images are hydrated separately after paint — never on this critical path
      // Mentors never ingest the global subscriber list into React state
      if (!uiBusy && Array.isArray(db.clients) && isSuperAdminSession()) {
        setClients((prev) => {
          const merged = mergeSubscriberQueue(
            prev,
            db.clients as ClientRequest[],
            (db as { deletedClients?: string[] }).deletedClients,
          );
          if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) {
            return prev;
          }
          return merged;
        });
      }
    };

    // Network sync after first paint — dashboard uses offline cache first
    const cancelNet = scheduleIdle(() => {
      if (cancelled || isAdminUiBusy()) return;
      void (async () => {
        try {
          if (isAdminPortalSession()) {
            // Mentors: workspace/vault only — never await 900+ clients on boot
            const db = await fetchDb();
            if (cancelled || isAdminUiBusy()) return;
            applyRemoteDb(db);
            if (isSuperAdminSession()) {
              const list = await fetchClients();
              if (list && !cancelled && !isAdminUiBusy()) {
                const remoteDeleted = await fetchRemoteDeletedClients();
                if (cancelled || isAdminUiBusy()) return;
                setClients((prev) => {
                  const merged = mergeSubscriberQueue(
                    prev,
                    list as ClientRequest[],
                    remoteDeleted,
                  );
                  if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) {
                    return prev;
                  }
                  return merged;
                });
              }
            }
          } else {
            const list = await fetchClients();
            if (list && !cancelled && !isAdminUiBusy()) {
              const remoteDeleted = await fetchRemoteDeletedClients();
              if (cancelled || isAdminUiBusy()) return;
              setClients((prev) => {
                const merged = mergeSubscriberQueue(prev, list as ClientRequest[], remoteDeleted);
                if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) return prev;
                return merged;
              });
            }
          }
        } catch {
          // Offline or timed out — cached queue stays on screen
        } finally {
          setClientsLoading(false);
          dismissSplash();
        }
      })();
    }, 400);

    // Super Admin only — mentors do not need the 300+ mentor roster on every boot
    const cancelAdmins = scheduleIdle(() => {
      if (cancelled || !isAdminPortalSession() || !isSuperAdminSession()) return;
      void (async () => {
        try {
          const remoteAdmins = (await fetchAdmins()) as AdminUser[] | null;
          if (!remoteAdmins?.length || cancelled) return;
          setAuth((prev) => {
            const nextAuth = applyRemoteAdmins(prev, remoteAdmins);
            saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
            return nextAuth;
          });
        } catch {
          /* cached roster remains visible */
        }
      })();
    }, 900);

    // Admin images after UI is interactive — stops freeze on Generate License taps
    const cancelImages = scheduleIdle(() => {
      if (cancelled || !isAdminPortalSession() || isAdminUiBusy()) return;
      void fetchImagesMap().then((images) => {
        if (cancelled || !images) return;
        mergeRemoteImages(images);
      });
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(hardCap);
      window.cancelAnimationFrame(paintDismiss);
      cancelNet();
      cancelAdmins();
      cancelImages();
    };
  }, []);

  // Subscription queue — Super Admin only (slow). Waiting clients use a lighter
  // interval so phones are not crushed by merging 900+ rows every few seconds.
  useEffect(() => {
    if (booting) return;
    const onWaitingPath =
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/waiting') ||
        window.location.pathname.startsWith('/activate'));
    const needsQueue = isSuperAdminSession() || onWaitingPath;
    if (!needsQueue) {
      setClientsLoading(false);
      return;
    }
    const tick = async () => {
      if (isAdminUiBusy()) return;
      const list = await fetchClients();
      if (isAdminUiBusy()) return;
      if (list) {
        const remoteDeleted = await fetchRemoteDeletedClients();
        if (isAdminUiBusy()) return;
        setClients((prev) => {
          const merged = mergeSubscriberQueue(prev, list as ClientRequest[], remoteDeleted);
          if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) return prev;
          return merged;
        });
      }
      setClientsLoading(false);
    };
    const first = window.setTimeout(
      () => void tick(),
      isSuperAdminSession() ? 1500 : 2500,
    );
    const every = isSuperAdminSession() ? 20_000 : 45_000;
    const id = window.setInterval(tick, every);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [booting]);

  // Keep mentor registration queue fresh for Super Admin approval
  useEffect(() => {
    if (booting || !isAdminPortalSession() || !isSuperAdminSession()) return;
    const syncAdmins = async () => {
      if (isAdminUiBusy()) return;
      if (mentorAdminSyncInflight) return;
      mentorAdminSyncInflight = true;
      try {
        const remoteAdmins = (await fetchAdmins()) as AdminUser[] | null;
        if (!remoteAdmins || isAdminUiBusy()) return;
        setAuth((prev) => {
          const nextAuth = applyRemoteAdmins(prev, remoteAdmins);
          if (adminsMatch(prev.admins, nextAuth.admins)) return prev;
          const addedPending = nextAuth.admins.filter(
            (a) =>
              normalizeAdminRole(a.role) === 'pending' &&
              !prev.admins.some(
                (p) => p.email.toLowerCase() === a.email.toLowerCase(),
              ),
          );
        const lostPending = prev.admins.filter(
          (a) =>
            normalizeAdminRole(a.role) === 'pending' &&
            !nextAuth.admins.some(
              (n) =>
                normalizeAdminRole(n.role) === 'pending' &&
                n.email.toLowerCase() === a.email.toLowerCase(),
            ),
        );
        if (addedPending.length) {
          approvalLog('mentor', 'registration_synced', {
            count: addedPending.length,
            emails: addedPending.map((a) => a.email),
          });
        }
        if (lostPending.length) {
          approvalWarn('mentor', 'pending_preserved_after_sync', {
            count: lostPending.length,
            emails: lostPending.map((a) => a.email),
          });
        }
          saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
          return nextAuth;
        });
      } finally {
        mentorAdminSyncInflight = false;
      }
    };
    const scheduleSyncAdmins = () => {
      if (isAdminUiBusy()) return;
      window.clearTimeout(mentorAdminSyncTimer);
      mentorAdminSyncTimer = window.setTimeout(() => {
        if (isAdminUiBusy()) return;
        void syncAdmins();
      }, 350);
    };
    void syncAdmins();
    const id = window.setInterval(scheduleSyncAdmins, 8000);
    let unwatch: (() => void) | undefined;
    void import('../lib/firebaseDb').then(({ firebaseWatchAdmins }) => {
      unwatch = firebaseWatchAdmins(scheduleSyncAdmins);
    });
    return () => {
      window.clearInterval(id);
      window.clearTimeout(mentorAdminSyncTimer);
      unwatch?.();
    };
  }, [booting]);

  // Pull licenses from Firebase so every admin device sees the same keys
  useEffect(() => {
    if (booting || !auth.admin?.id) return;
    const mentorId = auth.admin.id;
    let syncing = false;
    const syncWorkspace = async () => {
      if (document.visibilityState === 'hidden') return;
      // Don't compete with the sidebar — menu must stay instant on phones
      if (isAdminUiBusy()) return;
      if (syncing) return;
      syncing = true;
      try {
      const db = await fetchDb();
      if (!db || isAdminUiBusy()) return;
      const vaultEntries = dbList<VaultLicense>(db.vault);
      // Images are idle-hydrated once — never re-merge multi-MB maps on every poll
      if (db.vault && licensePublishInFlight === 0) {
        const revoked = loadRevokedKeys();
        saveMergedVaultForMentor(
          mentorId,
          vaultEntries.filter(
            (v) =>
              v.status !== 'deleted' &&
              !revoked.some((k) => keysMatch(k, v.key)),
          ),
        );
      }
      if (isAdminUiBusy()) return;
      const vaultNow = mergedVaultForMentor(mentorId);
      const remoteRaw = db.store?.workspaces?.[mentorId] as AdminWorkspace | undefined;

      if (!remoteRaw) {
        setStore((prev) => healMentorWorkspaceInStore(prev, mentorId));
        // Super Admin only — mentors never download the global client queue here
        if (isSuperAdminSession()) {
          const list = await fetchClients();
          if (list && !isAdminUiBusy()) {
            const remoteDeleted = await fetchRemoteDeletedClients();
            if (isAdminUiBusy()) return;
            setClients((prev) => {
              const merged = mergeSubscriberQueue(
                prev,
                list as ClientRequest[],
                remoteDeleted,
              );
              if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) {
                return prev;
              }
              return merged;
            });
          }
        }
        return;
      }

      const remoteWs = healWorkspaceEas(remoteRaw, mentorId, vaultNow).workspace;
      remoteWs.licenses = filterOwnLicenses(
        remoteWs.licenses,
        mentorId,
        remoteWs.revokedKeys,
      );
      let pushWs: AdminWorkspace | null = null;
      let shouldPushLicenses = false;
      setStore((prev) => {
        const localWs = prev.workspaces[mentorId];
        if (!localWs) {
          const next = {
            ...prev,
            workspaces: { ...prev.workspaces, [mentorId]: remoteWs },
          };
          saveJSON(STORE_KEY, next);
          if (remoteWs.eas.length > 0 || remoteWs.licenses.length > 0) {
            pushWs = remoteWs;
            shouldPushLicenses = remoteWs.licenses.length > 0;
          }
          return next;
        }
        let merged = mergeWorkspaceKeepAll(localWs, remoteWs);
        const healed = healWorkspaceEas(merged, mentorId, mergedVaultForMentor(mentorId));
        merged = healed.workspace;
        merged.licenses = filterOwnLicenses(
          merged.licenses,
          mentorId,
          merged.revokedKeys,
        );
        if (
          healed.restored > 0 ||
          healed.restoredLicenses > 0 ||
          merged.licenses.length > remoteWs.licenses.length
        ) {
          pushWs = merged;
          shouldPushLicenses = merged.licenses.length > remoteWs.licenses.length;
        }
        if (
          workspaceDataFingerprint(merged) === workspaceDataFingerprint(localWs) &&
          healed.restoredLicenses === 0 &&
          healed.restored === 0 &&
          merged.licenses.length === localWs.licenses.length
        ) {
          return prev;
        }
        const next = {
          ...prev,
          workspaces: { ...prev.workspaces, [mentorId]: merged },
        };
        saveJSON(STORE_KEY, next);
        return next;
      });
      if (pushWs) {
        void pushDb({ store: { workspaces: { [mentorId]: pushWs } } });
        if (shouldPushLicenses) {
          void pushLicensesToRemote(mentorId, pushWs);
        }
      }

      const currentWs = loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[mentorId];
      const expected = countExpectedEas(
        currentWs as unknown as Record<string, unknown>,
        mentorId,
        vaultNow,
      );
      const actual = currentWs?.eas?.length ?? 0;
      if (expected > actual) {
        if (isAdminUiBusy()) return;
        const repaired = await maybeRepairEasOnServer(mentorId);
        if (repaired) {
          if (isAdminUiBusy()) return;
          invalidateFetchDbCache();
          const fresh = await fetchDb();
          if (isAdminUiBusy()) return;
          if (fresh?.store?.workspaces?.[mentorId]) {
            if (fresh.vault && licensePublishInFlight === 0) {
              const revoked = loadRevokedKeys();
              saveMergedVaultForMentor(
                mentorId,
                dbList<VaultLicense>(fresh.vault).filter(
                  (v) =>
                    v.status !== 'deleted' &&
                    !revoked.some((k) => keysMatch(k, v.key)),
                ),
              );
            }
            const freshVault = mergedVaultForMentor(mentorId);
            const freshWs = healWorkspaceEas(
              fresh.store.workspaces[mentorId] as AdminWorkspace,
              mentorId,
              freshVault,
            ).workspace;
            freshWs.licenses = filterOwnLicenses(
              freshWs.licenses,
              mentorId,
              freshWs.revokedKeys,
            );
            setStore((prev) => {
              const localWs = prev.workspaces[mentorId];
              const merged = localWs
                ? mergeWorkspaceKeepAll(localWs, freshWs)
                : freshWs;
              const healed = healWorkspaceEas(
                merged,
                mentorId,
                mergedVaultForMentor(mentorId),
              );
              const next = {
                ...prev,
                workspaces: { ...prev.workspaces, [mentorId]: healed.workspace },
              };
              saveJSON(STORE_KEY, next);
              return next;
            });
          }
        }
      }

      const healedNow = healWorkspaceEas(
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[mentorId],
        mentorId,
        mergedVaultForMentor(mentorId),
      );
      if (healedNow.restoredLicenses > 0 && healedNow.workspace.licenses.length > 0) {
        setStore((prev) => {
          const next = {
            ...prev,
            workspaces: { ...prev.workspaces, [mentorId]: healedNow.workspace },
          };
          saveJSON(STORE_KEY, next);
          return next;
        });
        void pushLicensesToRemote(mentorId, healedNow.workspace);
      }

      const visibleLicenses = filterOwnLicenses(
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[mentorId]?.licenses ?? [],
        mentorId,
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[mentorId]?.revokedKeys ?? [],
      );
      // Empty list is normal for new mentors — do NOT invalidate+refetch every poll (froze phones)
      const lastEmptyHeal = emptyLicenseHealedAt.get(mentorId) || 0;
      if (visibleLicenses.length === 0 && Date.now() - lastEmptyHeal > 120_000) {
        if (isAdminUiBusy()) return;
        emptyLicenseHealedAt.set(mentorId, Date.now());
        const fresh = await fetchDb();
        if (isAdminUiBusy()) return;
        if (fresh?.vault && licensePublishInFlight === 0) {
          const revoked = loadRevokedKeys();
          saveMergedVaultForMentor(
            mentorId,
            dbList<VaultLicense>(fresh.vault).filter(
              (v) =>
                v.status !== 'deleted' &&
                !revoked.some((k) => keysMatch(k, v.key)),
            ),
          );
        }
        const merged = hydrateLicenseRemote(fresh);
        if (merged) {
          setStore(healMentorWorkspaceInStore(merged, mentorId));
        } else {
          setStore((prev) => healMentorWorkspaceInStore(prev, mentorId));
        }
      }
      } finally {
        syncing = false;
      }
    };
    void syncWorkspace();
    const useFirebaseWatch = isFirebaseConfigured();
    const poll = useFirebaseWatch
      ? undefined
      : window.setInterval(() => void syncWorkspace(), 20000);
    let unwatch: (() => void) | undefined;
    let debounceTimer: number | undefined;
    let resumeTimer: number | undefined;
    if (useFirebaseWatch) {
      void import('../lib/firebaseDb').then(({ firebaseWatchUpdates }) => {
        // Debounce — publish bumps updatedAt often; syncing every time freezes taps
        unwatch = firebaseWatchUpdates(() => {
          if (document.visibilityState === 'hidden') return;
          if (licensePublishInFlight > 0) return;
          if (isAdminUiBusy()) return;
          if (debounceTimer) window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            if (isAdminUiBusy()) return;
            void syncWorkspace();
          }, 2000);
        });
      });
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      // Soft resume — give Safari a beat before network work
      resumeTimer = window.setTimeout(() => void syncWorkspace(), 700);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (poll) window.clearInterval(poll);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (resumeTimer) window.clearTimeout(resumeTimer);
      document.removeEventListener('visibilitychange', onVisible);
      unwatch?.();
    };
  }, [booting, auth.admin?.id]);

  const saveAuth = useCallback((next: AuthState) => {
    setAuth(next);
    saveJSON(AUTH_KEY, { ...next, portalOpen: false });
    // Only sync the mentor registry — never the active login session
    void pushDb({
      auth: { admins: next.admins, admin: null },
    });
  }, []);

  const saveStore = useCallback((next: StoreState, pushWorkspaceId?: string) => {
    setStore(next);
    saveJSON(STORE_KEY, next);
    if (pushWorkspaceId && next.workspaces[pushWorkspaceId]) {
      void pushDb({
        store: { workspaces: { [pushWorkspaceId]: next.workspaces[pushWorkspaceId] } },
      });
    }
  }, []);

  /** Approve mentors — Firebase first, then local state (never block on fetchAdmins). */
  const approveMentorByIds = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;

    for (const id of unique) {
      const hit = auth.admins.find((a) => a.id === id);
      if (!hit || normalizeAdminRole(hit.role) !== 'pending') {
        approvalWarn('mentor', 'approve_target_missing', { id });
        continue;
      }

      approvalLog('mentor', 'approve_clicked', {
        id: hit.id,
        email: hit.email,
        before: hit.role,
      });

      let result = await patchAdminRole(hit.id, 'admin', hit as Record<string, unknown>);
      if (!result?.admin || !isApprovedAdminRole(result.admin.role)) {
        result = await patchAdminRole(hit.email, 'admin', hit as Record<string, unknown>);
      }
      if (!result?.admin || !isApprovedAdminRole(result.admin.role)) {
        approvalError('mentor', 'database_update_failure', {
          id: hit.id,
          email: hit.email,
        });
        throw new Error(MENTOR_AUTH_MSG.approveFailed);
      }

      const approved: AdminUser = {
        ...hit,
        ...(result.admin as AdminUser),
        role: 'admin',
      };

      setAuth((prev) => {
        const nextAdmins = prev.admins.map((a) =>
          a.id === hit.id || a.email.toLowerCase() === hit.email.toLowerCase()
            ? approved
            : { ...a, role: normalizeAdminRole(a.role) },
        );
        const next = { ...prev, admins: nextAdmins };
        saveJSON(AUTH_KEY, { ...next, portalOpen: false });
        void pushDb({ auth: { admins: nextAdmins, admin: null } }).catch(() => undefined);
        return next;
      });

      setStore((storePrev) => {
        if (storePrev.workspaces[approved.id]) return storePrev;
        const workspaces = {
          ...storePrev.workspaces,
          [approved.id]: createEmptyWorkspace(approved),
        };
        const nextStore = { ...storePrev, workspaces };
        saveJSON(STORE_KEY, nextStore);
        void pushDb({ store: { workspaces: { [approved.id]: workspaces[approved.id] } } }).catch(
          () => undefined,
        );
        return nextStore;
      });

      approvalLog('mentor', 'database_update_success', {
        id: approved.id,
        email: approved.email,
        after: approved.role,
      });
    }
  }, [auth.admins]);

  const warmLicenseCache = useCallback(() => {
    pruneClientDeviceStorage();
    if (isAdminPortalSession()) {
      void (async () => {
        const remote = await fetchDb();
        const merged = hydrateLicenseRemote(remote);
        if (merged) setStore(merged);
        const adminId = auth.admin?.id;
        if (!adminId) return;
        const ws = merged?.workspaces[adminId] ?? loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId];
        const expected = countExpectedEas(
          ws as unknown as Record<string, unknown>,
          adminId,
          loadVault(),
        );
        if ((ws?.eas?.length ?? 0) < expected) {
          await maybeRepairEasOnServer(adminId);
          const fresh = hydrateLicenseRemote(await fetchDb());
          if (fresh) setStore(fresh);
        } else {
          const wsNow =
            merged?.workspaces[adminId] ??
            loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId];
          const vaultNow = loadVault().filter(
            (v) => (v.ownerAdminId || adminId) === adminId && v.status !== 'deleted',
          );
          const licenseHeal = healLicensesFromVault<LicenseRecord>(
            wsNow || { licenses: [] },
            adminId,
            vaultNow,
          );
          if (licenseHeal.restored > 0 && wsNow) {
            const healedWs = healWorkspaceEas(
              { ...wsNow, licenses: licenseHeal.licenses },
              adminId,
              vaultNow,
            ).workspace;
            setStore((prev) => {
              const next = {
                ...prev,
                workspaces: { ...prev.workspaces, [adminId]: healedWs },
              };
              saveJSON(STORE_KEY, next);
              return next;
            });
            void pushLicensesToRemote(adminId, healedWs);
          }
        }
      })();
    }
  }, [auth.admin?.id]);

  const restoreLicensesFromCloud = useCallback(async () => {
    const adminId = auth.admin?.id;
    if (!adminId) return { ok: false as const, error: 'Not logged in' };
    try {
      invalidateFetchDbCache();
      const db = await fetchDb();
      const cloudVault = dbList<VaultLicense>(db?.vault).filter(
        (v) => v.status === 'active' || v.status === 'assigned',
      );
      // Unban any live cloud keys so clients can activate again
      if (cloudVault.length) {
        unrevokeLicenseKeys(cloudVault.map((v) => v.key));
      }
      if (db?.vault && licensePublishInFlight === 0) {
        saveMergedVaultForMentor(
          adminId,
          dbList<VaultLicense>(db.vault).filter((v) => v.status !== 'deleted'),
        );
      }
      const hydrated = hydrateLicenseRemote(db);
      let healedWs: AdminWorkspace | null = null;
      setStore((prev) => {
        const base = hydrated ?? prev;
        const isSuper = adminId === SUPER_ADMIN_ID;
        const healed = healWorkspaceEas(
          base.workspaces[adminId] ?? prev.workspaces[adminId],
          adminId,
          vaultForMentor(adminId, isSuper),
        );
        const licenseHeal = healLicensesFromVault<LicenseRecord>(
          healed.workspace,
          adminId,
          vaultForMentor(adminId, isSuper),
          [],
          { includeAllVault: isSuper },
        );
        healedWs = {
          ...healed.workspace,
          licenses: licenseHeal.licenses,
          revokedKeys: (healed.workspace.revokedKeys || []).filter(
            (k) => !licenseHeal.licenses.some((l) => keysMatch(l.key, k)),
          ),
        };
        const next = healAllWorkspacesFromVault({
          ...base,
          workspaces: {
            ...base.workspaces,
            [adminId]: healedWs,
          },
        });
        saveJSON(STORE_KEY, next);
        return next;
      });

      // Republish local+healed keys to Firebase (fixes keys that only lived on device)
      const wsNow =
        healedWs ||
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId];
      if (wsNow?.licenses?.length) {
        unrevokeLicenseKeys(wsNow.licenses.map((l) => l.key));
        await pushLicensesToRemote(adminId, wsNow).catch((err) => {
          licenseError('restore', 'republish failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // Pending subscriptions — Super Admin only (mentors don't use this queue)
      if (isSuperAdminSession() && !isAdminUiBusy()) {
        void repairClientQueueRemote().catch(() => undefined);
        const list = await fetchClients();
        if (list && !isAdminUiBusy()) {
          const remoteDeleted = await fetchRemoteDeletedClients();
          if (isAdminUiBusy()) {
            /* skip React update — cache already has prior queue */
          } else {
            setClients((prev) => {
              const merged = mergeSubscriberQueue(
                prev,
                list as ClientRequest[],
                remoteDeleted,
              );
              if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) {
                return prev;
              }
              saveCachedClientQueue(merged);
              return merged;
            });
          }
        }
      }
      const licenses =
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId]?.licenses
          ?.length ?? 0;
      return { ok: true as const, restored: licenses, licenses };
    } catch {
      return { ok: false as const, error: 'Network error while restoring license keys' };
    }
  }, [auth.admin?.id]);

  const restoreEAsFromCloud = useCallback(async () => {
    const adminId = auth.admin?.id;
    if (!adminId) return { ok: false as const, error: 'Not logged in' };
    try {
      invalidateFetchDbCache();
      await maybeRepairEasOnServer(adminId);
      const db = await fetchDb();
      const merged = hydrateLicenseRemote(db);
      if (merged) {
        setStore((prev) => {
          const remoteWs = merged.workspaces[adminId];
          if (!remoteWs) return merged;
          const localWs = prev.workspaces[adminId];
          const combined = localWs
            ? mergeWorkspaceKeepAll(localWs, remoteWs)
            : remoteWs;
          const healed = healWorkspaceEas(
            combined,
            adminId,
            mergedVaultForMentor(adminId),
          );
          const next = {
            ...prev,
            workspaces: { ...prev.workspaces, [adminId]: healed.workspace },
          };
          saveJSON(STORE_KEY, next);
          return next;
        });
      }
      const ws =
        loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId];
      const eas = ws?.eas?.length ?? 0;
      return { ok: true as const, restored: eas, eas };
    } catch {
      return { ok: false as const, error: 'Network error while restoring EAs' };
    }
  }, [auth.admin?.id]);

  const resyncLicenses = useCallback(() => {
    const mentorId = auth.admin?.id ?? '';
    if (!mentorId || licensePublishInFlight > 0) return;
    invalidateFetchDbCache();
    void fetchDb().then((db) => {
      if (!db) return;
      const vaultEntries = dbList<VaultLicense>(db.vault);
      if (db.vault && licensePublishInFlight === 0) {
        const revoked = loadRevokedKeys();
        saveMergedVaultForMentor(
          mentorId,
          vaultEntries.filter(
            (v) =>
              v.status !== 'deleted' &&
              !revoked.some((k) => keysMatch(k, v.key)),
          ),
        );
      }
      const remoteRaw = db.store?.workspaces?.[mentorId] as AdminWorkspace | undefined;
      setStore((prev) => {
        const before = prev.workspaces[mentorId]?.licenses?.length ?? 0;
        const next = healMentorWorkspaceInStore(
          prev,
          mentorId,
          prev.workspaces[mentorId],
          remoteRaw,
        );
        const after = next.workspaces[mentorId]?.licenses?.length ?? 0;
        if (after > before) {
          void pushLicensesToRemote(mentorId, next.workspaces[mentorId]);
        }
        return next;
      });
    });
  }, [auth.admin]);

  // One light hydrate after login — the old warm+resync+restore stack froze phones
  useEffect(() => {
    if (booting || !auth.admin?.id) return;
    const mentorId = auth.admin.id;
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      if (cancelled || isAdminUiBusy()) return;
      invalidateFetchDbCache();
      void (async () => {
        try {
          const db = await fetchDb();
          if (cancelled || isAdminUiBusy()) return;
          const remoteWs = db?.store?.workspaces?.[mentorId] as
            | AdminWorkspace
            | undefined;
          if (db?.vault && licensePublishInFlight === 0) {
            const revoked = loadRevokedKeys();
            saveMergedVaultForMentor(
              mentorId,
              dbList<VaultLicense>(db.vault).filter(
                (v) =>
                  v.status !== 'deleted' &&
                  !revoked.some((k) => keysMatch(k, v.key)),
              ),
            );
          }
          setStore((prev) =>
            healMentorWorkspaceInStore(
              prev,
              mentorId,
              prev.workspaces[mentorId],
              remoteWs,
            ),
          );
        } catch {
          /* offline — local workspace stays */
        }
        // Do NOT auto deep-restore for Super — heal-all + 900 clients freezes the portal.
        // Super can tap Restore Licenses manually when needed.
      })();
    }, 600);
    return () => {
      cancelled = true;
      cancel();
    };
  }, [booting, auth.admin?.id]);

  const patchWorkspace = useCallback(
    (adminId: string, updater: (ws: AdminWorkspace) => AdminWorkspace, seed?: AdminUser) => {
      setStore((prev) => {
        const current = prev.workspaces[adminId] ?? createEmptyWorkspace(seed ?? { id: adminId });
        const nextWs = updater(current);
        const next = {
          ...prev,
          workspaces: { ...prev.workspaces, [adminId]: nextWs },
        };
        saveJSON(STORE_KEY, next);
        // Only push THIS admin's workspace — never rewrite every mentor's portal
        void pushDb({ store: { workspaces: { [adminId]: nextWs } } });
        return next;
      });
    },
    [],
  );

  const allLicenses = useMemo(
    () => Object.values(store.workspaces).flatMap((ws) => ws.licenses),
    [store.workspaces],
  );

  const logout = useCallback(() => {
    setAuth((prev) => {
      const next = { ...prev, admin: null, portalOpen: false };
      saveJSON(AUTH_KEY, next);
      return next;
    });
  }, []);

  const sessionValue = useMemo<AdminSessionCtx>(
    () => ({
      admin: auth.admin,
      portalOpen: auth.portalOpen,
      logout,
    }),
    [auth.admin, auth.portalOpen, logout],
  );

  // Offline-first dashboard cache — shell paints cached numbers while sync runs
  useEffect(() => {
    const adminId = auth.admin?.id;
    if (!adminId) return;
    const isSuper = auth.admin?.role === 'super' || adminId === SUPER_ADMIN_ID;
    // Core normalize only — vault heal in useMemo froze every poll
    const workspace = normalizeWorkspaceCore(
      store.workspaces[adminId],
      auth.admin ?? undefined,
    );
    const portalLicenses = filterOwnLicenses(
      workspace.licenses,
      adminId,
      isSuper ? [] : workspace.revokedKeys || [],
      isSuper,
    );
    const activeLicenses = portalLicenses.filter(
      (l) => l.status === 'active' || l.status === 'assigned',
    ).length;
    const ownClientEmails = new Set(
      portalLicenses
        .filter((l) => l.status === 'active' || l.status === 'assigned')
        .map((l) => l.clientEmail.toLowerCase()),
    );
    saveDashStats({
      adminId,
      activeLicenses,
      totalClients: isSuper ? clients.length : ownClientEmails.size,
      pendingClients: isSuper
        ? countClientQueue(clients).pending
        : workspace.licenses.filter((l) => l.status === 'assigned').length,
      deletedLicenses: (workspace.revokedKeys || []).length,
      approvedClients: isSuper ? countClientQueue(clients).approved : 0,
      firstName:
        workspace.profile.firstName ||
        auth.admin?.fullName?.split(' ')[0] ||
        'Admin',
      mentorId: workspace.profile.mentorId || adminId,
      role: auth.admin?.role || 'admin',
      at: Date.now(),
    });
  }, [auth.admin, store.workspaces, clients]);

  const getClientByEmail = useCallback(
    (email: string) => {
      const normalized = email.trim().toLowerCase();
      const fromClients = clients.find((c) => c.email.toLowerCase() === normalized);
      const fromWorkspace = Object.values(store.workspaces)
        .flatMap((ws) => ws.clientRequests)
        .find((c) => c.email.toLowerCase() === normalized);
      if (!fromClients) return fromWorkspace;
      if (!fromWorkspace) return fromClients;
      return mergeClientLists([fromClients], [fromWorkspace])[0];
    },
    [clients, store.workspaces],
  );

  const refreshClientQueue = useCallback(async () => {
    void repairClientQueueRemote().catch(() => undefined);
    const list = await Promise.race([
      fetchClients(),
      new Promise<RemoteDb['clients'] | null>((resolve) =>
        window.setTimeout(() => resolve(null), 10_000),
      ),
    ]);
    const remoteDeleted = await Promise.race([
      fetchRemoteDeletedClients(),
      new Promise<string[]>((resolve) => window.setTimeout(() => resolve([]), 5000)),
    ]);
    let counts = { pending: 0, approved: 0, total: 0 };
    setClients((prev) => {
      const merged = mergeSubscriberQueue(
        prev,
        (list as ClientRequest[]) || [],
        remoteDeleted,
      );
      if (clientQueueFingerprint(prev) === clientQueueFingerprint(merged)) {
        counts = countClientQueue(prev);
        return prev;
      }
      saveCachedClientQueue(merged);
      counts = countClientQueue(merged);
      return merged;
    });
    approvalLog('client', 'queue_refreshed', counts);
    return { ok: true as const, ...counts };
  }, []);

  const value = useMemo<Ctx>(() => {
    const adminId = auth.admin?.id ?? '';
    // Do NOT vault-heal here — that ran on every clients/store tick and froze taps
    const workspace = normalizeWorkspaceCore(
      adminId ? store.workspaces[adminId] : undefined,
      auth.admin ?? undefined,
    );

    const isSuper = auth.admin?.role === 'super' || adminId === SUPER_ADMIN_ID;
    const portalLicenses = filterOwnLicenses(
      workspace.licenses,
      adminId,
      isSuper ? [] : workspace.revokedKeys || [],
      isSuper,
    );
    const activeLicenses = portalLicenses.filter(
      (l) => l.status === 'active' || l.status === 'assigned',
    ).length;
    const deletedLicenses = (workspace.revokedKeys || []).length;
    const ownClientEmails = new Set(
      portalLicenses
        .filter((l) => l.status === 'active' || l.status === 'assigned')
        .map((l) => l.clientEmail.toLowerCase()),
    );

    return {
      portalOpen: auth.portalOpen,
      admin: auth.admin,
      admins: auth.admins,
      openPortal: () =>
        // Entering the portal always asks for email + password — never
        // auto-resume a saved Super Admin / mentor session from this device
        setAuth((a) => {
          const next = { ...a, admin: null, portalOpen: true };
          saveJSON(AUTH_KEY, { ...next, portalOpen: false });
          return next;
        }),
      closePortal: () => setAuth((a) => ({ ...a, portalOpen: false })),
      login: async (email, password) => {
        try {
        const normalized = email.trim().toLowerCase();
        if (
          normalized === SUPER_ADMIN.email.toLowerCase() &&
          (await sha256Hex(password)) === SUPER_ADMIN.passwordSha256
        ) {
          const id = SUPER_ADMIN.user.id;
          if (!store.workspaces[id]) {
            saveStore(
              {
                ...store,
                workspaces: {
                  ...store.workspaces,
                  [id]: createEmptyWorkspace({
                    id,
                    email: SUPER_ADMIN.email,
                    fullName: SUPER_ADMIN.user.fullName,
                  }),
                },
              },
              id,
            );
          }
          saveAuth({ ...auth, admin: SUPER_ADMIN.user, portalOpen: true });
          // Pull full vault immediately so all generated keys appear without any Restore button
          invalidateFetchDbCache();
          void fetchDb().then((db) => {
            const merged = hydrateLicenseRemote(db);
            if (merged) {
              setStore(healMentorWorkspaceInStore(merged, id));
            } else {
              setStore((prev) => healMentorWorkspaceInStore(prev, id));
            }
          });
          return null;
        }

        approvalLog('mentor', 'login_attempt', { email: normalized });

        // Server verifies password — roster GETs no longer include passwords
        const remoteLogin = await loginMentorRemote(normalized, password);
        if (remoteLogin?.ok && remoteLogin.admin) {
          const remoteAdmin = remoteLogin.admin as AdminUser;
          const mentor = withoutAdminPassword({
            ...remoteAdmin,
            id: String(remoteAdmin.id || ''),
            email: normalized,
            role: 'admin',
            fullName: String(remoteAdmin.fullName || ''),
          });
          // Enter portal immediately — do NOT await the 300+ mentor roster
          // (that was freezing phones on "Signing in…" for 10–18s)
          const roster = mergeAdminsForApprovalSync(auth.admins, [
            mentor,
          ]) as AdminUser[];
          if (!store.workspaces[mentor.id]) {
            saveStore(
              {
                ...store,
                workspaces: {
                  ...store.workspaces,
                  [mentor.id]: createEmptyWorkspace(mentor),
                },
              },
              mentor.id,
            );
          }
          saveAuth({
            ...auth,
            admins: withoutAdminPasswords(roster),
            admin: mentor,
            portalOpen: true,
          });
          // Refresh mentor queue in the background (Super Admin approve list)
          void fetchMentorRosterForLogin(auth.admins).then((remoteAdmins) => {
            if (!remoteAdmins?.length) return;
            setAuth((prev) => {
              const nextAuth = applyRemoteAdmins(prev, remoteAdmins);
              saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
              return nextAuth;
            });
          });
          approvalLog('mentor', 'login_success', {
            email: normalized,
            id: mentor.id,
            source: 'api',
          });
          return null;
        }
        if (remoteLogin && !remoteLogin.ok) {
          if (remoteLogin.error === 'pending') {
            return mentorPendingLoginMessage();
          }
          return MENTOR_AUTH_MSG.invalidCredentials;
        }

        // API unreachable — last-resort same-device local password (registration on this browser)
        const localHit = auth.admins.find(
          (a) => a.email.toLowerCase() === normalized,
        );
        if (localHit && String(localHit.password || '') === password) {
          const role = normalizeAdminRole(localHit.role);
          if (role === 'pending' || role !== 'admin') {
            return mentorPendingLoginMessage();
          }
          const mentor = withoutAdminPassword({
            ...localHit,
            role: 'admin',
            email: normalized,
          });
          saveAuth({
            ...auth,
            admins: withoutAdminPasswords(auth.admins),
            admin: mentor,
            portalOpen: true,
          });
          approvalLog('mentor', 'login_success', {
            email: normalized,
            id: mentor.id,
            source: 'local_fallback',
          });
          return null;
        }

        approvalWarn('mentor', 'login_fetch_timeout', { email: normalized });
        console.warn('[mentor-auth] Login API unavailable for', normalized);
        return MENTOR_AUTH_MSG.unavailable;
        } catch (err) {
          approvalError('mentor', 'login_exception', {
            email: email.trim().toLowerCase(),
            error: err instanceof Error ? err.message : String(err),
          });
          console.error('[mentor-auth] Login exception', err);
          return MENTOR_AUTH_MSG.unableToSignIn;
        }
      },
      registerAdmin: async (form) => {
        const email = normalizeRegistrationEmail(form.email);
        if (!email || !form.password || !form.fullName.trim()) {
          return MENTOR_AUTH_MSG.registerRequired;
        }
        if (!isRegistrationEmail(email)) {
          return MENTOR_AUTH_MSG.registerRequired;
        }
        if (email === SUPER_ADMIN.email.toLowerCase()) {
          return MENTOR_AUTH_MSG.emailReserved;
        }

        const inflight = mentorRegistrationInflight.get(email);
        if (inflight) return inflight;

        const work = (async (): Promise<string | null> => {
          const remoteAdmins = ((await Promise.race([
            fetchAdmins(),
            new Promise<AdminUser[] | null>((resolve) =>
              window.setTimeout(() => resolve(null), 5000),
            ),
          ])) || []) as AdminUser[];
          const knownEmails = new Set(
            [...auth.admins, ...remoteAdmins].map((a) => a.email.toLowerCase()),
          );
          if (knownEmails.has(email)) {
            return MENTOR_AUTH_MSG.emailInUse;
          }
          approvalLog('mentor', 'registration_submit', { email });
          const serverEntry = await postMentorRegistration({
            email,
            password: form.password,
            fullName: form.fullName.trim(),
            mentorName: form.mentorName,
            eaName: form.eaName,
            phone: form.phone,
            mainText: form.mainText,
          });
          if (!serverEntry) {
            approvalError('mentor', 'registration_submit_failed', { email });
            return MENTOR_AUTH_MSG.registerUnavailable;
          }
          const entry: AdminUser = {
            ...(serverEntry as AdminUser),
            email,
            role: 'pending',
            // Same-device offline login fallback only — never returned by API roster
            password: form.password,
          };
          const workspace = createEmptyWorkspace(entry);
          const nextAdmins = mergeAdmins(auth.admins, [entry]) as AdminUser[];
          const nextStore = {
            ...store,
            workspaces: {
              ...store.workspaces,
              [entry.id]: store.workspaces[entry.id] || workspace,
            },
          };
          const nextAuth = { ...auth, admins: nextAdmins };
          setStore(nextStore);
          saveJSON(STORE_KEY, nextStore);
          setAuth(nextAuth);
          saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
          approvalLog('mentor', 'registration_created', {
            email,
            id: entry.id,
            status: entry.role,
          });
          return null;
        })();

        mentorRegistrationInflight.set(email, work);
        try {
          return await work;
        } finally {
          mentorRegistrationInflight.delete(email);
        }
      },
      logout,
      approveAdmin: (id) => approveMentorByIds([id]),
      approveAdmins: (ids) => approveMentorByIds(ids),
      deleteAdmin: (id) => {
        if (id === SUPER_ADMIN.user.id) return;
        const nextAdmins = auth.admins.filter((a) => a.id !== id);
        const nextWorkspaces = { ...store.workspaces };
        delete nextWorkspaces[id];
        saveStore({ ...store, workspaces: nextWorkspaces });
        saveAuth({
          ...auth,
          admins: nextAdmins,
          admin: auth.admin?.id === id ? null : auth.admin,
        });
      },
      // Platform subscriptions are Super Admin only — mentors never see shared queue
      clientRequests: isSuper ? clients : [],
      submitClientRegistration: (input) => {
        const email = input.email.trim().toLowerCase();
        // Registering again lifts a previous deletion for this email
        forgetDeletedClient(email);
        const prepaid = findPrepaidClient(email);
        const existing =
          clients.find((c) => c.email === email) ||
          Object.values(store.workspaces)
            .flatMap((ws) => ws.clientRequests)
            .find((c) => c.email === email);

        const asPaid = Boolean(prepaid || isPrepaidEmail(email));
        if (existing) {
          const upgraded: ClientRequest = asPaid
            ? {
                ...existing,
                firstName: input.firstName.trim() || existing.firstName,
                lastName: input.lastName.trim() || existing.lastName,
                status: 'approved',
                paymentClaimed: true,
                paymentClaimedAt: existing.paymentClaimedAt || new Date().toISOString(),
              }
            : existing;
          setClients((prev) => {
            const without = prev.filter((c) => c.email !== email);
            return [upgraded, ...without];
          });
          void postClient({
            email,
            firstName: upgraded.firstName,
            lastName: upgraded.lastName,
            status: asPaid ? 'approved' : 'pending',
            paymentClaimed: asPaid,
            paymentClaimedAt: upgraded.paymentClaimedAt,
          })
            .then(async (serverEntry) => {
              if (!serverEntry) return;
              if (asPaid) {
                await patchClient(serverEntry.id || upgraded.id, {
                  status: 'approved',
                  paymentClaimed: true,
                  paymentClaimedAt: upgraded.paymentClaimedAt,
                }).catch(() => undefined);
              }
              setClients((prev) =>
                mergeClientLists(prev, [
                  {
                    ...(serverEntry as ClientRequest),
                    ...(asPaid
                      ? {
                          status: 'approved' as const,
                          paymentClaimed: true,
                          paymentClaimedAt: upgraded.paymentClaimedAt,
                        }
                      : null),
                  } as ClientRequest,
                ]),
              );
            })
            .catch(() => undefined);
          return upgraded;
        }
        const entry: ClientRequest = {
          id: `cli-${Date.now()}`,
          email,
          firstName: input.firstName.trim() || prepaid?.firstName || 'Client',
          lastName: input.lastName.trim() || prepaid?.lastName || '',
          status: asPaid ? 'approved' : 'pending',
          createdAt: new Date().toISOString(),
          notifiedAt: new Date().toISOString(),
          paymentClaimed: asPaid,
          paymentClaimedAt: asPaid ? new Date().toISOString() : undefined,
        };
        approvalLog('client', 'registration_created', {
          email,
          status: entry.status,
          prepaid: asPaid,
        });
        setClients((prev) => [entry, ...prev.filter((c) => c.email !== email)]);
        const sid = SUPER_ADMIN.user.id;
        const superWs =
          store.workspaces[sid] ??
          createEmptyWorkspace({
            id: sid,
            email: SUPER_ADMIN.email,
            fullName: SUPER_ADMIN.user.fullName,
          });
        saveStore(
          {
            ...store,
            workspaces: {
              ...store.workspaces,
              [sid]: {
                ...superWs,
                clientRequests: [entry, ...superWs.clientRequests.filter((c) => c.email !== email)],
              },
            },
          },
          sid,
        );
        void postClient({
          email,
          firstName: entry.firstName,
          lastName: entry.lastName,
          status: entry.status,
          paymentClaimed: entry.paymentClaimed,
          paymentClaimedAt: entry.paymentClaimedAt,
        })
          .then(async (serverEntry) => {
            if (!serverEntry) return;
            if (asPaid) {
              await patchClient(serverEntry.id || entry.id, {
                status: 'approved',
                paymentClaimed: true,
                paymentClaimedAt: entry.paymentClaimedAt,
              }).catch(() => undefined);
            }
            setClients((prev) => {
              const without = prev.filter((c) => c.email !== email);
              return [
                {
                  ...(serverEntry as ClientRequest),
                  ...(asPaid
                    ? {
                        status: 'approved' as const,
                        paymentClaimed: true,
                        paymentClaimedAt: entry.paymentClaimedAt,
                      }
                    : null),
                } as ClientRequest,
                ...without,
              ];
            });
          })
          .catch(() => undefined);
        return entry;
      },
      approveClient: async (id) => {
        const hit =
          clients.find((c) => c.id === id) ||
          clients.find((c) => c.email.toLowerCase() === id.toLowerCase());
        if (!hit) {
          approvalWarn('client', 'approve_target_missing', { id });
          throw new Error('Client not found in queue.');
        }
        const email = hit.email.toLowerCase();
        approvalLog('client', 'approve_clicked', {
          id: hit.id,
          email,
          before: hit.status,
        });
        const claimedAt = hit.paymentClaimedAt || new Date().toISOString();
        const approved: ClientRequest = {
          ...hit,
          status: 'approved',
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        };
        setClients((prev) => mergeClientLists(prev, [approved]));
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [approved]),
        }));

        let server = await patchClient(hit.id, {
          status: 'approved',
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        });
        if (!server) {
          server = await patchClient(email, {
            status: 'approved',
            paymentClaimed: true,
            paymentClaimedAt: claimedAt,
          });
        }
        if (!server || normalizeClientStatus(server.status) !== 'approved') {
          approvalError('client', 'database_update_failure', {
            id: hit.id,
            email,
            response: server,
          });
          throw new Error(
            'Could not save approval to Firebase. Check connection and try again.',
          );
        }

        const merged: ClientRequest = {
          ...(server as ClientRequest),
          status: 'approved',
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        };
        setClients((prev) => mergeClientLists(prev, [merged]));
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [merged]),
        }));
        approvalLog('client', 'database_update_success', {
          id: merged.id,
          email,
          before: hit.status,
          after: merged.status,
        });

        try {
          await pushSession(email, { accessStatus: 'approved' });
          approvalLog('client', 'session_sync_success', { email, accessStatus: 'approved' });
        } catch (err) {
          approvalWarn('client', 'session_sync_failure', {
            email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
      addApprovedSubscriber: async (input) => {
        const email = normalizeRegistrationEmail(input.email);
        if (!isRegistrationEmail(email)) {
          return { ok: false, error: 'Enter a valid email address.' };
        }
        forgetDeletedClient(email);
        const fromEmail = splitNameFromEmail(email);
        const firstName = input.firstName.trim() || fromEmail.firstName;
        const lastName = input.lastName.trim() || fromEmail.lastName;
        const claimedAt = new Date().toISOString();
        approvalLog('client', 'manual_create_clicked', { email, firstName, lastName });

        let posted: ClientRequest | null = null;
        try {
          posted = (await postClient({
            email,
            firstName,
            lastName,
            status: 'approved',
            paymentClaimed: true,
            paymentClaimedAt: claimedAt,
          })) as ClientRequest | null;
        } catch (err) {
          approvalError('client', 'manual_create_failure', {
            email,
            error: err instanceof Error ? err.message : String(err),
          });
          return {
            ok: false,
            error: 'Could not save subscriber to Firebase. Check connection and try again.',
          };
        }

        if (!posted) {
          return {
            ok: false,
            error: 'Could not save subscriber to Firebase. Check connection and try again.',
          };
        }

        let patched = await patchClient(posted.id || email, {
          status: 'approved',
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        });
        if (!patched) {
          patched = await patchClient(email, {
            status: 'approved',
            paymentClaimed: true,
            paymentClaimedAt: claimedAt,
          });
        }
        if (!patched || normalizeClientStatus(patched.status) !== 'approved') {
          approvalError('client', 'manual_create_failure', {
            email,
            id: posted.id,
            response: patched,
          });
          return {
            ok: false,
            error: 'Subscriber was created but approval did not persist. Try Approve on the list.',
          };
        }

        const merged: ClientRequest = {
          ...(patched as ClientRequest),
          email,
          firstName: firstName || patched.firstName,
          lastName: lastName || patched.lastName,
          status: 'approved',
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        };
        const sid = SUPER_ADMIN.user.id;
        setClients((prev) => mergeClientLists(prev, [merged]));
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [merged]),
        }));
        try {
          await pushSession(email, { accessStatus: 'approved' });
        } catch (err) {
          approvalWarn('client', 'session_sync_failure', {
            email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        approvalLog('client', 'manual_create_success', {
          id: merged.id,
          email,
          after: merged.status,
        });
        return { ok: true, client: merged };
      },
      markClientPaid: (id) => {
        const hit = clients.find((c) => c.id === id);
        if (!hit || hit.paymentClaimed) return;
        const email = hit.email.toLowerCase();
        const claimedAt = new Date().toISOString();
        const updated: ClientRequest = {
          ...hit,
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        };
        setClients((prev) => mergeClientLists(prev, [updated]));
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [updated]),
        }));
        void pushDb({ clients: mergeClientLists(clients, [updated]) }).catch(() => undefined);
        const applyPaid = (server: ClientRequest | null) => {
          if (!server) return;
          setClients((prev) => mergeClientLists(prev, [server as ClientRequest]));
        };
        void patchClient(hit.id, {
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        })
          .then(async (server) => {
            if (server) {
              applyPaid(server as ClientRequest);
              return;
            }
            applyPaid(
              (await patchClient(email, {
                paymentClaimed: true,
                paymentClaimedAt: claimedAt,
              })) as ClientRequest | null,
            );
          })
          .catch(() => undefined);
      },
      rejectClient: (id) => {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'rejected' } : c)),
        );
        void patchClient(id, { status: 'rejected' }).catch(() => undefined);
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: ws.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'rejected' } : c,
          ),
        }));
      },
      deleteClient: (id) => {
        const hit = clients.find((c) => c.id === id);
        if (hit) rememberDeletedClient(hit.email);
        setClients((prev) => prev.filter((c) => c.id !== id));
        void deleteClientRemote(hit?.email || id).catch(() => undefined);
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: ws.clientRequests.filter(
            (c) => c.id !== id && (!hit || c.email !== hit.email),
          ),
        }));
      },
      claimClientPayment: async (email) => {
        const normalized = email.trim().toLowerCase();
        const prepaid = findPrepaidClient(normalized);
        let current =
          clients.find((c) => c.email.toLowerCase() === normalized) ||
          Object.values(store.workspaces)
            .flatMap((ws) => ws.clientRequests)
            .find((c) => c.email.toLowerCase() === normalized);

        if (!current) {
          try {
            current = (await postClient({
              email: normalized,
              firstName: prepaid?.firstName || normalized.split('@')[0] || 'Client',
              lastName: prepaid?.lastName || 'User',
            })) as ClientRequest;
          } catch {
            if (prepaid) {
              current = {
                id: `cli-prepaid-local-${Date.now()}`,
                email: normalized,
                firstName: prepaid.firstName,
                lastName: prepaid.lastName,
                status: 'approved',
                createdAt: new Date().toISOString(),
                paymentClaimed: true,
              };
            } else {
              return null;
            }
          }
        }

        const claimedAt = new Date().toISOString();
        const autoApprove = Boolean(prepaid || isPrepaidEmail(normalized) || current.status === 'approved');
        const updated: ClientRequest = {
          ...current,
          status: autoApprove ? 'approved' : current.status,
          paymentClaimed: true,
          paymentClaimedAt: claimedAt,
        };
        setClients((prev) => {
          const without = prev.filter((c) => c.email.toLowerCase() !== normalized);
          return [updated, ...without];
        });
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [updated]),
        }));
        try {
          const server = await Promise.race([
            patchClient(current.email, {
              status: autoApprove ? 'approved' : undefined,
              paymentClaimed: true,
              paymentClaimedAt: claimedAt,
            }),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
          ]);
          if (server) {
            const merged = { ...updated, ...server, status: autoApprove ? 'approved' : server.status } as ClientRequest;
            setClients((prev) => {
              const without = prev.filter((c) => c.email.toLowerCase() !== normalized);
              return [merged, ...without];
            });
            return merged;
          }
        } catch {
          // local claim still visible to this device
        }
        return updated;
      },
      getClientByEmail,
      refreshClientQueue,
      refreshAdminQueue: async () => {
        void repairAdminQueueRemote().catch(() => undefined);
        const remoteAdmins = (await Promise.race([
          fetchAdmins(),
          new Promise<AdminUser[] | null>((resolve) =>
            window.setTimeout(() => resolve(null), 10_000),
          ),
        ])) as AdminUser[] | null;
        if (!remoteAdmins) {
          return { ok: false, error: 'Could not load mentor queue from cloud' };
        }
        let nextAdmins: AdminUser[] = [];
        setAuth((prev) => {
          const nextAuth = applyRemoteAdmins(prev, remoteAdmins);
          nextAdmins = nextAuth.admins;
          saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
          saveCachedAdminRoster(nextAdmins);
          return nextAuth;
        });
        const counts = countAdminQueue(nextAdmins);
        approvalLog('mentor', 'queue_refreshed', counts);
        return { ok: true, ...counts };
      },
      // Strict per-mentor isolation: even if data ever gets cross-merged,
      // an EA stamped with another mentor's id never renders in this portal
      eas: workspace.eas.filter(
        (ea) => !ea.ownerAdminId || ea.ownerAdminId === adminId,
      ),
      licenses: portalLicenses,
      mt5: workspace.mt5,
      profile: workspace.profile,
      orders: workspace.orders,
      createEA: (ea) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => {
          const created: ManagedEA = {
            ...ea,
            id: `ea-${Date.now()}`,
            imageUrl: ea.imageUrl || '',
            ownerAdminId: adminId,
          };
          return { ...ws, eas: [created, ...ws.eas] };
        });
      },
      updateEA: (id, patch) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          eas: ws.eas.map((ea) => (ea.id === id ? { ...ea, ...patch } : ea)),
        }));
        void (async () => {
          const ws = normalizeWorkspace(
            loadJSON<StoreState>(STORE_KEY, { workspaces: {} }).workspaces[adminId],
            auth.admin ?? { id: adminId },
          );
          const licenses = await syncPortalBrandingToClients(adminId, ws);
          if (!licenses) return;
          patchWorkspace(adminId, (cur) => ({ ...cur, licenses }));
        })();
      },
      deleteEA: (id) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          eas: ws.eas.filter((e) => e.id !== id),
          // Tombstone stops any other device from merging this EA back
          deletedEaIds: [...new Set([...(ws.deletedEaIds || []), id])],
        }));
      },
      generateLicense: async (input) => {
        if (!adminId) {
          return { ok: false, error: 'Sign in to generate a license.' };
        }
        const ws = normalizeWorkspace(
          store.workspaces[adminId],
          auth.admin ?? { id: adminId },
        );
        const ea = ws.eas.find((e) => e.id === input.eaId);
        if (!ea || !input.clientName.trim() || !input.clientEmail.trim()) {
          return { ok: false, error: 'Select EA and fill client name + email.' };
        }
        const clientEmail = input.clientEmail.trim().toLowerCase();
        const clientName = input.clientName.trim();

        const existing = findLiveLicenseForOwner(
          clientEmail,
          adminId,
          ws,
          mergedVaultForMentor(adminId),
        );
        if (existing) {
          return {
            ok: false,
            error:
              `This email already has a license key (${normalizeLicenseKey(
                existing.key,
              )}).\n\n` +
              'Delete it first, then generate another one. The client will pay the subscription again and log in with the new license key.',
          };
        }

        licenseLog('generate', 'creating license', { email: clientEmail, eaId: input.eaId });

        const profileImage = ws.profile.eaImage || '';
        const realProfile =
          profileImage &&
          !isPlaceholderMentorImage(profileImage) &&
          !profileImage.startsWith('blob:')
            ? profileImage.startsWith('data:')
              ? `img:profile-${adminId}`
              : profileImage
            : '';
        const realEa =
          ea.imageUrl &&
          !isPlaceholderMentorImage(ea.imageUrl) &&
          !ea.imageUrl.startsWith('blob:')
            ? ea.imageUrl.startsWith('data:')
              ? `img:profile-${adminId}`
              : ea.imageUrl
            : '';
        const eaImage = realEa || realProfile || '';
        const displayBytes =
          displayableImage(eaImage, adminId) ||
          displayableImage(profileImage, adminId) ||
          getEaImage(`profile-${adminId}`);
        const customMedia = normalizeCustomMedia(ws.profile.customMedia);
        const id = `lic-${Date.now()}`;
        const key = uniqueKey(allLicenses);
        const mainText = ws.profile.mainText || '';
        const eaName = ea.name || ws.profile.eaDisplayName || 'Lumo Edge';
        const record: LicenseRecord = {
          id,
          key,
          eaId: ea.id,
          eaName,
          eaImage,
          mainText,
          symbols: ea.symbols,
          customMedia,
          ownerAdminId: adminId,
          clientName,
          clientEmail,
          duration: input.duration,
          status: 'active',
        };
        if (displayBytes) {
          saveEaImage(id, displayBytes);
          saveEaImage(`key-${normalizeLicenseKey(key)}`, displayBytes);
          saveEaImage(`profile-${adminId}`, displayBytes);
          saveEaImage(`img:profile-${adminId}`, displayBytes);
        }
        const current = normalizeWorkspace(
          store.workspaces[adminId],
          auth.admin ?? { id: adminId },
        );
        const nextWs = {
          ...current,
          licenses: [record, ...current.licenses.filter((l) => l.id !== id)],
        };
        // Save locally first so the admin sees the key immediately
        setStore((prev) => {
          const next = {
            ...prev,
            workspaces: {
              ...prev.workspaces,
              [adminId]: nextWs,
            },
          };
          saveJSON(STORE_KEY, next);
          return next;
        });
        upsertVault(licenseToVaultEntry(record));
        licenseLog('generate', 'saved locally', { key, clientEmail });

        // Local key immediately — cloud publish in background so UI never freezes
        unrevokeLicenseKeys([key]);
        void pushLicensesToRemote(adminId, nextWs).catch((err) => {
          licenseError('generate', 'cloud push failed (background)', {
            error: err instanceof Error ? err.message : String(err),
            key,
            clientEmail,
          });
        });

        licenseLog('generate', 'success', { key, clientEmail });
        return { ok: true, license: { ...record, eaImage: displayBytes || eaImage } };
      },
      deleteLicense: async (id) => {
        if (!adminId) return;
        const ws = normalizeWorkspace(store.workspaces[adminId], auth.admin ?? undefined);
        const hit = ws.licenses.find((l) => l.id === id);
        if (!hit) return;
        const fp = keyFingerprint(hit.key);
        const norm = normalizeLicenseKey(hit.key);
        revokeLicenseKey(hit.key);
        const current = normalizeWorkspace(
          store.workspaces[adminId],
          auth.admin ?? { id: adminId },
        );
        const nextWs = {
          ...current,
          licenses: filterOwnLicenses(
            current.licenses.filter((l) => l.id !== id),
            adminId,
            [...(current.revokedKeys || []), norm],
          ),
          revokedKeys: [
            norm,
            ...(current.revokedKeys || []).filter((k) => !keysMatch(k, norm)),
          ],
        };
        setStore((prev) => {
          const next = {
            ...prev,
            workspaces: { ...prev.workspaces, [adminId]: nextWs },
          };
          saveJSON(STORE_KEY, next);
          return next;
        });
        try {
          await publishLicensesRemote({
            adminId,
            vaultEntries: nextWs.licenses.map(licenseToVaultEntry),
            workspace: nextWs,
            revokedKeys: loadRevokedKeys(),
          });
        } catch {
          await pushDb({
            store: { workspaces: { [adminId]: nextWs } },
            vault: loadVault().filter((v) => !keysMatch(v.key, hit.key)),
            revokedKeys: loadRevokedKeys(),
          }).catch(() => undefined);
        }
        void fetchDb().then((db) => {
          if (!db?.sessions) return;
          const sessions: Record<string, Record<string, unknown>> = {
            ...(db.sessions as Record<string, Record<string, unknown>>),
          };
          let changed = false;
          for (const [email, session] of Object.entries(sessions)) {
            const bot = (session?.bot || {}) as { licenseKey?: string };
            if (bot.licenseKey && keyFingerprint(bot.licenseKey) === fp) {
              // Key deleted → client must pay subscription again, then activate the new key
              sessions[email] = {
                ...session,
                accessStatus: 'approved',
                bot: {
                  ...bot,
                  licenseKey: '',
                  status: 'paused',
                  imageUrl: '',
                },
              };
              changed = true;
            }
          }
          if (changed) void pushDb({ sessions });
        });
      },
      claimLicense: async (key, email) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedKey = normalizeLicenseKey(key);

        const formatErr = isClaimableKey(key);
        if (formatErr) return { ok: false, error: INVALID_KEY_MESSAGE };

        licenseLog('claim', 'start', { email: normalizedEmail, key: normalizedKey });

        const attemptClaim = (
          workspaces: StoreState['workspaces'],
          remoteImages: Record<string, string> = {},
        ):
          | { ok: true; license: LicenseRecord; ownerId: string | null; isNew: boolean }
          | { ok: false; error: string }
          | null => {
          const hit = findLicenseByKey(key, workspaces);
          if (!hit) return null;

          let license = hit.license as LicenseRecord;
          if (license.status === 'deleted') {
            revokeLicenseKey(key);
            return {
              ok: false,
              error:
                'This license key was deleted and is no longer valid. Generate a new one.',
            };
          }

          const emailErr = validateLicenseEmailAccess(
            license,
            normalizedEmail,
            workspaces,
          );
          if (emailErr) return { ok: false, error: emailErr };

          license = resolveLicenseBrandingSync(
            license,
            workspaces,
            remoteImages,
          ) as LicenseRecord;

          const alreadyAssigned =
            license.status === 'assigned' &&
            license.assignedEmail?.toLowerCase() === normalizedEmail;

          const finalLicense = alreadyAssigned
            ? license
            : (prepareAssignedLicense(license, normalizedEmail) as LicenseRecord);

          return {
            ok: true,
            license: finalLicense,
            ownerId: hit.ownerId,
            isNew: !alreadyAssigned,
          };
        };

        const persistAssignment = (license: LicenseRecord, ownerId: string | null) => {
          const img = String(license.eaImage || '').trim();
          if (img && !img.startsWith('blob:')) {
            if (img.startsWith('data:')) {
              saveEaImage(license.id, img);
              saveEaImage(`key-${normalizedKey}`, img);
            }
            if (ownerId) {
              saveEaImage(`profile-${ownerId}`, img);
              saveEaImage(`img:profile-${ownerId}`, img);
            }
          }
          if (isAdminPortalSession() && ownerId) {
            upsertVault(stripVaultEntryForLocal(licenseRecordToVault(license, normalizedEmail)) as VaultLicense);
            patchWorkspace(ownerId, (ws) => ({
              ...ws,
              licenses: ws.licenses.some((l) => l.id === license.id)
                ? ws.licenses.map((l) => (l.id === license.id ? license : l))
                : [license, ...ws.licenses],
            }));
          } else {
            upsertClientVault(licenseRecordToVault(license, normalizedEmail), normalizedEmail);
          }
        };

        const loadRemoteImages = () =>
          loadJSON<Record<string, string>>(IMAGE_STORE, {});

        const finishClaim = async (license: LicenseRecord) => {
          const remoteImages = loadRemoteImages();
          const eaImage = await resolveLicenseImageAsync(
            license,
            store.workspaces,
            remoteImages,
          );
          const branded = {
            ...resolveLicenseBrandingSync(license, store.workspaces, remoteImages),
            eaImage,
          } as LicenseRecord;
          try {
            persistAssignment(branded, branded.ownerAdminId || null);
            if (branded.ownerAdminId) {
              void import('../lib/copyTrade').then(({ rememberLicenseOwner }) =>
                rememberLicenseOwner(branded.key, branded.ownerAdminId),
              );
            }
          } catch (err) {
            licenseWarn('claim', 'local cache skipped', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
          licenseLog('claim', 'success', { key: branded.key, email: normalizedEmail });
          return { ok: true as const, license: branded };
        };

        const resolveLocal = () => attemptClaim(store.workspaces, loadRemoteImages());

        let localHit = resolveLocal();
        if (!localHit) {
          const remote = await Promise.race([
            fetchDb(),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
          ]);
          if (remote) {
            const merged = hydrateLicenseRemote(remote);
            if (merged) setStore(merged);
          }
          localHit = resolveLocal();
        }

        if (localHit && !localHit.ok) {
          licenseWarn('claim', 'local rejected', { error: localHit.error });
          // Surface real policy errors (wrong email / already used) — not "Invalid key"
          return { ok: false, error: localHit.error || INVALID_KEY_MESSAGE };
        }

        // Key already in database — activate instantly, sync assignment in background
        if (localHit?.ok) {
          licenseLog('claim', 'instant from database cache', { key: normalizedKey });
          void claimLicenseRemote(normalizedKey, normalizedEmail).catch(() => undefined);
          return finishClaim(localHit.license);
        }

        // First visit: one fast server read + bind
        let server = await claimLicenseRemote(normalizedKey, normalizedEmail);
        if (!server.ok && server.retryable) {
          invalidateFetchDbCache();
          const remote = await fetchDb();
          if (remote) {
            const merged = hydrateLicenseRemote(remote);
            if (merged) setStore(merged);
            localHit = attemptClaim(
              (merged ?? store).workspaces,
              loadRemoteImages(),
            );
            if (localHit?.ok) return finishClaim(localHit.license);
            if (localHit && !localHit.ok) {
              return { ok: false, error: localHit.error || INVALID_KEY_MESSAGE };
            }
          }
          server = await claimLicenseRemote(normalizedKey, normalizedEmail);
        }
        if (server.ok) {
          const lic = {
            ...server.license,
            customMedia: normalizeCustomMedia(
              (server.license.customMedia as LicenseRecord['customMedia']) || [],
            ),
          } as LicenseRecord;
          return finishClaim(lic);
        }

        if (server.status && server.status >= 400 && server.status < 500 && !server.retryable) {
          licenseWarn('claim', 'server rejected', { error: server.error, status: server.status });
          return {
            ok: false,
            error:
              server.error && server.error !== INVALID_KEY_MESSAGE
                ? server.error
                : INVALID_KEY_MESSAGE,
          };
        }

        licenseError('claim', 'failed', { email: normalizedEmail, key: normalizedKey, error: server.error });
        return { ok: false, error: server.error || INVALID_KEY_MESSAGE };
      },
      resyncLicenses,
      warmLicenseCache,
      restoreEAsFromCloud,
      restoreLicensesFromCloud,
      clientsLoading,
      findLicense: (key) => {
        const vault = findInVault(key);
        if (vault) {
          return {
            id: vault.id,
            key: vault.key,
            eaId: vault.eaId,
            eaName: vault.eaName,
            eaImage: vault.eaImage,
            customMedia: normalizeCustomMedia(vault.customMedia),
            mainText: vault.mainText,
            symbols: vault.symbols,
            ownerAdminId: vault.ownerAdminId,
            clientName: vault.clientName,
            clientEmail: vault.email,
            duration: vault.duration,
            status: vault.status,
            assignedEmail: vault.assignedEmail,
            assignedAt: vault.assignedAt,
          };
        }
        return allLicenses.find((l) => keysMatch(l.key, key));
      },
      saveMt5: (mt5) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({ ...ws, mt5 }));
      },
      updateProfile: (patch) => {
        if (!adminId) return Promise.resolve();
        return (async () => {
          let imagePatch = patch.eaImage;
          let displayBytes = '';
          if (imagePatch && imagePatch.startsWith('blob:')) {
            try {
              const { blobUrlToDataUrl } = await import('../lib/storage');
              imagePatch = await withTimeout(
                blobUrlToDataUrl(imagePatch),
                12_000,
                '',
              );
            } catch {
              imagePatch = undefined;
            }
          }
          if (imagePatch && imagePatch.startsWith('data:')) {
            displayBytes = imagePatch;
            saveEaImage(`profile-${adminId}`, imagePatch);
            saveEaImage(`img:profile-${adminId}`, imagePatch);
            await withTimeout(
              firebaseSaveImage(`profile-${adminId}`, imagePatch),
              12_000,
              null,
            );
            const published = await withTimeout(
              publishEaImage(`profile-${adminId}`, imagePatch),
              20_000,
              `img:profile-${adminId}`,
            );
            imagePatch = published?.startsWith('img:')
              ? published
              : published?.startsWith('http') || published?.startsWith('/')
                ? published
                : `img:profile-${adminId}`;
          } else if (imagePatch && imagePatch.startsWith('img:')) {
            displayBytes = getEaImage(imagePatch) || getEaImage(imagePatch.slice(4)) || '';
          } else if (imagePatch && (imagePatch.startsWith('http') || imagePatch.startsWith('/'))) {
            saveEaImage(`profile-${adminId}`, imagePatch);
            displayBytes = imagePatch;
          }

          const resolvedPatch: Partial<AdminProfile> = {
            ...patch,
            eaImage:
              imagePatch !== undefined
                ? imagePatch
                : patch.eaImage !== undefined
                  ? patch.eaImage
                  : undefined,
          };
          if (String(resolvedPatch.eaImage || '').startsWith('blob:')) {
            resolvedPatch.eaImage = '';
          }

          if (resolvedPatch.customMedia) {
            const nextMedia = [];
            for (const item of normalizeCustomMedia(resolvedPatch.customMedia)) {
              if (item.url.startsWith('blob:')) continue;
              if (
                item.url.startsWith('http') ||
                item.url.startsWith('/api/') ||
                item.url.startsWith('img:')
              ) {
                nextMedia.push(item);
                continue;
              }
              if (item.url.startsWith('data:')) {
                const mediaKeyId = `${adminId}-${item.slot}`;
                const published = await withTimeout(
                  publishMentorMediaImage(mediaKeyId, item.url),
                  20_000,
                  `img:${mediaKeyId}`,
                );
                nextMedia.push({
                  ...item,
                  url:
                    published.startsWith('http') || published.startsWith('/')
                      ? published
                      : published.startsWith('img:')
                        ? published
                        : `img:${mediaKeyId}`,
                });
              } else {
                nextMedia.push(item);
              }
            }
            resolvedPatch.customMedia = nextMedia;
          }

          const clearingImage =
            resolvedPatch.eaImage !== undefined &&
            !String(resolvedPatch.eaImage || '').trim();

          const current = normalizeWorkspace(
            store.workspaces[adminId],
            auth.admin ?? { id: adminId },
          );
          const nextProfile: AdminProfile = {
            ...current.profile,
            ...resolvedPatch,
            eaImage: clearingImage
              ? ''
              : resolvedPatch.eaImage !== undefined
                ? String(resolvedPatch.eaImage)
                : current.profile.eaImage,
            customMedia: normalizeCustomMedia(
              resolvedPatch.customMedia !== undefined
                ? resolvedPatch.customMedia
                : current.profile.customMedia,
            ),
          };
          const imageRef = clearingImage
            ? ''
            : nextProfile.eaImage?.startsWith('data:')
              ? `img:profile-${adminId}`
              : nextProfile.eaImage || '';
          const branded: AdminWorkspace = {
            ...current,
            profile: {
              ...nextProfile,
              eaImage: imageRef || nextProfile.eaImage,
            },
            mt5:
              resolvedPatch.eaDisplayName !== undefined
                ? {
                    ...current.mt5,
                    eaName: resolvedPatch.eaDisplayName || current.mt5.eaName,
                  }
                : current.mt5,
          };

          setStore((prev) => {
            const next = {
              ...prev,
              workspaces: { ...prev.workspaces, [adminId]: branded },
            };
            saveJSON(STORE_KEY, next);
            return next;
          });

          // Keep drawer / auth name in sync with Profile Settings (live app memory)
          const fullName = [branded.profile.firstName, branded.profile.lastName]
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .join(' ');
          if (fullName || branded.profile.email) {
            setAuth((prev) => {
              if (!prev.admin || prev.admin.id !== adminId) return prev;
              const nextAuth = {
                ...prev,
                admin: {
                  ...prev.admin,
                  fullName: fullName || prev.admin.fullName,
                  email: branded.profile.email || prev.admin.email,
                  phone: branded.profile.phone || prev.admin.phone,
                  mentorName: branded.profile.mentorName || prev.admin.mentorName,
                  eaName: branded.profile.eaDisplayName || prev.admin.eaName,
                },
              };
              saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
              return nextAuth;
            });
          }

          void (async () => {
            try {
              const licenses = await withTimeout(
                syncPortalBrandingToClients(adminId, branded, {
                  imageRef: clearingImage ? '' : branded.profile.eaImage || '',
                  displayImage: clearingImage
                    ? ''
                    : displayBytes ||
                      displayableImage(branded.profile.eaImage, adminId),
                }),
                25_000,
                branded.licenses,
              );
              setStore((prev) => {
                const cur = normalizeWorkspace(
                  prev.workspaces[adminId],
                  auth.admin ?? { id: adminId },
                );
                const merged: AdminWorkspace = { ...cur, ...branded, licenses };
                const next = {
                  ...prev,
                  workspaces: { ...prev.workspaces, [adminId]: merged },
                };
                saveJSON(STORE_KEY, next);
                const imagePayload: Record<string, string> = {};
                if (displayBytes) {
                  imagePayload[`profile-${adminId}`] = displayBytes;
                }
                for (const item of nextProfile.customMedia) {
                  if (!item.url) continue;
                  const mediaKeyId = `${adminId}-${item.slot}`;
                  const bytes =
                    item.url.startsWith('data:')
                      ? item.url
                      : getEaImage(mediaKeyId) ||
                        getEaImage(imageKeyFromPublicUrl(item.url));
                  if (bytes && bytes.startsWith('data:')) {
                    imagePayload[mediaKeyId] = bytes;
                  } else if (
                    item.url.startsWith('http') ||
                    item.url.startsWith('/api/')
                  ) {
                    imagePayload[mediaKeyId] = item.url;
                  }
                }
                void pushDb({
                  store: { workspaces: { [adminId]: merged } },
                  vault: loadVault(),
                  ...(Object.keys(imagePayload).length ? { images: imagePayload } : {}),
                }).catch(() => undefined);
                return next;
              });
            } catch {
              // local profile already saved — cloud sync can retry on next save
            }
          })();
        })();
      },
      executeOrder: (order) => {
        if (!adminId) {
          return {
            ...order,
            id: `ord-${Date.now()}`,
            copiedTo: 0,
            createdAt: new Date().toISOString(),
          };
        }
        const eaId = String(order.eaId || '').trim();
        const eaRecord = eaId ? workspace.eas.find((ea) => ea.id === eaId) : undefined;
        const eaLabel = eaRecord?.name || order.comment || workspace.profile.eaDisplayName || 'Lumo Edge';
        const licensedClients = workspace.licenses.filter((l) => {
          if (l.status !== 'active' && l.status !== 'assigned') return false;
          if (!eaId) return true;
          return String(l.eaId || '') === eaId;
        }).length;
        const created: CopyOrder = {
          ...order,
          comment: order.comment?.includes('~LumoEdge')
            ? order.comment
            : `${eaLabel} ~LumoEdge`.slice(0, 31),
          eaId: eaId || undefined,
          id: `ord-${Date.now()}`,
          copiedTo: licensedClients,
          createdAt: new Date().toISOString(),
        };
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          orders: [created, ...ws.orders],
        }));
        return created;
      },
      stats: {
        activeLicenses,
        deletedLicenses,
        // Mentors only count their own licensed clients; Super sees platform queue too
        totalClients: isSuper
          ? clients.length
          : ownClientEmails.size,
        pendingClients: isSuper
          ? countClientQueue(clients).pending
          : workspace.licenses.filter((l) => l.status === 'assigned').length,
        approvedClients: isSuper ? countClientQueue(clients).approved : 0,
      },
    };
  }, [auth, store, clients, saveAuth, saveStore, patchWorkspace, allLicenses, approveMentorByIds, resyncLicenses, warmLicenseCache, restoreEAsFromCloud, restoreLicensesFromCloud, logout, getClientByEmail, refreshClientQueue]);

  return (
    <AdminSessionContext.Provider value={sessionValue}>
      <AdminContext.Provider value={value}>
        {children}
        {booting ? <WelcomeSplash /> : null}
      </AdminContext.Provider>
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession missing provider');
  return ctx;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin missing provider');
  return ctx;
}

