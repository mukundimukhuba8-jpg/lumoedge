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
import {
  claimLicenseRemote,
  deleteClientRemote,
  fetchAdmins,
  fetchClients,
  fetchDb,
  patchClient,
  postClient,
  postMentorRegistration,
  publishLicensesRemote,
  patchAdminRole,
  pushDb,
  pushSession,
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
  isRevokedKey,
  keyFingerprint,
  keysMatch,
  loadJSON,
  loadRevokedKeys,
  loadVault,
  makeLicenseKey,
  normalizeLicenseKey,
  publishEaImage,
  pruneClientDeviceStorage,
  revokeLicenseKey,
  saveEaImage,
  saveJSON,
  saveRevokedKeysLocal,
  saveVaultLocal,
  stripVaultEntryForLocal,
  upsertClientVault,
  upsertVault,
  isAdminPortalSession,
  type VaultLicense,
} from '../lib/storage';
import {
  firebaseSaveImage,
  firebaseUploadDataUrl,
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
  validateLicenseEmailAccess,
} from '../lib/licenseClaim';
import { approvalError, approvalLog, approvalWarn } from '../lib/approvalLog';
import { countClientQueue, pickClientStatus } from '../lib/clientQueue';
import { licenseError, licenseLog, licenseWarn } from '../lib/licenseLog';

/** Blocks destructive vault sync while a publish is in flight. */
let licensePublishInFlight = 0;
function hydrateLicenseRemote(remote: RemoteDb | null) {
  if (!remote) return;
  const adminSession = isAdminPortalSession();
  if (Array.isArray(remote.revokedKeys)) {
    saveRevokedKeysLocal([
      ...loadRevokedKeys(),
      ...remote.revokedKeys.map((k) => normalizeLicenseKey(k)),
    ]);
  }
  if (adminSession && remote.vault) {
    const revoked = loadRevokedKeys();
    saveVaultLocal(
      dbList<VaultLicense>(remote.vault).filter(
        (v) =>
          v.status !== 'deleted' &&
          !revoked.some((k) => keysMatch(k, v.key)),
      ),
    );
  }
  if (adminSession && remote.images && typeof remote.images === 'object') {
    saveJSON(IMAGE_STORE, {
      ...loadJSON<Record<string, string>>(IMAGE_STORE, {}),
      ...remote.images,
    });
  }
  if (adminSession && remote.store?.workspaces) {
    const workspaces = { ...(remote.store.workspaces as StoreState['workspaces']) };
    for (const [id, ws] of Object.entries(workspaces)) {
      workspaces[id] = {
        ...ws,
        licenses: (ws.licenses || []).filter((l) => l.status !== 'deleted'),
      };
    }
    saveJSON(STORE_KEY, { workspaces });
  }
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
    return {
      ...lic,
      eaImage: imageRef || '',
      mainText: ws.profile.mainText || lic.mainText,
      eaName: ea?.name || ws.profile.eaDisplayName || lic.eaName,
      symbols,
      customMedia: normalizeCustomMedia(ws.profile.customMedia),
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
        const clientImage =
          displayImage && displayImage.startsWith('http')
            ? displayImage
            : `/api/images/profile-${encodeURIComponent(adminId)}`;
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
    const payload: Parameters<typeof pushDb>[0] = {
      store: { workspaces: { [adminId]: { ...ws, licenses: nextLicenses } } },
      vault: loadVault(),
    };
    if (displayImage) {
      payload.images = { [`profile-${adminId}`]: displayImage };
    }
    if (changed) payload.sessions = sessions;
    await pushDb(payload);
  } catch {
    await pushDb({
      store: { workspaces: { [adminId]: { ...ws, licenses: nextLicenses } } },
      vault: loadVault(),
      ...(displayImage ? { images: { [`profile-${adminId}`]: displayImage } } : {}),
    });
  }

  return nextLicenses;
}

const AUTH_KEY = 'ub-web/admin-auth-v3';
const STORE_KEY = 'ub-web/admin-store-v3';

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
  },
): AdminWorkspace {
  const base = createEmptyWorkspace(seed);
  if (!ws) return base;
  const tombstones = new Set(ws.deletedEaIds ?? []);
  return {
    ...base,
    ...ws,
    deletedEaIds: [...tombstones],
    eas: (ws.eas ?? []).filter((e) => !tombstones.has(e.id)),
    licenses: (ws.licenses ?? [])
      .filter((l) => l.status !== 'deleted')
      .filter((l) => !isLicenseRevoked(l.key, ws.revokedKeys ?? []))
      .map((l) => ({
        ...l,
        ownerAdminId: l.ownerAdminId || seed?.id || '',
        customMedia: normalizeCustomMedia(l.customMedia),
      })),
    clientRequests: ws.clientRequests ?? [],
    orders: ws.orders ?? [],
    revokedKeys: ws.revokedKeys ?? [],
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

/** Merge two workspaces — keep every EA and license from either side. */
function mergeWorkspaceKeepAll(a: AdminWorkspace, b: AdminWorkspace): AdminWorkspace {
  const deletedEaIds = new Set([
    ...(a.deletedEaIds || []),
    ...(b.deletedEaIds || []),
  ]);
  const easById = new Map<string, ManagedEA>();
  for (const ea of [...(a.eas || []), ...(b.eas || [])]) {
    if (!ea?.id || deletedEaIds.has(ea.id)) continue;
    const prev = easById.get(ea.id);
    easById.set(ea.id, prev ? { ...prev, ...ea, imageUrl: ea.imageUrl || prev.imageUrl || '' } : ea);
  }
  const licByKey = new Map<string, LicenseRecord>();
  const wsRevoked = [...new Set([...(a.revokedKeys || []), ...(b.revokedKeys || [])])];
  for (const lic of [...(a.licenses || []), ...(b.licenses || [])]) {
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
  return normalizeWorkspace({
    ...a,
    ...b,
    deletedEaIds: [...deletedEaIds],
    eas: Array.from(easById.values()),
    licenses: Array.from(licByKey.values()).filter((l) => l.status !== 'deleted'),
    profile: {
      ...a.profile,
      ...b.profile,
      eaImage:
        (a.profile?.eaImage && String(a.profile.eaImage).trim()) ||
        (b.profile?.eaImage && String(b.profile.eaImage).trim()) ||
        '',
      customMedia: normalizeCustomMedia(
        b.profile?.customMedia?.length
          ? b.profile.customMedia
          : a.profile?.customMedia,
      ),
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
): LicenseRecord[] {
  if (!ownerAdminId) return [];
  return licenses
    .filter((l) => l.status !== 'deleted')
    .filter((l) => !isLicenseRevoked(l.key, wsRevoked))
    .filter((l) => (l.ownerAdminId || ownerAdminId) === ownerAdminId)
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
  adminId: string,
  remoteVault: VaultLicense[],
  extraLocal: VaultLicense[] = [],
) {
  const revoked = loadRevokedKeys();
  const merged = mergeVaultKeepAll(loadVault(), [...extraLocal, ...remoteVault]);
  saveVaultLocal(
    merged.filter(
      (v) =>
        v.status !== 'deleted' &&
        !revoked.some((k) => keysMatch(k, v.key)) &&
        (!v.ownerAdminId || v.ownerAdminId === adminId || extraLocal.some((e) => keysMatch(e.key, v.key))),
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
    const active = filterOwnLicenses(ws.licenses, adminId, ws.revokedKeys);
    if (!active.length) {
      await publishLicensesRemote({
        adminId,
        vaultEntries: [],
        workspace: { ...ws, licenses: [] },
        revokedKeys: loadRevokedKeys(),
      }).catch(() => undefined);
      return;
    }
    const entries = active.map(licenseToVaultEntry);
    licenseLog('publish', 'saving to cloud', {
      adminId,
      count: entries.length,
      keys: entries.map((e) => normalizeLicenseKey(e.key)),
    });

    const published = await publishLicensesRemote({
      adminId,
      vaultEntries: entries,
      workspace: { ...ws, licenses: active },
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
      store: { workspaces: { [adminId]: { ...ws, licenses: active } } },
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

function migrateAuth(): AuthState {
  const v3 = loadJSON<AuthState | null>(AUTH_KEY, null as unknown as AuthState);
  if (v3 && Array.isArray(v3.admins)) {
    return { ...v3, portalOpen: false };
  }
  const v1 = loadJSON<{
    portalOpen?: boolean;
    admin?: AdminUser | null;
    pendingAdmins?: AdminUser[];
  }>('ub-web/admin-auth-v1', {});
  return {
    portalOpen: false,
    admin: null,
    admins: v1.pendingAdmins ?? [],
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
  approveAdmin: (id: string) => void;
  approveAdmins: (ids: string[]) => void;
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
  saveMt5: (mt5: Mt5Connection) => void;
  updateProfile: (patch: Partial<AdminProfile>) => Promise<void>;
  executeOrder: (order: Omit<CopyOrder, 'id' | 'copiedTo'>) => CopyOrder;
  stats: {
    activeLicenses: number;
    deletedLicenses: number;
    totalClients: number;
    pendingClients: number;
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
    paymentClaimed: Boolean(prev.paymentClaimed || incoming.paymentClaimed),
    paymentClaimedAt: prev.paymentClaimedAt || incoming.paymentClaimedAt,
  };
}

function adminsMatch(a: AdminUser[], b: AdminUser[]) {
  if (a.length !== b.length) return false;
  const byEmail = new Map(b.map((x) => [x.email.toLowerCase(), x]));
  return a.every((x) => {
    const y = byEmail.get(x.email.toLowerCase());
    return (
      y &&
      y.role === x.role &&
      y.fullName === x.fullName
    );
  });
}

function applyRemoteAdmins(
  prev: AuthState,
  remoteAdmins: AdminUser[],
): AuthState {
  const admins = mergeAdmins(prev.admins, remoteAdmins) as AdminUser[];
  const healed = admins.some((a) => {
    const remote = remoteAdmins.find(
      (r) => r.email.toLowerCase() === a.email.toLowerCase(),
    );
    return remote && a.role === 'admin' && remote.role === 'pending';
  });
  if (healed) {
    void pushDb({ auth: { admins, admin: null } }).catch(() => undefined);
  }
  let admin = prev.admin;
  if (admin && admin.role !== 'super') {
    const remote = admins.find(
      (a) => a.email.toLowerCase() === admin!.email.toLowerCase(),
    );
    if (!remote || remote.role !== 'admin') admin = null;
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

function mergeSubscriberQueue(
  prev: ClientRequest[],
  remoteList: ClientRequest[] | null | undefined,
  remoteDeleted?: Iterable<string>,
): ClientRequest[] {
  return withoutDeleted(
    mergeClientLists(prepaidAsClientRequests(), prev, remoteList || []),
    remoteDeleted,
  );
}

const AdminContext = createContext<Ctx | null>(null);
const IMAGE_STORE = 'ub-web/ea-images-v1';
/** Splash stays visible briefly, but never blocks the app on slow networks */
const SPLASH_MIN_MS = 600;
const SPLASH_MAX_MS = 1800;

export function AdminProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => migrateAuth());
  const [store, setStore] = useState<StoreState>(() => migrateStore(migrateAuth().admins));
  const [clients, setClients] = useState<ClientRequest[]>(() => prepaidAsClientRequests());
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    pruneClientDeviceStorage();
  }, []);

  // Hydrate from disk-backed API so data survives new preview links
  useEffect(() => {
    let cancelled = false;
    let dismissed = false;
    const started = Date.now();

    const dismissSplash = () => {
      if (cancelled || dismissed) return;
      dismissed = true;
      setBooting(false);
    };

    const dismissWithMinDelay = () => {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
      window.setTimeout(dismissSplash, wait);
    };

    const hardCap = window.setTimeout(dismissSplash, SPLASH_MAX_MS);

    const applyRemoteDb = (db: RemoteDb | null) => {
      if (cancelled || !db) return;
      if (Array.isArray(db.auth?.admins)) {
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
        const vault = dbList<VaultLicense>(db.vault).filter(
          (v) =>
            v.status !== 'deleted' &&
            !revoked.some((k) => keysMatch(k, v.key)),
        );
        saveVaultLocal(vault);
      }
      if (adminSession && db.store?.workspaces && typeof db.store.workspaces === 'object') {
        const remoteWs: StoreState['workspaces'] = {};
        for (const [id, ws] of Object.entries(
          db.store.workspaces as StoreState['workspaces'],
        )) {
          remoteWs[id] = normalizeWorkspace(ws, { id } as AdminUser);
        }
        // Merge — never let a thinner remote wipe local EAs / license keys
        setStore((local) => {
          const merged = mergeStoresKeepAll(local, { workspaces: remoteWs });
          saveJSON(STORE_KEY, merged);
          return merged;
        });
      }
      if (adminSession && db.images && typeof db.images === 'object') {
        saveJSON(IMAGE_STORE, {
          ...loadJSON<Record<string, string>>(IMAGE_STORE, {}),
          ...db.images,
        });
      }
      if (Array.isArray(db.clients)) {
        setClients((prev) =>
          mergeSubscriberQueue(
            prev,
            db.clients as ClientRequest[],
            (db as { deletedClients?: string[] }).deletedClients,
          ),
        );
      }
    };

    void (async () => {
      try {
        const db = await fetchDb();
        applyRemoteDb(db);
      } catch {
        // Offline or timed out — local cache is enough to enter the app
      } finally {
        dismissWithMinDelay();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(hardCap);
    };
  }, []);

  // Keep subscription list fresh for admin portal
  useEffect(() => {
    if (booting) return;
    const tick = async () => {
      const list = await fetchClients();
      if (list) {
        const remoteDeleted = await fetchRemoteDeletedClients();
        setClients((prev) => {
          const merged = mergeSubscriberQueue(prev, list as ClientRequest[], remoteDeleted);
          return merged;
        });
      }
    };
    void tick();
    const id = window.setInterval(tick, 2500);
    return () => window.clearInterval(id);
  }, [booting]);

  // Keep mentor registration queue fresh for Super Admin approval
  useEffect(() => {
    if (booting) return;
    const syncAdmins = async () => {
      const remoteAdmins = (await fetchAdmins()) as AdminUser[] | null;
      if (!remoteAdmins) return;
      setAuth((prev) => {
        const nextAuth = applyRemoteAdmins(prev, remoteAdmins);
        if (adminsMatch(prev.admins, nextAuth.admins)) return prev;
        const addedPending = nextAuth.admins.filter(
          (a) =>
            a.role === 'pending' &&
            !prev.admins.some((p) => p.id === a.id || p.email.toLowerCase() === a.email.toLowerCase()),
        );
        if (addedPending.length) {
          approvalLog('mentor', 'registration_synced', {
            count: addedPending.length,
            emails: addedPending.map((a) => a.email),
          });
        }
        saveJSON(AUTH_KEY, { ...nextAuth, portalOpen: false });
        return nextAuth;
      });
    };
    void syncAdmins();
    const id = window.setInterval(() => void syncAdmins(), 2500);
    let unwatch: (() => void) | undefined;
    void import('../lib/firebaseDb').then(({ firebaseWatchAdmins }) => {
      unwatch = firebaseWatchAdmins(() => void syncAdmins());
    });
    return () => {
      window.clearInterval(id);
      unwatch?.();
    };
  }, [booting]);

  // Pull licenses from Firebase so every admin device sees the same keys
  useEffect(() => {
    if (booting || !auth.admin?.id) return;
    const mentorId = auth.admin.id;
    const syncWorkspace = async () => {
      const db = await fetchDb();
      if (!db?.store?.workspaces?.[mentorId]) return;
      const remoteWs = normalizeWorkspace(
        db.store.workspaces[mentorId] as AdminWorkspace,
        auth.admin ?? { id: mentorId },
      );
      remoteWs.licenses = filterOwnLicenses(
        remoteWs.licenses,
        mentorId,
        remoteWs.revokedKeys,
      );
      if (db.vault && licensePublishInFlight === 0) {
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
      setStore((prev) => {
        const localWs = prev.workspaces[mentorId];
        if (!localWs) {
          const next = {
            ...prev,
            workspaces: { ...prev.workspaces, [mentorId]: remoteWs },
          };
          saveJSON(STORE_KEY, next);
          return next;
        }
        const merged = mergeWorkspaceKeepAll(localWs, remoteWs);
        merged.licenses = filterOwnLicenses(
          merged.licenses,
          mentorId,
          merged.revokedKeys,
        );
        if (
          JSON.stringify(merged.profile) === JSON.stringify(localWs.profile) &&
          JSON.stringify(merged.licenses) === JSON.stringify(localWs.licenses) &&
          JSON.stringify(merged.eas) === JSON.stringify(localWs.eas)
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
    };
    void syncWorkspace();
    const poll = window.setInterval(() => void syncWorkspace(), 4000);
    let unwatch: (() => void) | undefined;
    void import('../lib/firebaseDb').then(({ firebaseWatchUpdates }) => {
      unwatch = firebaseWatchUpdates(() => void syncWorkspace());
    });
    return () => {
      window.clearInterval(poll);
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

  const saveStore = useCallback((next: StoreState) => {
    setStore(next);
    saveJSON(STORE_KEY, next);
    // Push each workspace path-scoped (merge on server) — avoids full-tree races
    void pushDb({ store: { workspaces: next.workspaces } });
  }, []);

  /** Batch rapid approvals into one state update + one Firebase write. */
  const approveQueueRef = useRef(new Set<string>());
  const approveFlushScheduledRef = useRef(false);

  const flushApproveQueue = useCallback(async () => {
    approveFlushScheduledRef.current = false;
    const ids = [...approveQueueRef.current];
    approveQueueRef.current.clear();
    if (!ids.length) return;
    const idSet = new Set(ids);

    approvalLog('mentor', 'approve_clicked', { ids });

    let remoteAdmins: AdminUser[] = [];
    try {
      remoteAdmins = ((await fetchAdmins()) || []) as AdminUser[];
    } catch (err) {
      approvalWarn('mentor', 'fetch_admins_before_approve_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let mentorsToSeed: AdminUser[] = [];
    let nextAdmins: AdminUser[] = auth.admins;

    setAuth((prev) => {
      const merged = mergeAdmins(prev.admins, remoteAdmins) as AdminUser[];
      mentorsToSeed = [];
      nextAdmins = merged.map((a) => {
        if (idSet.has(a.id) && a.role === 'pending') {
          approvalLog('mentor', 'status_before_update', {
            id: a.id,
            email: a.email,
            before: a.role,
            after: 'admin',
          });
          mentorsToSeed.push(a);
          return { ...a, role: 'admin' as const };
        }
        return a;
      });
      for (const id of ids) {
        if (!nextAdmins.some((a) => a.id === id)) {
          approvalWarn('mentor', 'approve_id_not_found', { id });
        }
      }
      const next = { ...prev, admins: nextAdmins };
      saveJSON(AUTH_KEY, { ...next, portalOpen: false });
      return next;
    });

    void pushDb({ auth: { admins: nextAdmins, admin: null } })
      .then(() => {
        approvalLog('mentor', 'database_update_success', {
          ids,
          approved: mentorsToSeed.map((m) => m.email),
        });
      })
      .catch((err) => {
        approvalError('mentor', 'database_update_failure', {
          ids,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    if (mentorsToSeed.length) {
      setStore((storePrev) => {
        const workspaces = { ...storePrev.workspaces };
        const patch: Record<string, AdminWorkspace> = {};
        let changed = false;
        for (const m of mentorsToSeed) {
          if (!workspaces[m.id]) {
            workspaces[m.id] = createEmptyWorkspace(m);
            patch[m.id] = workspaces[m.id];
            changed = true;
          }
        }
        if (!changed) return storePrev;
        const nextStore = { ...storePrev, workspaces };
        saveJSON(STORE_KEY, nextStore);
        void pushDb({ store: { workspaces: patch } }).catch(() => undefined);
        return nextStore;
      });
    }

    void Promise.all(
      ids.map((id) =>
        patchAdminRole(id, 'admin').catch((err) => {
          approvalError('mentor', 'cloud_role_sync_failed', {
            id,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }, []);

  const queueApproveAdmins = useCallback(
    (ids: string[]) => {
      for (const id of ids) approveQueueRef.current.add(id);
      if (approveFlushScheduledRef.current) return;
      approveFlushScheduledRef.current = true;
      queueMicrotask(() => flushApproveQueue());
    },
    [flushApproveQueue],
  );

  const warmLicenseCache = useCallback(() => {
    pruneClientDeviceStorage();
    if (isAdminPortalSession()) {
      void fetchDb().then((remote) => hydrateLicenseRemote(remote));
    }
  }, []);

  const resyncLicenses = useCallback(() => {
    const mentorId = auth.admin?.id ?? '';
    if (!mentorId || licensePublishInFlight > 0) return;
    void fetchDb().then((db) => {
      if (!db?.store?.workspaces?.[mentorId]) return;
      const remoteWs = normalizeWorkspace(
        db.store.workspaces[mentorId] as AdminWorkspace,
        auth.admin ?? { id: mentorId },
      );
      remoteWs.licenses = filterOwnLicenses(
        remoteWs.licenses,
        mentorId,
        remoteWs.revokedKeys,
      );
      if (db.vault && licensePublishInFlight === 0) {
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
      setStore((prev) => {
        const localWs = prev.workspaces[mentorId];
        const mergedWs = localWs
          ? mergeWorkspaceKeepAll(localWs, remoteWs)
          : remoteWs;
        mergedWs.licenses = filterOwnLicenses(
          mergedWs.licenses,
          mentorId,
          mergedWs.revokedKeys,
        );
        const next = {
          ...prev,
          workspaces: { ...prev.workspaces, [mentorId]: mergedWs },
        };
        saveJSON(STORE_KEY, next);
        return next;
      });
    });
  }, [auth.admin]);

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

  const value = useMemo<Ctx>(() => {
    const adminId = auth.admin?.id ?? '';
    const workspace = normalizeWorkspace(
      adminId ? store.workspaces[adminId] : undefined,
      auth.admin ?? undefined,
    );

    const isSuper = auth.admin?.role === 'super';
    const activeLicenses = workspace.licenses.filter(
      (l) => l.status === 'active' || l.status === 'assigned',
    ).length;
    const deletedLicenses = (workspace.revokedKeys || []).length;
    const ownClientEmails = new Set(
      workspace.licenses
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
        const normalized = email.trim().toLowerCase();
        if (
          normalized === SUPER_ADMIN.email.toLowerCase() &&
          (await sha256Hex(password)) === SUPER_ADMIN.passwordSha256
        ) {
          const id = SUPER_ADMIN.user.id;
          if (!store.workspaces[id]) {
            saveStore({
              ...store,
              workspaces: {
                ...store.workspaces,
                [id]: createEmptyWorkspace({
                  id,
                  email: SUPER_ADMIN.email,
                  fullName: SUPER_ADMIN.user.fullName,
                }),
              },
            });
          }
          saveAuth({ ...auth, admin: SUPER_ADMIN.user, portalOpen: true });
          return null;
        }
        const remoteAdmins = ((await fetchAdmins()) || []) as AdminUser[];
        const admins = mergeAdmins(auth.admins, remoteAdmins) as AdminUser[];
        if (remoteAdmins.length) {
          setAuth((prev) => {
            const nextAdmins = mergeAdmins(prev.admins, remoteAdmins) as AdminUser[];
            const next = { ...prev, admins: nextAdmins };
            saveJSON(AUTH_KEY, { ...next, portalOpen: false });
            return next;
          });
        }
        const found = admins.find(
          (a) => a.email.toLowerCase() === normalized && a.password === password,
        );
        if (found) {
          if (found.role === 'pending') {
            return 'Your admin account is waiting for Super Admin approval.';
          }
          if (!store.workspaces[found.id]) {
            saveStore({
              ...store,
              workspaces: {
                ...store.workspaces,
                [found.id]: createEmptyWorkspace(found),
              },
            });
          }
          const { password: _p, ...user } = found;
          saveAuth({ ...auth, admin: user, portalOpen: true });
          return null;
        }
        const byEmail = admins.find((a) => a.email.toLowerCase() === normalized);
        if (byEmail?.role === 'pending') {
          return 'Your admin account is waiting for Super Admin approval.';
        }
        if (byEmail) {
          return 'Invalid email or password.';
        }
        return 'No admin account found for this email. Tap Register first, then wait for Super Admin approval.';
      },
      registerAdmin: async (form) => {
        const email = form.email.trim().toLowerCase();
        if (!email || !form.password || !form.fullName.trim()) {
          return 'Fill all required fields.';
        }
        if (email === SUPER_ADMIN.email.toLowerCase()) {
          return 'This email is reserved for Super Admin.';
        }
        const remoteAdmins = ((await fetchAdmins()) || []) as AdminUser[];
        const knownEmails = new Set(
          [...auth.admins, ...remoteAdmins].map((a) => a.email.toLowerCase()),
        );
        if (knownEmails.has(email)) {
          return 'An admin with this email already registered.';
        }
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
          return 'Could not save registration. Check your connection and try again.';
        }
        const entry: AdminUser = {
          ...(serverEntry as AdminUser),
          email,
          role: 'pending',
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
        void pushDb({
          auth: { admins: nextAdmins, admin: null },
          store: { workspaces: { [entry.id]: workspace } },
        }).catch(() => undefined);
        approvalLog('mentor', 'registration_created', {
          email,
          id: entry.id,
          status: entry.role,
        });
        return null;
      },
      logout: () => saveAuth({ ...auth, admin: null, portalOpen: false }),
      approveAdmin: (id) => queueApproveAdmins([id]),
      approveAdmins: (ids) => queueApproveAdmins(ids),
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
          })
            .then(async (serverEntry) => {
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
        saveStore({
          ...store,
          workspaces: {
            ...store.workspaces,
            [sid]: {
              ...superWs,
              clientRequests: [entry, ...superWs.clientRequests.filter((c) => c.email !== email)],
            },
          },
        });
        void postClient({
          email,
          firstName: entry.firstName,
          lastName: entry.lastName,
        })
          .then(async (serverEntry) => {
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
          return;
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
        setClients((prev) => {
          const merged = mergeClientLists(prev, [approved]);
          approvalLog('client', 'local_state_updated', {
            email,
            after: 'approved',
            ...countClientQueue(merged),
          });
          void pushDb({ clients: merged })
            .then(() => {
              approvalLog('client', 'database_update_success', { email, after: 'approved' });
            })
            .catch((err) => {
              approvalError('client', 'database_update_failure', {
                email,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          return merged;
        });
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [approved]),
        }));

        void (async () => {
          const persistApproval = async (server: ClientRequest | null) => {
            const merged = server
              ? ({
                  ...(server as ClientRequest),
                  status: 'approved',
                  paymentClaimed: true,
                  paymentClaimedAt: claimedAt,
                } as ClientRequest)
              : approved;
            setClients((prev) => mergeClientLists(prev, [merged]));
            patchWorkspace(sid, (ws) => ({
              ...ws,
              clientRequests: mergeClientLists(ws.clientRequests, [merged]),
            }));
            try {
              await Promise.race([
                pushSession(email, { accessStatus: 'approved' }),
                new Promise((resolve) => window.setTimeout(resolve, 8000)),
              ]);
              approvalLog('client', 'session_sync_success', { email, accessStatus: 'approved' });
            } catch (err) {
              approvalWarn('client', 'session_sync_failure', {
                email,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          };
          try {
            let server = await Promise.race([
              patchClient(hit.id, {
                status: 'approved',
                paymentClaimed: true,
                paymentClaimedAt: claimedAt,
              }),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
            ]);
            if (!server) {
              server = await Promise.race([
                patchClient(email, {
                  status: 'approved',
                  paymentClaimed: true,
                  paymentClaimedAt: claimedAt,
                }),
                new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
              ]);
            }
            if (server) {
              approvalLog('client', 'cloud_patch_success', {
                email,
                after: (server as ClientRequest).status,
              });
            } else {
              approvalWarn('client', 'cloud_patch_timeout', { email });
            }
            await persistApproval(server as ClientRequest | null);
          } catch (err) {
            approvalError('client', 'cloud_patch_failure', {
              email,
              error: err instanceof Error ? err.message : String(err),
            });
            await persistApproval(approved);
          }
        })();
      },
      addApprovedSubscriber: async (input) => {
        const email = input.email.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { ok: false, error: 'Enter a valid email address.' };
        }
        forgetDeletedClient(email);
        const firstName = input.firstName.trim() || email.split('@')[0] || 'Client';
        const lastName = input.lastName.trim();
        const claimedAt = new Date().toISOString();
        const existing =
          clients.find((c) => c.email.toLowerCase() === email) ||
          Object.values(store.workspaces)
            .flatMap((ws) => ws.clientRequests)
            .find((c) => c.email.toLowerCase() === email);

        const approved: ClientRequest = {
          id: existing?.id || `cli-${Date.now()}`,
          email,
          firstName: firstName || existing?.firstName || 'Client',
          lastName: lastName || existing?.lastName || '',
          status: 'approved',
          createdAt: existing?.createdAt || claimedAt,
          notifiedAt: claimedAt,
          paymentClaimed: true,
          paymentClaimedAt: existing?.paymentClaimedAt || claimedAt,
        };

        const sid = SUPER_ADMIN.user.id;
        setClients((prev) => {
          const merged = mergeClientLists(prev, [approved]);
          void pushDb({ clients: merged }).catch(() => undefined);
          return merged;
        });
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: mergeClientLists(ws.clientRequests, [approved]),
        }));

        void (async () => {
          try {
            const posted = await Promise.race([
              postClient({
                email,
                firstName: approved.firstName,
                lastName: approved.lastName,
              }),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
            ]);
            const serverId = (posted as ClientRequest | null)?.id || approved.id;
            let patched = await Promise.race([
              patchClient(serverId, {
                status: 'approved',
                paymentClaimed: true,
                paymentClaimedAt: approved.paymentClaimedAt,
              }),
              new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
            ]);
            if (!patched) {
              patched = await Promise.race([
                patchClient(email, {
                  status: 'approved',
                  paymentClaimed: true,
                  paymentClaimedAt: approved.paymentClaimedAt,
                }),
                new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
              ]);
            }
            const merged: ClientRequest = patched
              ? {
                  ...(patched as ClientRequest),
                  email,
                  firstName: approved.firstName,
                  lastName: approved.lastName,
                  status: 'approved',
                  paymentClaimed: true,
                  paymentClaimedAt: approved.paymentClaimedAt,
                }
              : approved;
            setClients((prev) => mergeClientLists(prev, [merged]));
            patchWorkspace(sid, (ws) => ({
              ...ws,
              clientRequests: mergeClientLists(ws.clientRequests, [merged]),
            }));
            await Promise.race([
              pushSession(email, { accessStatus: 'approved' }),
              new Promise((resolve) => window.setTimeout(resolve, 8000)),
            ]).catch(() => undefined);
          } catch {
            // local record already saved
          }
        })();

        return { ok: true, client: approved };
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
      getClientByEmail: (email) => {
        const normalized = email.trim().toLowerCase();
        const fromClients = clients.find((c) => c.email.toLowerCase() === normalized);
        const fromWorkspace = Object.values(store.workspaces)
          .flatMap((ws) => ws.clientRequests)
          .find((c) => c.email.toLowerCase() === normalized);
        if (!fromClients) return fromWorkspace;
        if (!fromWorkspace) return fromClients;
        return mergeClientLists([fromClients], [fromWorkspace])[0];
      },
      refreshClientQueue: async () => {
        void repairClientQueueRemote().catch(() => undefined);
        const list = await Promise.race([
          fetchClients(),
          new Promise<RemoteDb['clients'] | null>((resolve) =>
            window.setTimeout(() => resolve(null), 10_000),
          ),
        ]);
        const remoteDeleted = await fetchRemoteDeletedClients();
        const merged = mergeSubscriberQueue(
          clients,
          (list as ClientRequest[]) || [],
          remoteDeleted,
        );
        if (list?.length) {
          setClients(merged);
        }
        const counts = countClientQueue(merged);
        approvalLog('client', 'queue_refreshed', counts);
        return { ok: true, ...counts };
      },
      // Strict per-mentor isolation: even if data ever gets cross-merged,
      // an EA stamped with another mentor's id never renders in this portal
      eas: workspace.eas.filter(
        (ea) => !ea.ownerAdminId || ea.ownerAdminId === adminId,
      ),
      licenses: filterOwnLicenses(
        workspace.licenses,
        adminId,
        workspace.revokedKeys,
      ),
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
        void (async () => {
          const current = normalizeWorkspace(
            store.workspaces[adminId],
            auth.admin ?? { id: adminId },
          );
          const branded: AdminWorkspace = {
            ...current,
            eas: current.eas.map((ea) =>
              ea.id === id ? { ...ea, ...patch } : ea,
            ),
          };
          setStore((prev) => {
            const next = {
              ...prev,
              workspaces: { ...prev.workspaces, [adminId]: branded },
            };
            saveJSON(STORE_KEY, next);
            return next;
          });
          const licenses = await syncPortalBrandingToClients(adminId, branded);
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
            return next;
          });
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
          loadVault().filter((v) => v.ownerAdminId === adminId),
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

        try {
          await pushLicensesToRemote(adminId, nextWs);
        } catch (err) {
          licenseError('generate', 'cloud push failed', {
            error: err instanceof Error ? err.message : String(err),
            key,
            clientEmail,
          });
          return {
            ok: false,
            error: 'Could not save to cloud. Check connection and tap Generate again.',
          };
        }

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
          if (img && img.startsWith('data:') && img.length < 8000) {
            saveEaImage(license.id, img);
            saveEaImage(`key-${normalizedKey}`, img);
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

        const finishClaim = (license: LicenseRecord) => {
          const branded = resolveLicenseBrandingSync(
            license,
            store.workspaces,
          ) as LicenseRecord;
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

        const resolveLocal = () => attemptClaim(store.workspaces);

        let localHit = resolveLocal();
        if (!localHit) {
          const remote = await Promise.race([
            fetchDb(),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2500)),
          ]);
          if (remote) hydrateLicenseRemote(remote);
          localHit = resolveLocal();
        }

        if (localHit && !localHit.ok) {
          licenseWarn('claim', 'local rejected', { error: localHit.error });
          return { ok: false, error: INVALID_KEY_MESSAGE };
        }

        // Key already in database — activate instantly, sync assignment in background
        if (localHit?.ok) {
          licenseLog('claim', 'instant from database cache', { key: normalizedKey });
          void claimLicenseRemote(normalizedKey, normalizedEmail).catch(() => undefined);
          return finishClaim(localHit.license);
        }

        // First visit: one fast server read + bind
        const server = await claimLicenseRemote(normalizedKey, normalizedEmail);
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
          return { ok: false, error: INVALID_KEY_MESSAGE };
        }

        licenseError('claim', 'failed', { email: normalizedEmail, key: normalizedKey, error: server.error });
        return { ok: false, error: INVALID_KEY_MESSAGE };
      },
      resyncLicenses,
      warmLicenseCache,
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
                saveEaImage(mediaKeyId, item.url);
                let published = item.url;
                try {
                  const hosted = await withTimeout(
                    firebaseUploadDataUrl(`media/${mediaKeyId}`, item.url),
                    12_000,
                    null,
                  );
                  if (hosted) {
                    saveEaImage(mediaKeyId, hosted);
                    published = hosted;
                  } else {
                    const { imagePublicUrl } = await import('../lib/storage');
                    const apiUrl = imagePublicUrl(mediaKeyId);
                    const res = await withTimeout(
                      fetch(apiUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dataUrl: item.url }),
                      }),
                      12_000,
                      null as Response | null,
                    );
                    published = res?.ok ? apiUrl : apiUrl;
                  }
                } catch {
                  const { imagePublicUrl } = await import('../lib/storage');
                  published = imagePublicUrl(mediaKeyId);
                }
                nextMedia.push({ ...item, url: published });
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
                void pushDb({
                  store: { workspaces: { [adminId]: merged } },
                  vault: loadVault(),
                  ...(displayBytes
                    ? { images: { [`profile-${adminId}`]: displayBytes } }
                    : {}),
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
        const licensedClients = workspace.licenses.filter(
          (l) => l.status === 'active' || l.status === 'assigned',
        ).length;
        const created: CopyOrder = {
          ...order,
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
      },
    };
  }, [auth, store, clients, saveAuth, saveStore, patchWorkspace, allLicenses, queueApproveAdmins, resyncLicenses, warmLicenseCache]);

  if (booting) {
    return <WelcomeSplash />;
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin missing provider');
  return ctx;
}

