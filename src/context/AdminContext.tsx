import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  deleteClientRemote,
  fetchClients,
  fetchDb,
  patchClient,
  postClient,
  pushDb,
} from '../lib/remote';
import {
  findPrepaidClient,
  isPrepaidEmail,
  PREPAID_CLIENTS,
} from '../lib/prepaidClients';
import {
  emptyCustomMedia,
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
  revokeLicenseKey,
  saveEaImage,
  saveJSON,
  saveRevokedKeysLocal,
  saveVaultLocal,
  upsertVault,
  type VaultLicense,
} from '../lib/storage';
import {
  firebaseFetchImage,
  firebaseSaveImage,
  firebaseUploadDataUrl,
  mergeAdmins,
} from '../lib/firebaseDb';
import { WelcomeSplash } from '../components/WelcomeSplash';

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
  if (!v || v.includes('lumo-logo') || v.startsWith('blob:')) return '';
  if (v.startsWith('img:')) {
    const id = v.replace(/^img:/, '');
    return getEaImage(id) || getEaImage(v) || getEaImage(`profile-${adminId || ''}`) || '';
  }
  if (v.startsWith('data:') || v.startsWith('http') || v.startsWith('/')) return v;
  return getEaImage(v) || '';
}

/**
 * Push mentor profile image + EA symbols onto every license, the vault,
 * and live client sessions so portal uploads sync to licensed clients.
 */
async function syncPortalBrandingToClients(
  adminId: string,
  ws: AdminWorkspace,
  options?: { imageRef?: string; displayImage?: string },
) {
  const imageRef =
    options?.imageRef !== undefined
      ? options.imageRef
      : ws.profile.eaImage && !ws.profile.eaImage.includes('lumo-logo')
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

    // Update live client sessions so home refreshes without re-activating the key
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
        // Match by license key when present; otherwise still push branding to assigned email
        if (key && !keysMatch(key, lic.key)) continue;
        sessions[email] = {
          ...prev,
          accessStatus: 'licensed',
          bot: {
            ...bot,
            licenseKey: key || lic.key,
            // Owner's current image is authoritative — empty clears stale
            // pictures so one mentor's photo can never stick to another's clients
            imageUrl: imageRef,
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
    broker: 'Razor Markets',
    server: 'RazorMarkets-Live',
    accountType: 'Standard Live',
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
      .map((l) => ({
        ...l,
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
  const licById = new Map<string, LicenseRecord>();
  for (const lic of [...(a.licenses || []), ...(b.licenses || [])]) {
    if (!lic?.id && !lic?.key) continue;
    const id = lic.id || lic.key;
    const prev = licById.get(id);
    if (!prev) {
      licById.set(id, lic);
      continue;
    }
    // Prefer non-deleted; keep richer fields
    const preferIncoming = lic.status !== 'deleted' && prev.status === 'deleted';
    const base = preferIncoming ? { ...prev, ...lic } : { ...lic, ...prev, ...lic };
    licById.set(id, {
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
    licenses: Array.from(licById.values()).filter((l) => l.status !== 'deleted'),
    profile: {
      ...a.profile,
      ...b.profile,
      eaImage: b.profile?.eaImage || a.profile?.eaImage || '',
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

/** Find any live license already issued to this client email (any mentor). */
function findLiveLicenseForEmail(
  email: string,
  workspaces: Record<string, AdminWorkspace>,
  vault: VaultLicense[],
): LicenseRecord | VaultLicense | undefined {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  const fromVault = vault.find(
    (v) =>
      v.email?.toLowerCase() === normalized &&
      (v.status === 'active' || v.status === 'assigned'),
  );
  if (fromVault) return fromVault;
  for (const ws of Object.values(workspaces)) {
    const hit = (ws.licenses || []).find(
      (l) =>
        l.clientEmail?.toLowerCase() === normalized &&
        (l.status === 'active' || l.status === 'assigned'),
    );
    if (hit) return hit;
  }
  return undefined;
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
  registerAdmin: (data: Omit<AdminUser, 'id' | 'role'> & { password: string }) => string | null;
  logout: () => void;
  approveAdmin: (id: string) => void;
  deleteAdmin: (id: string) => void;
  clientRequests: ClientRequest[];
  submitClientRegistration: (input: {
    email: string;
    firstName: string;
    lastName: string;
  }) => ClientRequest;
  approveClient: (id: string) => void;
  rejectClient: (id: string) => void;
  deleteClient: (id: string) => void;
  claimClientPayment: (email: string) => Promise<ClientRequest | null>;
  getClientByEmail: (email: string) => ClientRequest | undefined;
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
  }) => { ok: true; license: LicenseRecord } | { ok: false; error: string };
  deleteLicense: (id: string) => void;
  claimLicense: (
    key: string,
    email: string,
  ) => Promise<{ ok: true; license: LicenseRecord } | { ok: false; error: string }>;
  findLicense: (key: string) => LicenseRecord | undefined;
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

function mergeClientLists(...lists: ClientRequest[][]): ClientRequest[] {
  const byEmail = new Map<string, ClientRequest>();
  for (const list of lists) {
    for (const c of list) {
      const email = c.email.toLowerCase();
      const prev = byEmail.get(email);
      if (!prev) {
        byEmail.set(email, { ...c, email });
        continue;
      }
      const rank = (x: ClientRequest) =>
        (x.status === 'approved' ? 2 : x.status === 'pending' ? 1 : 0) +
        (x.paymentClaimed ? 1 : 0);
      byEmail.set(email, rank(c) >= rank(prev) ? { ...prev, ...c, email } : prev);
    }
  }
  return [...byEmail.values()].sort((a, b) =>
    (b.paymentClaimedAt || b.createdAt).localeCompare(a.paymentClaimedAt || a.createdAt),
  );
}

const AdminContext = createContext<Ctx | null>(null);
const IMAGE_STORE = 'ub-web/ea-images-v1';

export function AdminProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => migrateAuth());
  const [store, setStore] = useState<StoreState>(() => migrateStore(migrateAuth().admins));
  const [clients, setClients] = useState<ClientRequest[]>(() => prepaidAsClientRequests());
  const [booting, setBooting] = useState(true);

  // Hydrate from disk-backed API so data survives new preview links
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await fetchDb();
      if (cancelled) return;
      if (db) {
        if (Array.isArray(db.auth?.admins)) {
          // Never take remote "admin" (logged-in user) — that is per-device only.
          // Syncing it made Super Admin and mentors overwrite each other.
          setAuth((prev) => {
            const remoteAdmins = db.auth!.admins as AdminUser[];
            // Merge — never let a stale remote "pending" wipe a local approval
            const admins = mergeAdmins(prev.admins, remoteAdmins);
            const healed = admins.some((a) => {
              const remote = remoteAdmins.find((r) => r.id === a.id);
              return remote && a.role === 'admin' && remote.role === 'pending';
            });
            if (healed) {
              void pushDb({ auth: { admins, admin: null } }).catch(() => undefined);
            }
            // If this device's logged-in mentor was un-approved or deleted
            // remotely, kick them out of the portal immediately
            let admin = prev.admin;
            if (admin && admin.role !== 'super') {
              const remote = admins.find((a) => a.id === admin!.id);
              if (!remote || remote.role !== 'admin') admin = null;
            }
            const nextAuth: AuthState = {
              portalOpen: prev.portalOpen,
              admin,
              admins,
            };
            // Keep super in the list conceptually; mentors stay as stored
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
        if (Array.isArray(db.vault)) {
          const revoked = loadRevokedKeys();
          const vault = (db.vault as VaultLicense[]).filter(
            (v) =>
              v.status !== 'deleted' &&
              !revoked.some((k) => keysMatch(k, v.key)),
          );
          // Local only — avoid racing a PUT that wipes freshly generated keys
          saveVaultLocal(vault);
        }
        if (db.store?.workspaces && typeof db.store.workspaces === 'object') {
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
        if (db.images && typeof db.images === 'object') {
          saveJSON(IMAGE_STORE, {
            ...loadJSON<Record<string, string>>(IMAGE_STORE, {}),
            ...db.images,
          });
        }
        if (Array.isArray(db.clients)) {
          const merged = withoutDeleted(
            mergeClientLists(
              prepaidAsClientRequests(),
              db.clients as ClientRequest[],
            ),
            (db as { deletedClients?: string[] }).deletedClients,
          );
          setClients(merged);
          // Only seed Firebase when the remote list is empty — never rewrite
          // clients on every page load (that raced with admin workspace saves).
          if (db.clients.length === 0 && merged.length > 0) {
            void pushDb({ clients: merged }).catch(() => undefined);
          }
        } else {
          const prepaid = prepaidAsClientRequests();
          setClients(prepaid);
          void pushDb({ clients: prepaid }).catch(() => undefined);
        }
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep subscription list fresh for admin portal
  useEffect(() => {
    if (booting) return;
    const tick = async () => {
      const list = await fetchClients();
      if (list) {
        let remoteDeleted: string[] = [];
        try {
          const { firebaseFetchDeletedClients } = await import('../lib/firebaseDb');
          remoteDeleted = await firebaseFetchDeletedClients();
        } catch {
          remoteDeleted = [];
        }
        setClients(
          withoutDeleted(
            mergeClientLists(prepaidAsClientRequests(), list as ClientRequest[]),
            remoteDeleted,
          ),
        );
      }
    };
    void tick();
    const id = window.setInterval(tick, 2500);
    return () => window.clearInterval(id);
  }, [booting]);

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
        const found = auth.admins.find(
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
        return 'Invalid email or password.';
      },
      registerAdmin: (form) => {
        const email = form.email.trim().toLowerCase();
        if (!email || !form.password || !form.fullName.trim()) {
          return 'Fill all required fields.';
        }
        if (email === SUPER_ADMIN.email.toLowerCase()) {
          return 'This email is reserved for Super Admin.';
        }
        if (auth.admins.some((a) => a.email.toLowerCase() === email)) {
          return 'An admin with this email already registered.';
        }
        const entry: AdminUser = {
          ...form,
          email,
          id: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
          role: 'pending',
        };
        // Own empty portal (profile seed only — no shared EAs/licenses)
        saveStore({
          ...store,
          workspaces: {
            ...store.workspaces,
            [entry.id]: createEmptyWorkspace(entry),
          },
        });
        saveAuth({
          ...auth,
          admins: [...auth.admins, entry],
        });
        return null;
      },
      logout: () => saveAuth({ ...auth, admin: null, portalOpen: false }),
      approveAdmin: (id) => {
        let mentor: AdminUser | undefined;
        setAuth((prev) => {
          mentor = prev.admins.find((a) => a.id === id);
          if (!mentor || mentor.role === 'admin') return prev;
          const nextAdmins = prev.admins.map((a) =>
            a.id === id ? { ...a, role: 'admin' as const } : a,
          );
          const next = { ...prev, admins: nextAdmins };
          saveJSON(AUTH_KEY, { ...next, portalOpen: false });
          void pushDb({ auth: { admins: nextAdmins, admin: null } }).catch(
            () => undefined,
          );
          return next;
        });
        if (mentor) {
          setStore((prev) => {
            if (prev.workspaces[id]) return prev;
            const next = {
              ...prev,
              workspaces: {
                ...prev.workspaces,
                [id]: createEmptyWorkspace(mentor!),
              },
            };
            saveJSON(STORE_KEY, next);
            void pushDb({ store: { workspaces: { [id]: next.workspaces[id] } } }).catch(
              () => undefined,
            );
            return next;
          });
        }
      },
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
      approveClient: (id) => {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'approved' } : c)),
        );
        void patchClient(id, { status: 'approved' }).catch(() => undefined);
        const sid = SUPER_ADMIN.user.id;
        patchWorkspace(sid, (ws) => ({
          ...ws,
          clientRequests: ws.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'approved' } : c,
          ),
        }));
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
          clientRequests: [
            updated,
            ...ws.clientRequests.filter((c) => c.email.toLowerCase() !== normalized),
          ],
        }));
        try {
          const server = await patchClient(current.id, {
            status: autoApprove ? 'approved' : undefined,
            paymentClaimed: true,
            paymentClaimedAt: claimedAt,
          });
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
        return (
          clients.find((c) => c.email.toLowerCase() === normalized) ||
          Object.values(store.workspaces)
            .flatMap((ws) => ws.clientRequests)
            .find((c) => c.email.toLowerCase() === normalized)
        );
      },
      // Strict per-mentor isolation: even if data ever gets cross-merged,
      // an EA stamped with another mentor's id never renders in this portal
      eas: workspace.eas.filter(
        (ea) => !ea.ownerAdminId || ea.ownerAdminId === adminId,
      ),
      licenses: workspace.licenses.filter(
        (l) => !l.ownerAdminId || l.ownerAdminId === adminId,
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
      generateLicense: (input) => {
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

        const existing = findLiveLicenseForEmail(
          clientEmail,
          store.workspaces,
          loadVault(),
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

        const profileImage = ws.profile.eaImage || '';
        const realProfile =
          profileImage &&
          !profileImage.includes('lumo-logo') &&
          !profileImage.startsWith('blob:')
            ? profileImage.startsWith('data:')
              ? `img:profile-${adminId}`
              : profileImage
            : '';
        const realEa =
          ea.imageUrl &&
          !ea.imageUrl.includes('lumo-logo') &&
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
        upsertVault({
          id,
          key,
          email: clientEmail,
          clientName,
          eaName,
          mainText,
          symbols: ea.symbols,
          eaImage,
          customMedia,
          duration: input.duration,
          ownerAdminId: adminId,
          eaId: ea.id,
          status: 'active',
        });
        setStore((prev) => {
          const current = normalizeWorkspace(
            prev.workspaces[adminId],
            auth.admin ?? { id: adminId },
          );
          const nextWs = {
            ...current,
            licenses: [record, ...current.licenses.filter((l) => l.id !== id)],
          };
          const next = {
            ...prev,
            workspaces: {
              ...prev.workspaces,
              [adminId]: nextWs,
            },
          };
          saveJSON(STORE_KEY, next);
          void syncPortalBrandingToClients(adminId, nextWs, {
            imageRef: eaImage,
            displayImage: displayBytes,
          });
          return next;
        });
        return { ok: true, license: { ...record, eaImage: displayBytes || eaImage } };
      },
      deleteLicense: (id) => {
        if (!adminId) return;
        const ws = normalizeWorkspace(store.workspaces[adminId], auth.admin ?? undefined);
        const hit = ws.licenses.find((l) => l.id === id);
        if (!hit) return;
        const fp = keyFingerprint(hit.key);
        const norm = normalizeLicenseKey(hit.key);
        // Global ban so the key can never activate again
        revokeLicenseKey(hit.key);
        setStore((prev) => {
          const current = normalizeWorkspace(
            prev.workspaces[adminId],
            auth.admin ?? { id: adminId },
          );
          const next = {
            ...prev,
            workspaces: {
              ...prev.workspaces,
              [adminId]: {
                ...current,
                licenses: current.licenses.filter((l) => l.id !== id),
                revokedKeys: [
                  norm,
                  ...(current.revokedKeys || []).filter((k) => !keysMatch(k, norm)),
                ],
              },
            },
          };
          saveJSON(STORE_KEY, next);
          void pushDb({
            store: {
              workspaces: {
                [adminId]: next.workspaces[adminId],
              },
            },
            vault: loadVault(),
            revokedKeys: loadRevokedKeys(),
          });
          return next;
        });
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
        const fp = keyFingerprint(key);

        if (!fp || fp.length < 8) {
          return { ok: false, error: 'Enter a full LUMO-XXXX-XXXX-XXXX key.' };
        }

        // Always refresh vault from server before validating
        let remote = await fetchDb();
        // Fallback: read committed cloud DB directly (works when Vercel memory is empty)
        if (!remote?.vault?.length) {
          try {
            const rawRes = await fetch(
              `https://raw.githubusercontent.com/mukundimukhuba8-jpg/lumoedge/main/cloud-data/db.json?t=${Date.now()}`,
              { cache: 'no-store' },
            );
            if (rawRes.ok) {
              remote = (await rawRes.json()) as Awaited<ReturnType<typeof fetchDb>>;
            }
          } catch {
            // ignore
          }
        }
        if (remote) {
          if (Array.isArray(remote.revokedKeys)) {
            saveRevokedKeysLocal([
              ...loadRevokedKeys(),
              ...remote.revokedKeys.map((k) => normalizeLicenseKey(k)),
            ]);
          }
          if (Array.isArray(remote.vault)) {
            const revoked = loadRevokedKeys();
            saveVaultLocal(
              (remote.vault as VaultLicense[]).filter(
                (v) =>
                  v.status !== 'deleted' &&
                  !revoked.some((k) => keysMatch(k, v.key)),
              ),
            );
          }
          if (remote.images && typeof remote.images === 'object') {
            const localImages = loadJSON<Record<string, string>>(
              'ub-web/ea-images-v1',
              {},
            );
            saveJSON('ub-web/ea-images-v1', {
              ...localImages,
              ...remote.images,
            });
          }
          if (remote.store?.workspaces) {
            const workspaces = {
              ...(remote.store.workspaces as StoreState['workspaces']),
            };
            for (const [id, ws] of Object.entries(workspaces)) {
              workspaces[id] = {
                ...ws,
                licenses: (ws.licenses || []).filter((l) => l.status !== 'deleted'),
              };
            }
            const nextStore = { workspaces };
            setStore(nextStore);
            saveJSON(STORE_KEY, nextStore);
          }
        }

        if (isRevokedKey(key)) {
          return {
            ok: false,
            error: 'This license key was deleted and is no longer valid. Generate a new one.',
          };
        }

        let vault = findInVault(key);
        if (vault?.status === 'deleted') {
          revokeLicenseKey(key);
          return {
            ok: false,
            error: 'This license key was deleted and is no longer valid. Generate a new one.',
          };
        }

        let license: LicenseRecord | undefined;
        let ownerId: string | null = null;
        const workspaces = remote?.store?.workspaces
          ? (remote.store.workspaces as StoreState['workspaces'])
          : store.workspaces;

        if (vault) {
          license = {
            id: vault.id,
            key: vault.key,
            eaId: vault.eaId,
            eaName: vault.eaName,
            eaImage: vault.eaImage,
            mainText: vault.mainText,
            symbols: vault.symbols ?? [],
            customMedia: normalizeCustomMedia(vault.customMedia),
            ownerAdminId: vault.ownerAdminId,
            clientName: vault.clientName,
            clientEmail: vault.email,
            duration: vault.duration,
            status: vault.status,
            assignedEmail: vault.assignedEmail,
            assignedAt: vault.assignedAt,
          };
          ownerId = vault.ownerAdminId;
        }

        if (!license) {
          for (const [wid, ws] of Object.entries(workspaces)) {
            const found = (ws.licenses || []).find(
              (l) => keysMatch(l.key, key) && l.status !== 'deleted',
            );
            if (found) {
              ownerId = wid;
              license = found;
              break;
            }
          }
        }

        if (!license) {
          return {
            ok: false,
            error:
              'Invalid license key. Copy the new key from Admin → Generate License (deleted keys never work).',
          };
        }

        // Always re-resolve EA branding from admin profile / image store / custom media
        const ownerWs = ownerId ? workspaces[ownerId] : undefined;
        const ownerEa = ownerWs?.eas.find((e) => e.id === license!.eaId);
        const profileAdminId = ownerId || license.ownerAdminId || '';
        const remoteImages =
          remote?.images && typeof remote.images === 'object'
            ? (remote.images as Record<string, string>)
            : {};
        const fromRemoteProfile =
          (profileAdminId && remoteImages[`profile-${profileAdminId}`]) ||
          (license.id && remoteImages[license.id]) ||
          remoteImages[`key-${normalizedKey}`] ||
          '';
        const resolvedMedia = normalizeCustomMedia(
          ownerWs?.profile.customMedia?.length
            ? ownerWs.profile.customMedia
            : license.customMedia,
        );
        const fromProfileSlots = resolvedMedia.find(
          (m) =>
            (m.slot === 'profile-1' || m.slot === 'profile-2') &&
            m.kind === 'image' &&
            m.url &&
            !String(m.url).includes('lumo-logo') &&
            !String(m.url).startsWith('blob:'),
        )?.url;
        const candidateImages = [
          license.eaImage,
          ownerWs?.profile.eaImage,
          fromRemoteProfile,
          getEaImage(license.id),
          getEaImage(`key-${normalizedKey}`),
          ownerEa?.imageUrl,
          getEaImage(`profile-${profileAdminId}`),
          fromProfileSlots,
        ];
        let resolvedImage = '';
        for (const c of candidateImages) {
          const v = String(c || '').trim();
          if (!v || v.includes('lumo-logo') || v.startsWith('blob:')) continue;
          if (v.startsWith('img:')) {
            const id = v.slice(4);
            let embedded = remoteImages[id] || getEaImage(id) || getEaImage(v);
            if (!embedded) {
              embedded = await firebaseFetchImage(id);
              if (embedded) saveEaImage(id, embedded);
            }
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
          if (
            v.startsWith('data:') ||
            v.startsWith('http') ||
            v.startsWith('/')
          ) {
            resolvedImage = v;
            break;
          }
        }
        // Last resort: dedicated Firebase images map for this mentor
        if (!resolvedImage && profileAdminId) {
          resolvedImage =
            remoteImages[`profile-${profileAdminId}`] ||
            (await firebaseFetchImage(`profile-${profileAdminId}`));
          if (resolvedImage) {
            saveEaImage(`profile-${profileAdminId}`, resolvedImage);
          }
        }
        const resolvedName =
          license.eaName || ownerEa?.name || ownerWs?.profile.eaDisplayName || 'Lumo Edge';
        const resolvedMain =
          license.mainText || ownerWs?.profile.mainText || '';
        const resolvedSymbols =
          ownerEa?.symbols?.length
            ? ownerEa.symbols
            : license.symbols?.length
              ? license.symbols
              : ['XAUUSD'];

        license = {
          ...license,
          eaImage: resolvedImage,
          eaName: resolvedName,
          mainText: resolvedMain,
          symbols: resolvedSymbols,
          customMedia: resolvedMedia,
        };

        if (license.status === 'assigned') {
          if (license.assignedEmail === normalizedEmail) {
            return { ok: true, license };
          }
          return { ok: false, error: 'This license key is already used by another account.' };
        }

        if (
          license.clientEmail &&
          license.clientEmail.toLowerCase() !== normalizedEmail
        ) {
          return {
            ok: false,
            error: `This key was issued for ${license.clientEmail}. Log in as that email, or generate a key for ${normalizedEmail}.`,
          };
        }

        const updated: LicenseRecord = {
          ...license,
          status: 'assigned',
          assignedEmail: normalizedEmail,
          assignedAt: new Date().toISOString(),
        };

        if (updated.eaImage) {
          saveEaImage(updated.id, updated.eaImage);
          saveEaImage(`key-${normalizeLicenseKey(updated.key)}`, updated.eaImage);
        }

        upsertVault({
          id: updated.id,
          key: updated.key,
          email: updated.clientEmail,
          clientName: updated.clientName,
          eaName: updated.eaName,
          mainText: updated.mainText,
          symbols: updated.symbols,
          eaImage: updated.eaImage,
          customMedia: updated.customMedia,
          duration: updated.duration,
          ownerAdminId: updated.ownerAdminId,
          eaId: updated.eaId,
          status: 'assigned',
          assignedEmail: normalizedEmail,
          assignedAt: updated.assignedAt,
        });

        if (ownerId) {
          patchWorkspace(ownerId, (ws) => ({
            ...ws,
            licenses: ws.licenses.some((l) => l.id === updated.id)
              ? ws.licenses.map((l) => (l.id === updated.id ? updated : l))
              : [updated, ...ws.licenses],
          }));
        }

        return { ok: true, license: updated };
      },
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
            imagePatch = undefined;
          }
          if (imagePatch && imagePatch.startsWith('data:')) {
            displayBytes = imagePatch;
            saveEaImage(`profile-${adminId}`, imagePatch);
            saveEaImage(`img:profile-${adminId}`, imagePatch);
            await firebaseSaveImage(`profile-${adminId}`, imagePatch);
            const published = await publishEaImage(`profile-${adminId}`, imagePatch);
            imagePatch = published?.startsWith('img:')
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
              if (item.url.startsWith('data:')) {
                const mediaKeyId = `${adminId}-${item.slot}`;
                // Firebase Storage first (same path per slot → replaces old
                // file); store only the download URL. RTDB is the fallback.
                const hosted = await firebaseUploadDataUrl(
                  `media/${mediaKeyId}`,
                  item.url,
                );
                if (hosted) {
                  saveEaImage(mediaKeyId, hosted);
                  nextMedia.push({ ...item, url: hosted });
                } else {
                  await firebaseSaveImage(mediaKeyId, item.url);
                  saveEaImage(mediaKeyId, item.url);
                  nextMedia.push({ ...item, url: item.url });
                }
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

          const licenses = await syncPortalBrandingToClients(adminId, branded, {
            imageRef: clearingImage ? '' : branded.profile.eaImage || '',
            displayImage: clearingImage
              ? ''
              : displayBytes ||
                displayableImage(branded.profile.eaImage, adminId),
          });
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
      executeOrder: (order) => {
        if (!adminId) {
          return {
            ...order,
            id: `ord-${Date.now()}`,
            copiedTo: 0,
          };
        }
        const created: CopyOrder = {
          ...order,
          id: `ord-${Date.now()}`,
          copiedTo: workspace.licenses.filter((l) => l.status === 'assigned').length,
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
          ? clients.filter((c) => c.status === 'pending').length
          : workspace.licenses.filter((l) => l.status === 'assigned').length,
      },
    };
  }, [auth, store, clients, saveAuth, saveStore, patchWorkspace, allLicenses]);

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

