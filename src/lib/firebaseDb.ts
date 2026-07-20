import { get, onValue, ref, set, update } from 'firebase/database';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
  uploadString,
} from 'firebase/storage';
import { getFirebaseDb, getFirebaseStorage, isFirebaseConfigured } from './firebase';

export type RemoteDb = {
  auth: { admins: unknown[]; admin: unknown | null };
  store: { workspaces: Record<string, unknown> };
  vault: unknown[];
  images: Record<string, string>;
  clients: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    notifiedAt?: string;
    paymentClaimed?: boolean;
    paymentClaimedAt?: string;
  }>;
  sessions: Record<string, unknown>;
  revokedKeys?: string[];
  /** Emails deleted from Subscriptions — never re-added by merges/seeds */
  deletedClients?: string[];
  updatedAt?: string;
};

/** Firebase often stores lists as {0:…,1:…} objects — always normalize to arrays. */
export function dbList<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, T>);
  }
  return [];
}

const ROOT = 'lumo';

function emptyDb(): RemoteDb {
  return {
    auth: { admins: [], admin: null },
    store: { workspaces: {} },
    vault: [],
    images: {},
    clients: [],
    sessions: {},
    revokedKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDb(raw: unknown): RemoteDb {
  const base = emptyDb();
  if (!raw || typeof raw !== 'object') return base;
  const db = raw as Partial<RemoteDb>;
  return {
    ...base,
    ...db,
    auth: { ...base.auth, ...(db.auth || {}) },
    store: {
      workspaces:
        db.store?.workspaces && typeof db.store.workspaces === 'object'
          ? db.store.workspaces
          : {},
    },
    vault: dbList<RemoteDb['vault'][number]>(db.vault),
    images: db.images && typeof db.images === 'object' ? db.images : {},
    clients: dbList<RemoteDb['clients'][number]>(db.clients),
    sessions: db.sessions && typeof db.sessions === 'object' ? db.sessions : {},
    revokedKeys: dbList<string>(db.revokedKeys),
    deletedClients: dbList<string>(db.deletedClients),
    updatedAt: db.updatedAt || new Date().toISOString(),
  };
}

type AdminLike = { id?: string; role?: string; [key: string]: unknown };

function adminRoleRank(role: string | undefined): number {
  if (role === 'super') return 3;
  if (role === 'admin') return 2;
  return 1;
}

/** Merge mentor registry — approved role always beats pending (never revert approvals). */
export function mergeAdmins<T extends AdminLike>(
  current: T[],
  incoming: T[],
): T[] {
  const byEmail = new Map<string, T>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email } as T);
      continue;
    }
    const merged = { ...prev, ...item } as T;
    const prevRank = adminRoleRank(String(prev.role));
    const itemRank = adminRoleRank(String(item.role));
    merged.role = (prevRank >= itemRank ? prev.role : item.role) as T['role'];
    for (const [k, v] of Object.entries(prev)) {
      const nextVal = (item as Record<string, unknown>)[k];
      if ((nextVal === '' || nextVal == null) && v !== '' && v != null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
    byEmail.set(email, merged);
  }
  return Array.from(byEmail.values());
}

/** Deep-merge objects; never wipe EAs / licenses / vault entries. */
function mergeById<T extends Record<string, unknown>>(
  current: T[],
  incoming: T[],
  idOf: (item: T) => string,
): T[] {
  const map = new Map<string, T>();
  for (const item of current || []) {
    const id = idOf(item);
    if (id) map.set(id, item);
  }
  for (const item of incoming || []) {
    const id = idOf(item);
    if (!id) continue;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, item);
      continue;
    }
    // Prefer non-empty fields from either side; never blank out existing data
    const merged = { ...prev, ...item } as T;
    for (const [k, v] of Object.entries(prev)) {
      const nextVal = (item as Record<string, unknown>)[k];
      if (
        (nextVal === '' || nextVal === null || nextVal === undefined) &&
        v !== '' &&
        v != null
      ) {
        (merged as Record<string, unknown>)[k] = v;
      }
      if (Array.isArray(v) && Array.isArray(nextVal) && nextVal.length === 0 && v.length > 0) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
    map.set(id, merged);
  }
  return Array.from(map.values());
}

function mergeWorkspace(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const a = current && typeof current === 'object' ? current : {};
  const b = incoming && typeof incoming === 'object' ? incoming : {};
  const deletedEaIds = Array.from(
    new Set([
      ...((Array.isArray(a.deletedEaIds) ? a.deletedEaIds : []) as string[]),
      ...((Array.isArray(b.deletedEaIds) ? b.deletedEaIds : []) as string[]),
    ]),
  );
  const tombstones = new Set(deletedEaIds);
  const eas = mergeById(
    (Array.isArray(a.eas) ? a.eas : []) as Record<string, unknown>[],
    (Array.isArray(b.eas) ? b.eas : []) as Record<string, unknown>[],
    (e) => String(e.id || e.name || ''),
  ).filter((e) => !tombstones.has(String(e.id || '')));
  const licenses = mergeById(
    (Array.isArray(a.licenses) ? a.licenses : []) as Record<string, unknown>[],
    (Array.isArray(b.licenses) ? b.licenses : []) as Record<string, unknown>[],
    (l) => String(l.id || l.key || ''),
  );
  // Never drop a license just because the other side omitted it
  const profileA = (a.profile && typeof a.profile === 'object' ? a.profile : {}) as Record<
    string,
    unknown
  >;
  const profileB = (b.profile && typeof b.profile === 'object' ? b.profile : {}) as Record<
    string,
    unknown
  >;
  const profile: Record<string, unknown> = { ...profileA, ...profileB };
  for (const [k, v] of Object.entries(profileA)) {
    const nextVal = profileB[k];
    if ((nextVal === '' || nextVal == null) && v !== '' && v != null) profile[k] = v;
  }
  return {
    ...a,
    ...b,
    deletedEaIds,
    eas,
    licenses,
    profile,
    clientRequests: mergeById(
      (Array.isArray(a.clientRequests) ? a.clientRequests : []) as Record<string, unknown>[],
      (Array.isArray(b.clientRequests) ? b.clientRequests : []) as Record<string, unknown>[],
      (c) => String(c.id || c.email || ''),
    ),
    revokedKeys: Array.from(
      new Set([
        ...((Array.isArray(a.revokedKeys) ? a.revokedKeys : []) as string[]),
        ...((Array.isArray(b.revokedKeys) ? b.revokedKeys : []) as string[]),
      ]),
    ),
  };
}

export async function firebaseFetchDb(): Promise<RemoteDb | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await get(ref(getFirebaseDb(), ROOT));
    if (!snap.exists()) return emptyDb();
    return normalizeDb(snap.val());
  } catch (err) {
    console.warn('[firebase] fetchDb failed', err);
    return null;
  }
}

/** Serialize writes so Super Admin + mentor tabs don't clobber each other. */
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function getPath<T>(path: string): Promise<T | null> {
  const snap = await get(ref(getFirebaseDb(), path));
  return snap.exists() ? (snap.val() as T) : null;
}

/**
 * Path-scoped push — never rewrite the whole `lumo/` tree.
 * Concurrent Super Admin / mentor / client loads used to overwrite each other
 * because every save did read→merge→set(root).
 */
export async function firebasePushDb(
  partial: Partial<RemoteDb>,
): Promise<RemoteDb | null> {
  if (!isFirebaseConfigured()) return null;
  return enqueueWrite(async () => {
    try {
      const db = getFirebaseDb();
      const rootRef = ref(db, ROOT);
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (partial.auth) {
        const curAuth =
          (await getPath<RemoteDb['auth']>(`${ROOT}/auth`)) || emptyDb().auth;
        const curAdmins = (curAuth.admins || []) as AdminLike[];
        const incoming = Array.isArray(partial.auth.admins)
          ? (partial.auth.admins as AdminLike[])
          : [];
        // Never persist a shared logged-in user — login is per-device only
        patch.auth = {
          admins: mergeAdmins(curAdmins, incoming),
          admin: null,
        };
      }

      if (partial.store?.workspaces && typeof partial.store.workspaces === 'object') {
        const remoteWs =
          (await getPath<Record<string, unknown>>(`${ROOT}/store/workspaces`)) ||
          {};
        for (const [id, incoming] of Object.entries(partial.store.workspaces)) {
          const merged = mergeWorkspace(
            remoteWs[id] as Record<string, unknown> | undefined,
            incoming as Record<string, unknown> | undefined,
          );
          patch[`store/workspaces/${id}`] = stripHeavyImages(merged);
          remoteWs[id] = merged;
        }
      }

      if (Array.isArray(partial.vault)) {
        const curVault = dbList<Record<string, unknown>>(
          await getPath<unknown>(`${ROOT}/vault`),
        );
        patch.vault = mergeById(
          curVault as Record<string, unknown>[],
          partial.vault as Record<string, unknown>[],
          (v) => String(v.id || v.key || ''),
        ).map((v) => stripHeavyImages(v));
      }

      if (Array.isArray(partial.clients)) {
        const curClients =
          (await getPath<RemoteDb['clients']>(`${ROOT}/clients`)) || [];
        const deleted = new Set(
          ((await getPath<string[]>(`${ROOT}/deletedClients`)) || []).map((e) =>
            e.toLowerCase(),
          ),
        );
        patch.clients = mergeById(
          curClients,
          partial.clients,
          (c) => String(c.id || c.email || ''),
        ).filter((c) => !deleted.has(String(c.email || '').toLowerCase()));
      }

      if (partial.images && typeof partial.images === 'object') {
        for (const [id, dataUrl] of Object.entries(partial.images)) {
          const key = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
          if (!key || !dataUrl) continue;
          patch[`images/${key}`] = dataUrl;
        }
      }

      if (partial.sessions && typeof partial.sessions === 'object') {
        for (const [email, session] of Object.entries(partial.sessions)) {
          const key = email.trim().toLowerCase();
          if (!key) continue;
          patch[`sessions/${key}`] = session;
        }
      }

      if (Array.isArray(partial.revokedKeys)) {
        const cur =
          (await getPath<string[]>(`${ROOT}/revokedKeys`)) || [];
        patch.revokedKeys = Array.from(
          new Set([...cur, ...partial.revokedKeys]),
        );
      }

      if (Array.isArray(partial.deletedClients)) {
        const cur =
          (await getPath<string[]>(`${ROOT}/deletedClients`)) || [];
        patch.deletedClients = Array.from(
          new Set(
            [...cur, ...partial.deletedClients].map((e) => e.toLowerCase()),
          ),
        );
      }

      await update(rootRef, patch);
      return (await firebaseFetchDb()) || emptyDb();
    } catch (err) {
      console.warn('[firebase] pushDb failed', err);
      return null;
    }
  });
}

/** Keep large data-URLs out of workspaces/vault — they live under lumo/images. */
function stripHeavyImages<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = { ...obj };
  if (typeof out.eaImage === 'string' && out.eaImage.startsWith('data:')) {
    const owner = String(out.ownerAdminId || out.mentorId || '');
    out.eaImage = owner ? `img:profile-${owner}` : '';
  }
  if (typeof out.imageUrl === 'string' && out.imageUrl.startsWith('data:')) {
    out.imageUrl = '';
  }
  if (out.profile && typeof out.profile === 'object') {
    const profile = { ...(out.profile as Record<string, unknown>) };
    if (typeof profile.eaImage === 'string' && profile.eaImage.startsWith('data:')) {
      const mentorId = String(profile.mentorId || '');
      profile.eaImage = mentorId ? `img:profile-${mentorId}` : '';
    }
    out.profile = profile;
  }
  if (Array.isArray(out.eas)) {
    out.eas = (out.eas as Record<string, unknown>[]).map((ea) => {
      if (typeof ea.imageUrl === 'string' && ea.imageUrl.startsWith('data:')) {
        return { ...ea, imageUrl: '' };
      }
      return ea;
    });
  }
  if (Array.isArray(out.licenses)) {
    out.licenses = (out.licenses as Record<string, unknown>[]).map((lic) => {
      if (typeof lic.eaImage === 'string' && lic.eaImage.startsWith('data:')) {
        const owner = String(lic.ownerAdminId || '');
        return {
          ...lic,
          eaImage: owner ? `img:profile-${owner}` : '',
        };
      }
      return lic;
    });
  }
  return out as T;
}

export async function firebaseFetchClients(): Promise<RemoteDb['clients'] | null> {
  const db = await firebaseFetchDb();
  return db?.clients ?? null;
}

export async function firebaseFetchAdmins(): Promise<
  RemoteDb['auth']['admins'] | null
> {
  if (!isFirebaseConfigured()) return null;
  try {
    const auth = await getPath<RemoteDb['auth']>(`${ROOT}/auth`);
    return auth?.admins ?? [];
  } catch (err) {
    console.warn('[firebase] fetchAdmins failed', err);
    return null;
  }
}

export async function firebasePostMentorRegistration(input: {
  email: string;
  password: string;
  fullName: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}): Promise<Record<string, unknown> | null> {
  if (!isFirebaseConfigured()) return null;
  return enqueueWrite(async () => {
    try {
      const email = input.email.trim().toLowerCase();
      const curAuth =
        (await getPath<RemoteDb['auth']>(`${ROOT}/auth`)) || emptyDb().auth;
      const curAdmins = (curAuth.admins || []) as AdminLike[];
      const existing = curAdmins.find((a) => String(a.email || '').toLowerCase() === email);
      if (existing) return existing;

      const fullName = input.fullName.trim();
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const entry = {
        id: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
        email,
        fullName,
        password: input.password,
        role: 'pending',
        mentorName: String(input.mentorName || '').trim(),
        eaName: String(input.eaName || '').trim(),
        phone: String(input.phone || '').trim(),
        mainText: String(input.mainText || '').trim(),
      };
      const workspace = {
        eas: [],
        licenses: [],
        clientRequests: [],
        mt5: {},
        profile: {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' '),
          email,
          phone: entry.phone,
          mentorName: entry.mentorName,
          mentorId: entry.id,
          eaDisplayName: entry.eaName,
          mainText: entry.mainText,
          eaImage: '',
          customMedia: [],
        },
        orders: [],
        revokedKeys: [],
      };
      await update(ref(getFirebaseDb(), ROOT), {
        auth: {
          admins: mergeAdmins(curAdmins, [entry]),
          admin: null,
        },
        [`store/workspaces/${entry.id}`]: workspace,
        updatedAt: new Date().toISOString(),
      });
      return entry;
    } catch (err) {
      console.warn('[firebase] postMentorRegistration failed', err);
      return null;
    }
  });
}

/** Lightweight read of the deleted-subscriptions tombstone list. */
export async function firebaseFetchDeletedClients(): Promise<string[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const list = (await getPath<string[]>(`${ROOT}/deletedClients`)) || [];
    return list.map((e) => String(e).toLowerCase());
  } catch {
    return [];
  }
}

export async function firebasePostClient(input: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<RemoteDb['clients'][number] | null> {
  if (!isFirebaseConfigured()) return null;
  return enqueueWrite(async () => {
    try {
      const email = input.email.trim().toLowerCase();
      const curClients =
        (await getPath<RemoteDb['clients']>(`${ROOT}/clients`)) || [];
      const existing = curClients.find((c) => c.email.toLowerCase() === email);
      if (existing) return existing;
      const entry: RemoteDb['clients'][number] = {
        id: `cli-${Date.now()}`,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      // A fresh registration lifts the deletion tombstone for this email
      const deleted =
        (await getPath<string[]>(`${ROOT}/deletedClients`)) || [];
      await update(ref(getFirebaseDb(), ROOT), {
        clients: [entry, ...curClients],
        deletedClients: deleted.filter((e) => e.toLowerCase() !== email),
        updatedAt: new Date().toISOString(),
      });
      return entry;
    } catch (err) {
      console.warn('[firebase] postClient failed', err);
      return null;
    }
  });
}

export async function firebasePatchClient(
  id: string,
  patch: {
    status?: 'pending' | 'approved' | 'rejected';
    paymentClaimed?: boolean;
    paymentClaimedAt?: string;
  },
): Promise<RemoteDb['clients'][number] | null> {
  if (!isFirebaseConfigured()) return null;
  return enqueueWrite(async () => {
    try {
      const curClients =
        (await getPath<RemoteDb['clients']>(`${ROOT}/clients`)) || [];
      const idx = curClients.findIndex(
        (c) => c.id === id || c.email.toLowerCase() === id.toLowerCase(),
      );
      if (idx < 0) return null;
      curClients[idx] = { ...curClients[idx], ...patch };
      await update(ref(getFirebaseDb(), ROOT), {
        clients: curClients,
        updatedAt: new Date().toISOString(),
      });
      return curClients[idx];
    } catch (err) {
      console.warn('[firebase] patchClient failed', err);
      return null;
    }
  });
}

export async function firebaseDeleteClient(
  id: string,
): Promise<{ ok: boolean; removed: number } | null> {
  if (!isFirebaseConfigured()) return null;
  return enqueueWrite(async () => {
    try {
      const curClients =
        (await getPath<RemoteDb['clients']>(`${ROOT}/clients`)) || [];
      const before = curClients.length;
      const hit = curClients.find(
        (c) => c.id === id || c.email.toLowerCase() === id.toLowerCase(),
      );
      const next = curClients.filter(
        (c) => c.id !== id && c.email.toLowerCase() !== id.toLowerCase(),
      );
      // Tombstone the email so merges and prepaid seeding never revive it
      const emails = new Set(
        ((await getPath<string[]>(`${ROOT}/deletedClients`)) || []).map((e) =>
          e.toLowerCase(),
        ),
      );
      const email = (hit?.email || (id.includes('@') ? id : '')).toLowerCase();
      if (email) emails.add(email);
      await update(ref(getFirebaseDb(), ROOT), {
        clients: next,
        deletedClients: [...emails],
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, removed: before - next.length };
    } catch (err) {
      console.warn('[firebase] deleteClient failed', err);
      return null;
    }
  });
}

export async function firebaseFetchSession<T>(
  email: string,
): Promise<T | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const key = email.trim().toLowerCase();
    const snap = await get(ref(getFirebaseDb(), `${ROOT}/sessions/${key}`));
    return (snap.exists() ? snap.val() : null) as T | null;
  } catch (err) {
    console.warn('[firebase] fetchSession failed', err);
    return null;
  }
}

export async function firebasePushSession(
  email: string,
  session: unknown,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    const key = email.trim().toLowerCase();
    const path = `${ROOT}/sessions/${key}`;
    const prevSnap = await get(ref(getFirebaseDb(), path));
    const prev = prevSnap.exists() ? prevSnap.val() : null;
    const incoming = session as {
      accessStatus?: string;
      bot?: { licenseKey?: string; [k: string]: unknown };
      [k: string]: unknown;
    };
    let merged = incoming;
    if (prev && typeof prev === 'object') {
      const prevBot = (prev as { bot?: { licenseKey?: string } }).bot || {};
      const nextBot = incoming.bot || {};
      const incomingKey = String(nextBot.licenseKey || '').trim();
      const prevKey = String(prevBot.licenseKey || '').trim();
      const intentionalClear =
        nextBot.licenseKey !== undefined &&
        !incomingKey &&
        (incoming.accessStatus === 'paid' || incoming.accessStatus === 'pending');
      const licenseKey = intentionalClear ? '' : incomingKey || prevKey;
      merged = {
        ...prev,
        ...incoming,
        accessStatus: licenseKey ? 'licensed' : incoming.accessStatus || (prev as { accessStatus?: string }).accessStatus,
        bot: {
          ...prevBot,
          ...nextBot,
          licenseKey,
        },
      };
    }
    await set(ref(getFirebaseDb(), path), merged);
    return true;
  } catch (err) {
    console.warn('[firebase] pushSession failed', err);
    return false;
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || 'image/jpeg';
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Upload image/video to Firebase Storage; returns a public HTTPS URL. */
export async function firebaseUploadFile(
  path: string,
  file: Blob | File,
  contentType?: string,
): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const safe = path.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/^\/+/, '');
    const r = storageRef(getFirebaseStorage(), `lumo/${safe}`);
    await uploadBytes(r, file, {
      contentType: contentType || (file as File).type || 'application/octet-stream',
    });
    return await getDownloadURL(r);
  } catch (err) {
    console.warn('[firebase] uploadFile failed', err);
    return null;
  }
}

export async function firebaseUploadDataUrl(
  path: string,
  dataUrl: string,
): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (blob) return firebaseUploadFile(path, blob, blob.type);
    const safe = path.replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/^\/+/, '');
    const r = storageRef(getFirebaseStorage(), `lumo/${safe}`);
    await uploadString(r, dataUrl, 'data_url');
    return await getDownloadURL(r);
  } catch (err) {
    console.warn('[firebase] uploadDataUrl failed', err);
    return null;
  }
}

/** Durable image store in Realtime Database (works even when Storage is not enabled). */
export async function firebaseSaveImage(
  id: string,
  dataUrl: string,
): Promise<string | null> {
  if (!isFirebaseConfigured() || !id || !dataUrl) return null;
  try {
    const key = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    await set(ref(getFirebaseDb(), `${ROOT}/images/${key}`), dataUrl);
    // Also mirror into the images map via a light merge write
    return `img:${key}`;
  } catch (err) {
    console.warn('[firebase] saveImage failed', err);
    return null;
  }
}

export async function firebaseFetchImage(id: string): Promise<string> {
  if (!isFirebaseConfigured() || !id) return '';
  try {
    const key = id.replace(/^img:/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const snap = await get(ref(getFirebaseDb(), `${ROOT}/images/${key}`));
    const val = snap.exists() ? snap.val() : '';
    return typeof val === 'string' ? val : '';
  } catch {
    return '';
  }
}

export function isFirebaseImageRef(value: string | undefined): boolean {
  return Boolean(value && String(value).startsWith('img:'));
}

export function firebaseWatchUpdates(cb: () => void): () => void {
  if (!isFirebaseConfigured()) return () => undefined;
  try {
    const r = ref(getFirebaseDb(), `${ROOT}/updatedAt`);
    let first = true;
    const unsub = onValue(
      r,
      () => {
        if (first) {
          first = false;
          return;
        }
        cb();
      },
      () => undefined,
    );
    return unsub;
  } catch {
    return () => undefined;
  }
}

/** Watch a mentor's copy-trade order queue in real time. */
export function firebaseWatchMentorOrders(
  mentorId: string,
  cb: (orders: Array<Record<string, unknown>>) => void,
): () => void {
  if (!isFirebaseConfigured() || !mentorId) return () => undefined;
  try {
    const r = ref(getFirebaseDb(), `${ROOT}/store/workspaces/${mentorId}/orders`);
    return onValue(
      r,
      (snap) => {
        cb(dbList(snap.val()));
      },
      () => undefined,
    );
  } catch {
    return () => undefined;
  }
}

export async function firebaseHealthy(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    await get(ref(getFirebaseDb(), ROOT));
    return true;
  } catch {
    return false;
  }
}
