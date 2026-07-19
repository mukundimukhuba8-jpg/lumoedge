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

/** Deep-merge objects; arrays in `patch` replace (except we special-case clients/vault). */
function mergeDb(current: RemoteDb, patch: Partial<RemoteDb>): RemoteDb {
  const next = normalizeDb({
    ...current,
    ...patch,
    auth: { ...current.auth, ...(patch.auth || {}) },
    store: {
      workspaces: {
        ...(current.store?.workspaces || {}),
        ...(patch.store?.workspaces || {}),
      },
    },
    images: { ...(current.images || {}), ...(patch.images || {}) },
    sessions: { ...(current.sessions || {}), ...(patch.sessions || {}) },
    updatedAt: new Date().toISOString(),
  });

  if (Array.isArray(patch.clients)) {
    const byId = new Map<string, RemoteDb['clients'][number]>();
    for (const c of current.clients || []) byId.set(c.id || c.email, c);
    for (const c of patch.clients) byId.set(c.id || c.email, { ...(byId.get(c.id || c.email) || c), ...c });
    next.clients = Array.from(byId.values());
  }

  if (Array.isArray(patch.vault)) {
    const byId = new Map<string, unknown>();
    for (const v of current.vault || []) {
      const id = String((v as { id?: string; key?: string }).id || (v as { key?: string }).key || '');
      if (id) byId.set(id, v);
    }
    for (const v of patch.vault) {
      const id = String((v as { id?: string; key?: string }).id || (v as { key?: string }).key || '');
      if (id) byId.set(id, { ...(byId.get(id) as object || {}), ...(v as object) });
    }
    next.vault = Array.from(byId.values());
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
