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

/** Create or return existing client in Firebase — source of truth for live registrations. */
export async function firebasePostClientEntry(input) {
  const email = String(input.email || '')
    .trim()
    .toLowerCase();
  const firstName = String(input.firstName || '').trim();
  const lastName = String(input.lastName || '').trim();
  if (!email || !firstName || !lastName) return null;

  const freshClients = toArray(await firebaseRead('lumo/clients'));
  const existing = freshClients.find((c) => String(c.email || '').toLowerCase() === email);
  if (existing) {
    const remoteWs = (await firebaseRead('lumo/store/workspaces')) || {};
    const nextWs = mirrorClientToSuperWorkspace(remoteWs, existing);
    const sid = 'LM-004821';
    if (nextWs[sid]) {
      await firebaseWrite(`lumo/store/workspaces/${sid}`, nextWs[sid]);
    }
    return existing;
  }

  const entry = {
    id: `cli-${Date.now()}`,
    email,
    firstName,
    lastName,
    status: normalizeClientStatus(input.status || 'pending'),
    createdAt: new Date().toISOString(),
    notifiedAt: new Date().toISOString(),
    paymentClaimed: Boolean(input.paymentClaimed),
    paymentClaimedAt: input.paymentClaimedAt || undefined,
  };
  freshClients.unshift(entry);

  const deleted = new Set(
    toArray(await firebaseRead('lumo/deletedClients')).map((e) => String(e).toLowerCase()),
  );
  deleted.delete(email);

  const remoteWs = (await firebaseRead('lumo/store/workspaces')) || {};
  const nextWs = mirrorClientToSuperWorkspace(remoteWs, entry);
  const sid = 'LM-004821';

  await Promise.all([
    firebaseWrite('lumo/clients', freshClients),
    firebaseWrite('lumo/deletedClients', [...deleted]),
    nextWs[sid]
      ? firebaseWrite(`lumo/store/workspaces/${sid}`, nextWs[sid])
      : Promise.resolve(true),
    firebaseWrite('lumo/updatedAt', new Date().toISOString()),
  ]);
  return entry;
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

export function normalizeAdminRole(raw) {
  const value = String(raw ?? 'pending')
    .trim()
    .toLowerCase();
  if (value === 'super') return 'super';
  if (value === 'admin') return 'admin';
  return 'pending';
}

export function pickAdminRole(a, b) {
  const left = normalizeAdminRole(a);
  const right = normalizeAdminRole(b);
  return adminRoleRank(left) >= adminRoleRank(right) ? left : right;
}

/** Live Firebase pending must beat stale GitHub "admin" during sync. */
export function pickAdminRoleLive(liveRole, backupRole) {
  const live = normalizeAdminRole(liveRole);
  const backup = normalizeAdminRole(backupRole);
  if (live === 'super') return 'super';
  if (live === 'admin') return 'admin';
  if (backup === 'admin') return 'pending';
  return pickAdminRole(live, backup);
}

export function mergeAdminsLive(live, backup) {
  const byEmail = new Map();
  for (const item of toArray(live)) {
    const email = String(item?.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) });
  }
  for (const item of toArray(backup)) {
    const email = String(item?.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) });
      continue;
    }
    const merged = { ...prev, ...item, email };
    merged.role = pickAdminRoleLive(prev.role, item.role);
    for (const [k, v] of Object.entries(prev)) {
      const nextVal = item[k];
      if ((nextVal === '' || nextVal == null) && v !== '' && v != null) {
        merged[k] = v;
      }
    }
    byEmail.set(email, merged);
  }
  return [...byEmail.values()];
}

export async function firebasePatchAdminRole(idOrEmail, role) {
  const key = String(idOrEmail || '').trim();
  const keyLower = key.toLowerCase();
  const curAuth = (await firebaseRead('lumo/auth')) || { admins: [], admin: null };
  let hit = null;
  const admins = toArray(curAuth.admins).map((a) => {
    const match =
      a.id === key || String(a.email || '').trim().toLowerCase() === keyLower;
    if (!match) return a;
    hit = { ...a, role: pickAdminRole(a.role, role) };
    return hit;
  });
  if (!hit) return null;
  const ok = await firebaseWrite('lumo/auth', { admins, admin: null });
  await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
  return ok ? hit : null;
}

export async function firebaseRegisterMentor(entry, workspace) {
  const curAuth = (await firebaseRead('lumo/auth')) || { admins: [], admin: null };
  const admins = mergeAdminsLive(toArray(curAuth.admins), [entry]);
  const authOk = await firebaseWrite('lumo/auth', { admins, admin: null });
  const wsOk = await firebaseWrite(`lumo/store/workspaces/${entry.id}`, workspace);
  await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
  return authOk && wsOk;
}
