const FIREBASE_DB_URL = (
  process.env.FIREBASE_DATABASE_URL ||
  process.env.VITE_FIREBASE_DATABASE_URL ||
  'https://lumoedge-61c02-default-rtdb.firebaseio.com'
).replace(/\/$/, '');

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export function normalizeClientStatus(raw) {
  const value = String(raw ?? 'pending')
    .trim()
    .toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  return 'pending';
}

export function pickClientStatus(a, b) {
  const left = normalizeClientStatus(a);
  const right = normalizeClientStatus(b);
  if (left === 'approved' || right === 'approved') return 'approved';
  if (left === 'pending' || right === 'pending') return 'pending';
  return 'rejected';
}

export function mergeClientRecord(prev, incoming) {
  const email = String(incoming.email || prev.email || '').toLowerCase();
  return {
    ...prev,
    ...incoming,
    email,
    status: pickClientStatus(prev.status, incoming.status),
    paymentClaimed: Boolean(prev.paymentClaimed || incoming.paymentClaimed),
    paymentClaimedAt: prev.paymentClaimedAt || incoming.paymentClaimedAt,
  };
}

export function mergeClients(existing = [], incoming = []) {
  const byEmail = new Map();
  for (const c of existing || []) {
    if (c?.email) byEmail.set(String(c.email).toLowerCase(), c);
  }
  for (const c of incoming || []) {
    if (!c?.email) continue;
    const email = String(c.email).toLowerCase();
    const prev = byEmail.get(email);
    byEmail.set(email, prev ? mergeClientRecord(prev, { ...c, email }) : { ...c, email });
  }
  return [...byEmail.values()];
}

export async function firebaseRead(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function firebaseWrite(path, value) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Live Firebase registrations merged with durable GitHub backup — never drop pending. */
export async function loadMergedClients(loadDb) {
  const { db } = await loadDb();
  const githubClients = toArray(db.clients);
  const fbClients = toArray(await firebaseRead('lumo/clients'));
  return mergeClients(githubClients, fbClients);
}

export function mirrorClientToSuperWorkspace(workspaces, entry) {
  const sid = 'LM-004821';
  const next = { ...workspaces };
  const ws = next[sid] || {
    eas: [],
    licenses: [],
    clientRequests: [],
    mt5: {},
    profile: {},
    orders: [],
    revokedKeys: [],
  };
  const rest = toArray(ws.clientRequests).filter(
    (c) => c.id !== entry.id && String(c.email || '').toLowerCase() !== String(entry.email || '').toLowerCase(),
  );
  next[sid] = { ...ws, clientRequests: [entry, ...rest] };
  return next;
}

export async function firebasePatchClientById(id, patch) {
  const freshClients = toArray(await firebaseRead('lumo/clients'));
  const key = String(id || '').trim();
  const idx = freshClients.findIndex(
    (c) =>
      c.id === key ||
      String(c.email || '').toLowerCase() === key.toLowerCase(),
  );
  if (idx < 0) return null;
  const prev = freshClients[idx];
  const updated = mergeClientRecord(prev, {
    ...prev,
    ...patch,
    email: prev.email,
    id: prev.id,
  });
  freshClients[idx] = updated;

  const remoteWs = (await firebaseRead('lumo/store/workspaces')) || {};
  const nextWs = mirrorClientToSuperWorkspace(remoteWs, updated);
  const sid = 'LM-004821';

  await Promise.all([
    firebaseWrite('lumo/clients', freshClients),
    nextWs[sid]
      ? firebaseWrite(`lumo/store/workspaces/${sid}`, nextWs[sid])
      : Promise.resolve(true),
    firebaseWrite('lumo/updatedAt', new Date().toISOString()),
  ]);
  return updated;
}

export function adminRoleRank(role) {
  if (role === 'super') return 3;
  if (role === 'admin') return 2;
  return 1;
}

export function pickAdminRole(a, b) {
  return adminRoleRank(a) >= adminRoleRank(b) ? a : b;
}

export async function firebasePatchAdminRole(id, role) {
  const curAuth = (await firebaseRead('lumo/auth')) || { admins: [], admin: null };
  const admins = toArray(curAuth.admins).map((a) => {
    if (a.id !== id) return a;
    return { ...a, role: pickAdminRole(a.role, role) };
  });
  const ok = await firebaseWrite('lumo/auth', { admins, admin: null });
  await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
  return ok ? admins.find((a) => a.id === id) || null : null;
}
