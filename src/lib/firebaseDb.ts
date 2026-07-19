import { get, ref, set } from 'firebase/database';
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
  updatedAt?: string;
};

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
    vault: Array.isArray(db.vault) ? db.vault : [],
    images: db.images && typeof db.images === 'object' ? db.images : {},
    clients: Array.isArray(db.clients) ? db.clients : [],
    sessions: db.sessions && typeof db.sessions === 'object' ? db.sessions : {},
    revokedKeys: Array.isArray(db.revokedKeys) ? db.revokedKeys : [],
    updatedAt: db.updatedAt || new Date().toISOString(),
  };
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
  const eas = mergeById(
    (Array.isArray(a.eas) ? a.eas : []) as Record<string, unknown>[],
    (Array.isArray(b.eas) ? b.eas : []) as Record<string, unknown>[],
    (e) => String(e.id || e.name || ''),
  );
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

function mergeWorkspaces(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const ids = new Set([...Object.keys(current || {}), ...Object.keys(incoming || {})]);
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    out[id] = mergeWorkspace(
      current?.[id] as Record<string, unknown> | undefined,
      incoming?.[id] as Record<string, unknown> | undefined,
    );
  }
  return out;
}

function mergeDb(current: RemoteDb, patch: Partial<RemoteDb>): RemoteDb {
  const curWs =
    (current.store?.workspaces as Record<string, unknown>) || {};
  const patchWs =
    patch.store?.workspaces && typeof patch.store.workspaces === 'object'
      ? (patch.store.workspaces as Record<string, unknown>)
      : null;

  const next = normalizeDb({
    ...current,
    ...patch,
    auth: { ...current.auth, ...(patch.auth || {}) },
    store: {
      workspaces: patchWs ? mergeWorkspaces(curWs, patchWs) : curWs,
    },
    images: { ...(current.images || {}), ...(patch.images || {}) },
    sessions: { ...(current.sessions || {}), ...(patch.sessions || {}) },
    updatedAt: new Date().toISOString(),
  });

  if (Array.isArray(patch.clients)) {
    next.clients = mergeById(
      current.clients || [],
      patch.clients,
      (c) => String(c.id || c.email || ''),
    ) as RemoteDb['clients'];
  }

  if (Array.isArray(patch.vault)) {
    next.vault = mergeById(
      (current.vault || []) as Record<string, unknown>[],
      patch.vault as Record<string, unknown>[],
      (v) => String(v.id || v.key || ''),
    );
  }

  if (Array.isArray(patch.revokedKeys)) {
    next.revokedKeys = Array.from(
      new Set([...(current.revokedKeys || []), ...patch.revokedKeys]),
    );
  }

  return next;
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

export async function firebasePushDb(
  partial: Partial<RemoteDb>,
): Promise<RemoteDb | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const current = (await firebaseFetchDb()) || emptyDb();
    const merged = mergeDb(current, partial);
    await set(ref(getFirebaseDb(), ROOT), merged);
    return merged;
  } catch (err) {
    console.warn('[firebase] pushDb failed', err);
    return null;
  }
}

export async function firebaseFetchClients(): Promise<RemoteDb['clients'] | null> {
  const db = await firebaseFetchDb();
  return db?.clients ?? null;
}

export async function firebasePostClient(input: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<RemoteDb['clients'][number] | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const db = (await firebaseFetchDb()) || emptyDb();
    const email = input.email.trim().toLowerCase();
    const existing = db.clients.find((c) => c.email.toLowerCase() === email);
    if (existing) return existing;
    const entry: RemoteDb['clients'][number] = {
      id: `cli-${Date.now()}`,
      email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.clients = [entry, ...db.clients];
    db.updatedAt = new Date().toISOString();
    await set(ref(getFirebaseDb(), ROOT), db);
    return entry;
  } catch (err) {
    console.warn('[firebase] postClient failed', err);
    return null;
  }
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
  try {
    const db = (await firebaseFetchDb()) || emptyDb();
    const idx = db.clients.findIndex(
      (c) => c.id === id || c.email.toLowerCase() === id.toLowerCase(),
    );
    if (idx < 0) return null;
    db.clients[idx] = { ...db.clients[idx], ...patch };
    db.updatedAt = new Date().toISOString();
    await set(ref(getFirebaseDb(), ROOT), db);
    return db.clients[idx];
  } catch (err) {
    console.warn('[firebase] patchClient failed', err);
    return null;
  }
}

export async function firebaseDeleteClient(
  id: string,
): Promise<{ ok: boolean; removed: number } | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const db = (await firebaseFetchDb()) || emptyDb();
    const before = db.clients.length;
    db.clients = db.clients.filter(
      (c) => c.id !== id && c.email.toLowerCase() !== id.toLowerCase(),
    );
    db.updatedAt = new Date().toISOString();
    await set(ref(getFirebaseDb(), ROOT), db);
    return { ok: true, removed: before - db.clients.length };
  } catch (err) {
    console.warn('[firebase] deleteClient failed', err);
    return null;
  }
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
        incoming.accessStatus === 'paid';
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

export async function firebaseHealthy(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    await get(ref(getFirebaseDb(), ROOT));
    return true;
  } catch {
    return false;
  }
}
