const OWNER = process.env.LUMO_DATA_OWNER || 'mukundimukhuba8-jpg';
const REPO = process.env.LUMO_DATA_REPO || 'lumoedge';
const PATH = process.env.LUMO_DATA_PATH || 'cloud-data/db.json';
/** Base64 data URLs for mentor media — ~6 MB decoded image budget */
const MAX_DATA_URL_CHARS = 8_000_000;

function emptyDb() {
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

function token() {
  return (
    process.env.LUMO_DATA_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ''
  );
}

const FIREBASE_DB_URL = (
  process.env.FIREBASE_DATABASE_URL ||
  process.env.VITE_FIREBASE_DATABASE_URL ||
  'https://lumoedge-61c02-default-rtdb.firebaseio.com'
).replace(/\/$/, '');

/**
 * Prefer Vercel/server env. Firebase fallback is legacy only — /lumo is
 * world-readable in current rules, so never store production keys there.
 */
async function resolveChartScanConfig() {
  const envKey =
    process.env.CHART_SCAN_API_KEY || process.env.OPENAI_API_KEY || '';
  const envUrl =
    process.env.CHART_SCAN_API_URL ||
    'https://api.openai.com/v1/chat/completions';
  const envModel = process.env.CHART_SCAN_MODEL || 'gpt-4o';
  if (envKey) {
    return { apiKey: envKey, apiUrl: envUrl, model: envModel, source: 'env' };
  }
  // Legacy fallback (insecure if RTDB rules allow public read). Prefer env.
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/lumo/secrets/chartScan.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return { apiKey: '', apiUrl: envUrl, model: envModel, source: 'none' };
    }
    const data = await res.json();
    const apiKey = String(
      (data && (data.apiKey || data.CHART_SCAN_API_KEY || data.key)) || '',
    ).trim();
    return {
      apiKey,
      apiUrl: String((data && data.apiUrl) || envUrl),
      model: String((data && data.model) || envModel),
      source: apiKey ? 'firebase' : 'none',
    };
  } catch {
    return { apiKey: '', apiUrl: envUrl, model: envModel, source: 'none' };
  }
}

function ghHeaders() {
  const t = token();
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lumo-edge-api',
  };
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeDb(db) {
  const base = emptyDb();
  return {
    ...base,
    ...(db || {}),
    auth: {
      ...base.auth,
      ...((db && db.auth) || {}),
      admins: toArray(db && db.auth && db.auth.admins),
    },
    store: { workspaces: { ...((db && db.store && db.store.workspaces) || {}) } },
    clients: toArray(db && db.clients),
    sessions: db && db.sessions && typeof db.sessions === 'object' ? db.sessions : {},
    vault: toArray(db && db.vault),
    images: db && db.images && typeof db.images === 'object' ? db.images : {},
    revokedKeys: toArray(db && db.revokedKeys),
    scanAdmin:
      db && db.scanAdmin && typeof db.scanAdmin === 'object' ? db.scanAdmin : undefined,
  };
}

/** Never let a stale pending push wipe a saved license key. */
function mergeSessionPreferLicense(prev, incoming) {
  if (!incoming || typeof incoming !== 'object') return prev || incoming;
  if (!prev || typeof prev !== 'object') return incoming;
  const prevBot = prev.bot && typeof prev.bot === 'object' ? prev.bot : {};
  const nextBot = incoming.bot && typeof incoming.bot === 'object' ? incoming.bot : {};
  const incomingKey = String(nextBot.licenseKey || '').trim();
  const prevKey = String(prevBot.licenseKey || '').trim();
  // deleteBot clears license + demotes access — allow empty key when not licensed.
  const intentionalClear =
    nextBot.licenseKey !== undefined &&
    !incomingKey &&
    String(incoming.accessStatus || '') !== 'licensed';
  const licenseKey = intentionalClear ? '' : incomingKey || prevKey;
  const accessStatus = licenseKey
    ? 'licensed'
    : intentionalClear
      ? incoming.accessStatus || 'pending'
      : incoming.accessStatus || prev.accessStatus || 'pending';
  return {
    ...prev,
    ...incoming,
    accessStatus,
    bot: {
      ...prevBot,
      ...nextBot,
      licenseKey,
    },
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function pickClientStatus(a, b) {
  if (a === 'approved' || b === 'approved') return 'approved';
  if (a === 'pending' || b === 'pending') return 'pending';
  return 'rejected';
}

function mergeClientRecord(prev, incoming) {
  const email = String(incoming.email).toLowerCase();
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

/** Never drop existing clients / vault / licenses on sync — only add or upgrade */
function mergeClients(existing = [], incoming = []) {
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

function mergeVault(existing = [], incoming = []) {
  const byId = new Map();
  const byKey = new Map();
  const put = (v) => {
    if (!v) return;
    const key = String(v.key || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (v.id) byId.set(v.id, v);
    if (key) byKey.set(key, v);
  };
  for (const v of existing || []) put(v);
  for (const v of incoming || []) put(v);
  const out = new Map();
  for (const v of byId.values()) out.set(v.id || v.key, v);
  for (const v of byKey.values()) out.set(v.id || v.key, v);
  return [...out.values()].filter((v) => v.status !== 'deleted');
}

/** Live Firebase registrations merged with durable GitHub backup — never drop pending. */
async function loadMergedClients() {
  const { mergeClientsLive } = await import('./_lib/clientMerge.mjs');
  const { db } = await loadDb();
  const githubClients = toArray(db.clients);
  const fbClients = toArray(await firebaseRead('lumo/clients'));
  return mergeClientsLive(fbClients, githubClients);
}

async function firebaseRead(path) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function firebaseWrite(path, value) {
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

async function firebasePatch(path, value) {
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function emailCtx() {
  return { firebaseRead, firebaseWrite, firebasePush: null };
}

/** Fire-and-forget transactional email — never blocks the main API response. */
function queueEmail(promise) {
  void Promise.resolve(promise).catch((err) => {
    console.warn('[email]', err instanceof Error ? err.message : err);
  });
}

async function firebaseRegisterMentor(entry, workspace) {
  const curAuth = (await firebaseRead('lumo/auth')) || { admins: [], admin: null };
  const admins = mergeAdmins(toArray(curAuth.admins), [entry]);
  const authOk = await firebaseWrite('lumo/auth', { admins, admin: null });
  const wsOk = await firebaseWrite(`lumo/store/workspaces/${entry.id}`, workspace);
  await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
  return authOk && wsOk;
}

async function firebaseFetchAdminList() {
  const curAuth = await firebaseRead('lumo/auth');
  const admins = toArray(curAuth?.admins);
  return admins.length ? admins : null;
}

/** Publish mentor licenses straight to Firebase — works even when client SDK writes fail. */
async function publishLicensesToFirebase(adminId, vaultEntries, workspace, revokedKeys) {
  const { keysMatch, normalizeLicenseKey } = await import('./_lib/licenseClaim.mjs');
  try {
    const curVault = toArray(await firebaseRead('lumo/vault'));
    const newEmails = new Set(
      vaultEntries
        .map((v) => String(v?.email || v?.clientEmail || '').trim().toLowerCase())
        .filter(Boolean),
    );
    for (const v of curVault) {
      if (v?.ownerAdminId !== adminId) continue;
      const email = String(v?.email || v?.clientEmail || '').trim().toLowerCase();
      if (!email || !newEmails.has(email)) continue;
      const incoming = vaultEntries.find(
        (e) => String(e?.email || e?.clientEmail || '').trim().toLowerCase() === email,
      );
      if (
        incoming &&
        !keysMatch(String(v?.key || ''), String(incoming?.key || '')) &&
        (v.status === 'active' || v.status === 'assigned')
      ) {
        return {
          ok: false,
          error: `Email ${email} already has license ${normalizeLicenseKey(String(v.key || ''))}`,
          key: null,
        };
      }
    }

    const fingerprint = (k) =>
      String(k || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    // Live keys being published must leave the revoked list — otherwise restore
    // can never reactivate keys that were falsely banned.
    const liveNorms = new Set(
      toArray(vaultEntries)
        .filter((v) => v && v.status !== 'deleted' && fingerprint(v.key))
        .map((v) => fingerprint(v.key)),
    );
    const curRevoked = toArray(await firebaseRead('lumo/revokedKeys'));
    const mergedRevoked = [
      ...new Set([...curRevoked, ...toArray(revokedKeys)].map((k) => String(k || '').toUpperCase())),
    ]
      .filter(Boolean)
      .filter((k) => !liveNorms.has(fingerprint(k)));
    const revokedNorm = new Set(mergedRevoked.map((k) => fingerprint(k)).filter(Boolean));
    const mergedVault = mergeVault(curVault, vaultEntries).filter((v) => {
      const norm = fingerprint(v?.key);
      // Keep live publish rows even if they were previously revoked
      if (liveNorms.has(norm)) return true;
      return norm && !revokedNorm.has(norm);
    });
    const curWs = (await firebaseRead(`lumo/store/workspaces/${adminId}`)) || {};
    const mergedWorkspaces = mergeWorkspaces({ [adminId]: curWs }, { [adminId]: workspace });
    const nextWs = mergedWorkspaces[adminId];
    if (Array.isArray(nextWs.licenses)) {
      nextWs.licenses = nextWs.licenses.filter((l) => {
        const norm = fingerprint(l?.key);
        if (liveNorms.has(norm) && l.status !== 'deleted') return true;
        return norm && !revokedNorm.has(norm) && l.status !== 'deleted';
      });
    }
    const vaultOk = await firebaseWrite('lumo/vault', mergedVault);
    const wsOk = await firebaseWrite(`lumo/store/workspaces/${adminId}`, nextWs);
    if (!vaultOk || !wsOk) {
      console.error('[license:publish] vault or workspace write failed', { adminId, vaultOk, wsOk });
      return { ok: false, error: 'Could not save license to cloud database', key: null };
    }
    await firebaseWrite('lumo/revokedKeys', mergedRevoked).catch(() => false);
    await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
    return { ok: true, key: vaultEntries[0]?.key ?? null };
  } catch (err) {
    console.error('[license:publish] unexpected failure', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Firebase write failed',
      key: null,
    };
  }
}

function mergeWorkspaces(existing = {}, incoming = {}) {
  const ids = new Set([...Object.keys(existing || {}), ...Object.keys(incoming || {})]);
  const out = {};
  for (const id of ids) {
    const a = existing?.[id] || {};
    const b = incoming?.[id] || {};
    const licenseMap = new Map();
    for (const l of [...toArray(a.licenses), ...toArray(b.licenses)]) {
      if (!l) continue;
      const key = String(l.key || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const k = l.id || key;
      if (!k) continue;
      const prev = licenseMap.get(k);
      if (!prev || (l.status === 'active' && prev.status !== 'active')) licenseMap.set(k, l);
      else licenseMap.set(k, { ...prev, ...l });
    }
    const easA = toArray(a.eas);
    const easB = toArray(b.eas);
    const licA = toArray(a.licenses);
    const licB = toArray(b.licenses);
    out[id] = {
      ...a,
      ...b,
      deletedEaIds: [...new Set([...toArray(a.deletedEaIds), ...toArray(b.deletedEaIds)])],
      eas:
        easB.length === 0 && easA.length
          ? easA.filter((e, i, arr) => e?.id && arr.findIndex((x) => x.id === e.id) === i)
          : [...easA, ...easB].filter(
              (e, i, arr) => e?.id && arr.findIndex((x) => x.id === e.id) === i,
            ),
      licenses:
        licB.length === 0 && licA.length
          ? licA.filter((l) => l?.key)
          : [...licenseMap.values()],
      clientRequests: mergeClients(toArray(a.clientRequests), toArray(b.clientRequests)),
      profile: { ...(a.profile || {}), ...(b.profile || {}) },
      mt5: { ...(a.mt5 || {}), ...(b.mt5 || {}) },
      orders: [...toArray(b.orders), ...toArray(a.orders)].filter(
        (o, i, arr) => o?.id && arr.findIndex((x) => x.id === o.id) === i,
      ),
      revokedKeys: [
        ...new Set([...toArray(a.revokedKeys), ...toArray(b.revokedKeys)]),
      ],
    };
  }
  return out;
}

function adminRoleRank(role) {
  if (role === 'super') return 3;
  if (role === 'admin') return 2;
  return 1;
}

/** Approved mentors must never revert to pending when lists are merged. */
function mergeAdmins(current, incoming) {
  const byEmail = new Map();
  for (const item of [...toArray(current), ...toArray(incoming)]) {
    const email = String(item?.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email });
      continue;
    }
    const merged = { ...prev, ...item, email };
    const prevRank = adminRoleRank(prev.role);
    const itemRank = adminRoleRank(item.role);
    merged.role = prevRank >= itemRank ? prev.role : item.role;
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

function mergeDatabases(base, patch) {
  const a = normalizeDb(base);
  const b = normalizeDb(patch);
  return normalizeDb({
    ...a,
    ...b,
    auth: {
      ...a.auth,
      ...b.auth,
      admins: mergeAdmins(a.auth?.admins, b.auth?.admins),
    },
    store: {
      workspaces: mergeWorkspaces(a.store?.workspaces, b.store?.workspaces),
    },
    clients: mergeClients(a.clients, b.clients),
    vault: mergeVault(a.vault, b.vault),
    sessions: { ...(a.sessions || {}), ...(b.sessions || {}) },
    images: { ...(a.images || {}), ...(b.images || {}) },
    revokedKeys: [...new Set([...(a.revokedKeys || []), ...(b.revokedKeys || [])])],
    scanAdmin: {
      ...(a.scanAdmin || {}),
      ...(b.scanAdmin || {}),
      quotaResets: { ...(a.scanAdmin?.quotaResets || {}), ...(b.scanAdmin?.quotaResets || {}) },
      historyClears: {
        ...(a.scanAdmin?.historyClears || {}),
        ...(b.scanAdmin?.historyClears || {}),
      },
    },
  });
}

let memoryDb = emptyDb();

async function loadFromGitHubRaw() {
  const rawRes = await fetch(
    `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${PATH}?t=${Date.now()}`,
    { cache: 'no-store' },
  );
  if (!rawRes.ok) return null;
  const raw = await rawRes.text();
  return normalizeDb(JSON.parse(raw || '{}'));
}

async function loadDb() {
  const t = token();
  // Prefer durable GitHub file — works on Vercel even without a write token
  try {
    const fromRaw = await loadFromGitHubRaw();
    if (fromRaw) {
      memoryDb = clone(fromRaw);
      if (!t) {
        return { db: clone(memoryDb), sha: null, backend: 'github-raw' };
      }
    }
  } catch {
    // continue to API / memory
  }

  if (!t) {
    return { db: clone(memoryDb), sha: null, backend: memoryDb.vault?.length ? 'github-raw' : 'memory' };
  }

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  try {
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.status === 404) {
      return { db: memoryDb.clients?.length ? clone(memoryDb) : emptyDb(), sha: null, backend: 'github' };
    }
    if (!res.ok) {
      if (memoryDb.vault?.length || memoryDb.clients?.length) {
        return { db: clone(memoryDb), sha: null, backend: 'github-raw' };
      }
      throw new Error(`GitHub read failed ${res.status}`);
    }
    const data = await res.json();
    const raw = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString(
      'utf8',
    );
    const db = normalizeDb(JSON.parse(raw || '{}'));
    memoryDb = clone(db);
    return { db, sha: data.sha, backend: 'github' };
  } catch (err) {
    if (memoryDb.vault?.length || memoryDb.clients?.length) {
      return { db: clone(memoryDb), sha: null, backend: 'github-raw' };
    }
    throw err;
  }
}

async function saveDb(db, sha) {
  // Always merge on top of the latest durable copy so sync never wipes data
  let latest = emptyDb();
  try {
    const loaded = await loadDb();
    latest = loaded.db;
    if (loaded.sha) sha = loaded.sha;
  } catch {
    latest = clone(memoryDb);
  }
  const next = {
    ...mergeDatabases(latest, db),
    updatedAt: new Date().toISOString(),
  };
  const t = token();
  if (!t) {
    memoryDb = clone(next);
    return { db: memoryDb, sha: 'memory', backend: 'memory' };
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const payload = {
    message: `chore(db): sync ${next.updatedAt}`,
    content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const fresh = await loadDb();
    const merged = {
      ...mergeDatabases(fresh.db, next),
      updatedAt: new Date().toISOString(),
    };
    const retry = await fetch(url, {
      method: 'PUT',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(db): sync retry ${merged.updatedAt}`,
        content: Buffer.from(JSON.stringify(merged, null, 2)).toString('base64'),
        sha: fresh.sha,
      }),
    });
    if (!retry.ok) throw new Error(`GitHub write retry failed ${retry.status}`);
    const out = await retry.json();
    memoryDb = clone(merged);
    return { db: merged, sha: out.content?.sha || fresh.sha, backend: 'github' };
  }
  if (!res.ok) throw new Error(`GitHub write failed ${res.status}`);
  const out = await res.json();
  memoryDb = clone(next);
  return { db: next, sha: out.content?.sha || sha, backend: 'github' };
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function mirrorClientToSuper(db, entry) {
  const sid = 'LM-004821';
  db.store = db.store || { workspaces: {} };
  db.store.workspaces = db.store.workspaces || {};
  const ws = db.store.workspaces[sid] || {
    eas: [],
    licenses: [],
    clientRequests: [],
    mt5: {},
    profile: {},
    orders: [],
    revokedKeys: [],
  };
  const rest = (ws.clientRequests || []).filter(
    (c) => c.id !== entry.id && c.email !== entry.email,
  );
  ws.clientRequests = [entry, ...rest];
  db.store.workspaces[sid] = ws;
}

export default async function handler(req, res) {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    // vercel.json rewrites /api/foo/bar → /api?__path=foo/bar (keeps other query params)
    const rewritePath = String(url.searchParams.get('__path') || '').trim();
    let pathname = rewritePath
      ? `/api/${rewritePath.replace(/^\/+/, '')}`
      : url.pathname;
    if (!pathname.startsWith('/api')) {
      pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    }
    // Strip internal rewrite param before proxying upstream
    url.searchParams.delete('__path');

    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }

    if (pathname === '/api/health' || pathname === '/api') {
      const { db, backend } = await loadDb();
      send(res, 200, {
        ok: true,
        durable: Boolean(token()),
        backend,
        updatedAt: db.updatedAt,
      });
      return;
    }

    if (pathname === '/api/licenses/claim' && req.method === 'POST') {
      const {
        assignEntry,
        dbList,
        findVaultEntry,
        findWorkspaceLicense,
        keyFingerprint,
        keysMatch,
        normalizeLicenseKey,
        releaseOtherAssignedForEmail,
        toClaimPayload,
        validateEmailAccess,
      } = await import('./_lib/licenseClaim.mjs');
      const KEY_ERR = 'Invalid key';
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const key = normalizeLicenseKey(String(body.key || ''));
      if (!email || !key) {
        send(res, 400, { ok: false, error: KEY_ERR });
        return;
      }
      const fp = keyFingerprint(key);
      if (!fp || fp.length < 16) {
        send(res, 400, { ok: false, error: KEY_ERR });
        return;
      }

      const [revokedRaw, vaultRaw, workspacesRaw] = await Promise.all([
        firebaseRead('lumo/revokedKeys'),
        firebaseRead('lumo/vault'),
        firebaseRead('lumo/store/workspaces'),
      ]);
      const revoked = dbList(revokedRaw);
      if (revoked.some((k) => keysMatch(String(k || ''), key))) {
        send(res, 403, { ok: false, error: KEY_ERR });
        return;
      }

      const vault = dbList(vaultRaw);
      const workspaces =
        workspacesRaw && typeof workspacesRaw === 'object' ? workspacesRaw : {};

      let entry = findVaultEntry(vault, key);
      let ownerId = entry?.ownerAdminId || null;
      if (!entry) {
        const wsHit = findWorkspaceLicense(workspaces, key);
        if (wsHit) {
          entry = wsHit.license;
          ownerId = wsHit.ownerId;
        }
      }

      if (!entry) {
        send(res, 404, { ok: false, error: KEY_ERR });
        return;
      }

      // Normalize workspace rows (clientEmail) vs vault rows (email)
      entry = {
        ...entry,
        email: entry.email || entry.clientEmail || '',
        clientEmail: entry.clientEmail || entry.email || '',
        ownerAdminId: entry.ownerAdminId || ownerId || '',
      };

      const emailErr = validateEmailAccess(entry, email, vault, workspaces);
      if (emailErr) {
        // Real reason — do not hide as "Invalid key" after the key was found
        send(res, 403, { ok: false, error: emailErr });
        return;
      }

      // Already activated for this account — skip slow re-writes
      if (
        entry.status === 'assigned' &&
        String(entry.assignedEmail || '').toLowerCase() === email
      ) {
        send(res, 200, { ok: true, license: toClaimPayload(entry) });
        return;
      }

      const released = releaseOtherAssignedForEmail(vault, workspaces, email, key);
      let nextVault = released.vault;
      let nextWorkspaces = released.workspaces;

      const assigned = assignEntry(entry, email);
      const vaultIdx = nextVault.findIndex(
        (v) => v?.id === assigned.id || keysMatch(String(v?.key || ''), key),
      );
      if (vaultIdx >= 0) nextVault[vaultIdx] = { ...nextVault[vaultIdx], ...assigned };
      else nextVault.unshift(assigned);

      const licenseRow = {
        ...assigned,
        clientEmail: assigned.email || assigned.clientEmail || email,
      };
      const ownerWs = ownerId
        ? (await firebaseRead(`lumo/store/workspaces/${ownerId}`)) ||
          nextWorkspaces[ownerId] ||
          null
        : null;
      const ownerLicenses = ownerWs ? dbList(ownerWs.licenses) : [];
      const nextOwnerLicenses = ownerWs
        ? ownerLicenses.some(
            (l) => l?.id === assigned.id || keysMatch(String(l?.key || ''), key),
          )
          ? ownerLicenses.map((l) =>
              l?.id === assigned.id || keysMatch(String(l?.key || ''), key)
                ? { ...l, ...licenseRow }
                : l,
            )
          : [licenseRow, ...ownerLicenses]
        : [];
      const mergedOwnerWs =
        ownerId && ownerWs
          ? mergeWorkspaces({ [ownerId]: ownerWs }, { [ownerId]: { licenses: nextOwnerLicenses } })[
              ownerId
            ]
          : null;

      const writeResults = await Promise.all([
        firebaseWrite('lumo/vault', nextVault),
        ownerId && mergedOwnerWs
          ? firebaseWrite(`lumo/store/workspaces/${ownerId}`, mergedOwnerWs)
          : Promise.resolve(true),
      ]);
      const vaultOk = writeResults[0];
      const wsOk = writeResults[1];
      if (!vaultOk) {
        console.error('[license:claim] vault write failed', { email, key });
        send(res, 503, { ok: false, error: KEY_ERR });
        return;
      }

      // Background cleanup — never block the activation response
      void (async () => {
        for (const [wsId, ws] of Object.entries(nextWorkspaces)) {
          if (wsId === ownerId) continue;
          const origLicenses = JSON.stringify(dbList(workspaces[wsId]?.licenses));
          const nextLicensesJson = JSON.stringify(dbList(ws?.licenses));
          if (origLicenses !== nextLicensesJson) {
            await firebaseWrite(`lumo/store/workspaces/${wsId}`, ws).catch(() => false);
          }
        }
        await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
      })();

      if (!wsOk) {
        console.error('[license:claim] workspace write failed', { email, key, ownerId });
        send(res, 503, { ok: false, error: KEY_ERR });
        return;
      }

      send(res, 200, { ok: true, license: toClaimPayload(assigned) });
      return;
    }

    if (pathname === '/api/licenses/release' && req.method === 'POST') {
      const {
        dbList,
        findVaultEntry,
        findWorkspaceLicense,
        keysMatch,
        normalizeLicenseKey,
        releaseEntry,
        toClaimPayload,
      } = await import('./_lib/licenseClaim.mjs');
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const key = normalizeLicenseKey(String(body.key || ''));
      if (!email || !key) {
        send(res, 400, { error: 'key and email required' });
        return;
      }

      const vault = dbList(await firebaseRead('lumo/vault'));
      const workspacesRaw = await firebaseRead('lumo/store/workspaces');
      const workspaces =
        workspacesRaw && typeof workspacesRaw === 'object' ? workspacesRaw : {};

      let entry = findVaultEntry(vault, key);
      let ownerId = entry?.ownerAdminId || null;
      if (!entry) {
        const wsHit = findWorkspaceLicense(workspaces, key);
        if (wsHit) {
          entry = wsHit.license;
          ownerId = wsHit.ownerId;
        }
      }

      if (!entry) {
        send(res, 404, { error: 'License not found.' });
        return;
      }

      const released = releaseEntry(entry, email);
      if (!released.ok) {
        send(res, 403, { error: released.error || 'Release failed' });
        return;
      }

      const nextEntry = released.entry;
      const nextVault = [...vault];
      const vaultIdx = nextVault.findIndex(
        (v) => v?.id === nextEntry.id || keysMatch(String(v?.key || ''), key),
      );
      if (vaultIdx >= 0) nextVault[vaultIdx] = { ...nextVault[vaultIdx], ...nextEntry };
      else nextVault.unshift(nextEntry);
      await firebaseWrite('lumo/vault', nextVault);

      if (ownerId) {
        const ws =
          (await firebaseRead(`lumo/store/workspaces/${ownerId}`)) ||
          workspaces[ownerId] ||
          null;
        if (!ws) {
          send(res, 503, { error: 'Workspace unavailable.' });
          return;
        }
        const licenses = dbList(ws.licenses);
        const licenseRow = {
          ...nextEntry,
          clientEmail: nextEntry.email || nextEntry.clientEmail || email,
        };
        const nextLicenses = licenses.some(
          (l) => l?.id === nextEntry.id || keysMatch(String(l?.key || ''), key),
        )
          ? licenses.map((l) =>
              l?.id === nextEntry.id || keysMatch(String(l?.key || ''), key)
                ? { ...l, ...licenseRow }
                : l,
            )
          : [licenseRow, ...licenses];
        const mergedOwnerWs = mergeWorkspaces(
          { [ownerId]: ws },
          { [ownerId]: { licenses: nextLicenses } },
        )[ownerId];
        await firebaseWrite(`lumo/store/workspaces/${ownerId}`, mergedOwnerWs);
      }

      // Reset payment so client must pay again — keep admin approval when present
      const releasedAt = new Date().toISOString();
      const freshClients = dbList(await firebaseRead('lumo/clients'));
      const clientIdx = freshClients.findIndex(
        (c) => String(c?.email || '').toLowerCase() === email,
      );
      if (clientIdx >= 0) {
        const prev = freshClients[clientIdx];
        freshClients[clientIdx] = {
          ...prev,
          paymentClaimed: false,
          paymentClaimedAt: undefined,
          licenseReleasedAt: releasedAt,
        };
      }

      const wsMirror = { store: { workspaces: { ...workspaces } } };
      if (clientIdx >= 0) {
        mirrorClientToSuper(wsMirror, freshClients[clientIdx]);
      }
      const sid = 'LM-004821';
      const superWs = wsMirror.store.workspaces[sid];

      await Promise.all([
        firebaseWrite('lumo/clients', freshClients),
        superWs
          ? firebaseWrite(`lumo/store/workspaces/${sid}`, superWs)
          : Promise.resolve(true),
      ]);

      const sessions = (await firebaseRead('lumo/sessions')) || {};
      if (sessions[email]) {
        const prev = sessions[email];
        const prevBot = prev?.bot && typeof prev.bot === 'object' ? prev.bot : {};
        sessions[email] = {
          ...prev,
          accessStatus: 'pending',
          requiresRepayment: true,
          bot: {
            ...prevBot,
            licenseKey: '',
            status: 'paused',
            imageUrl: '',
          },
        };
        await firebaseWrite('lumo/sessions', sessions);
      }

      await firebaseWrite('lumo/updatedAt', new Date().toISOString());
      send(res, 200, { ok: true, license: toClaimPayload(nextEntry) });
      return;
    }

    if (pathname === '/api/licenses/publish' && req.method === 'POST') {
      const body = await readBody(req);
      const adminId = String(body.adminId || '').trim();
      const vaultEntries = Array.isArray(body.vaultEntries)
        ? body.vaultEntries
        : body.vaultEntry
          ? [body.vaultEntry]
          : body.license
            ? [body.license]
            : [];
      const workspace = body.workspace;
      if (!adminId || !vaultEntries.length || !vaultEntries[0]?.key) {
        send(res, 400, { ok: false, error: 'adminId and license key required' });
        return;
      }
      const result = await publishLicensesToFirebase(
        adminId,
        vaultEntries,
        workspace,
        body.revokedKeys,
      );
      if (!result.ok) {
        send(res, 502, { ok: false, error: result.error || 'Could not save license to cloud database' });
        return;
      }
      // Auto-email license keys to client emails (Resend — server only)
      try {
        const { notifyLicenseKey } = await import('./_lib/email/index.mjs');
        for (const entry of vaultEntries) {
          queueEmail(
            notifyLicenseKey(emailCtx(), {
              ...entry,
              email: entry.email || entry.clientEmail,
              key: entry.key,
              clientName: entry.clientName || entry.name,
              eaName: entry.eaName,
            }),
          );
        }
      } catch (err) {
        console.warn('[email] license notify setup failed', err);
      }
      send(res, 200, { ok: true, key: result.key || vaultEntries[0].key });
      return;
    }

    if (pathname === '/api/db' && req.method === 'GET') {
      const { db } = await loadDb();
      const mergedClients = await loadMergedClients();
      const { publicDbSnapshot } = await import('./_lib/clientMerge.mjs');
      send(res, 200, publicDbSnapshot({ ...db, clients: mergedClients }));
      return;
    }

    if (pathname === '/api/db' && req.method === 'PUT') {
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      // Merge only — never replace whole lists with empties from a partial client sync
      const saved = await saveDb(mergeDatabases(db, body), sha);
      const { publicDbSnapshot } = await import('./_lib/clientMerge.mjs');
      send(res, 200, publicDbSnapshot(saved.db));
      return;
    }

    if (pathname === '/api/auth/admins' && req.method === 'GET') {
      const curAuth = await firebaseRead('lumo/auth');
      const fbAdmins = toArray(curAuth?.admins);
      const { db } = await loadDb();
      const localAdmins = toArray(db.auth?.admins);
      const { mergeAdminsLive, publicAdminList } = await import('./_lib/clientMerge.mjs');
      // Roster only — never leak mentor passwords to the browser
      send(res, 200, publicAdminList(mergeAdminsLive(fbAdmins, localAdmins)));
      return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const { verifyMentorLogin } = await import('./_lib/clientMerge.mjs');
      const result = await verifyMentorLogin(body.email, body.password);
      if (!result.ok) {
        const status = result.error === 'pending' ? 403 : 401;
        send(res, status, {
          ok: false,
          error: result.error || 'invalid_credentials',
          admin: result.admin || null,
        });
        return;
      }
      send(res, 200, { ok: true, admin: result.admin });
      return;
    }

    if (pathname === '/api/auth/admins/repair-sync' && req.method === 'POST') {
      const curAuth = await firebaseRead('lumo/auth');
      const fbAdmins = toArray(curAuth?.admins);
      const { db, sha } = await loadDb();
      const localAdmins = toArray(db.auth?.admins);
      const { mergeAdminsLive, normalizeAdminRole } = await import('./_lib/clientMerge.mjs');
      const merged = mergeAdminsLive(fbAdmins, localAdmins);
      db.auth = db.auth || { admins: [], admin: null };
      db.auth.admins = merged;
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase still holds the live mentor queue even if GitHub write fails
      }
      send(res, 200, {
        ok: true,
        total: merged.length,
        pending: merged.filter((a) => normalizeAdminRole(a?.role) === 'pending').length,
        approved: merged.filter((a) => normalizeAdminRole(a?.role) === 'admin').length,
      });
      return;
    }

    if (pathname.startsWith('/api/auth/admins/') && req.method === 'PATCH') {
      const id = decodeURIComponent(pathname.replace('/api/auth/admins/', ''));
      const body = await readBody(req);
      const role = body.role === 'admin' ? 'admin' : body.role === 'pending' ? 'pending' : null;
      if (!role || !id) {
        send(res, 400, { error: 'id and role (admin|pending) required' });
        return;
      }
      const { db, sha } = await loadDb();
      db.auth = db.auth || { admins: [], admin: null };
      db.auth.admins = toArray(db.auth.admins).map((a) => {
        const match =
          a.id === id || String(a.email || '').toLowerCase() === id.toLowerCase();
        if (!match) return a;
        return { ...a, role: adminRoleRank(a.role) >= adminRoleRank(role) ? a.role : role };
      });
      const updated =
        toArray(db.auth.admins).find(
          (a) =>
            a.id === id || String(a.email || '').toLowerCase() === id.toLowerCase(),
        ) || null;
      let fallback = updated;
      if (!fallback) {
        const fbAuth = await firebaseRead('lumo/auth');
        fallback =
          toArray(fbAuth?.admins).find(
            (a) =>
              a.id === id || String(a.email || '').toLowerCase() === id.toLowerCase(),
          ) || null;
      }
      if (!fallback && body.fallback && typeof body.fallback === 'object') {
        fallback = body.fallback;
      }
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase remains source of truth for live mentor approvals
      }
      const {
        firebasePatchAdminRole,
      } = await import('./_lib/clientMerge.mjs');
      // Capture prior role so we only email on pending → admin
      const beforeList = toArray((await firebaseRead('lumo/auth'))?.admins);
      const before = beforeList.find(
        (a) =>
          a?.id === id ||
          String(a?.email || '').toLowerCase() === String(id || '').toLowerCase(),
      );
      const priorRole = String(before?.role || '').toLowerCase();
      const fbUpdated = await firebasePatchAdminRole(id, role, fallback);
      if (!fbUpdated) {
        send(res, 502, { ok: false, error: 'approve_failed' });
        return;
      }
      const nextRole = String(role || fbUpdated.role || '').toLowerCase();
      if (priorRole === 'pending' && nextRole === 'admin') {
        try {
          const { notifyMentorApproved } = await import('./_lib/email/index.mjs');
          queueEmail(notifyMentorApproved(emailCtx(), fbUpdated));
        } catch (err) {
          console.warn('[email] mentor approved notify setup failed', err);
        }
      }
      const { publicAdminRecord } = await import('./_lib/clientMerge.mjs');
      send(res, 200, { ok: true, admin: publicAdminRecord(fbUpdated) });
      return;
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const { isRegistrationEmail, normalizeRegistrationEmail } = await import(
        './_lib/registrationEmail.mjs'
      );
      const email = normalizeRegistrationEmail(body.email);
      const fullName = String(body.fullName || '').trim();
      const password = String(body.password || '');
      if (!isRegistrationEmail(email) || !password || !fullName) {
        send(res, 400, { error: 'email, password, fullName required' });
        return;
      }
      if (email === 'mukundimukhuba8@gmail.com') {
        send(res, 403, { error: 'This email is reserved for Super Admin.' });
        return;
      }
      const { publicAdminRecord } = await import('./_lib/clientMerge.mjs');
      const fbAdmins = toArray((await firebaseRead('lumo/auth'))?.admins);
      const existingFb = fbAdmins.find((a) => String(a.email || '').toLowerCase() === email);
      if (existingFb) {
        send(res, 200, publicAdminRecord(existingFb));
        return;
      }
      const { db, sha } = await loadDb();
      const admins = toArray(db.auth?.admins);
      const existing = admins.find((a) => String(a.email || '').toLowerCase() === email);
      if (existing) {
        send(res, 200, publicAdminRecord(existing));
        return;
      }
      const entry = {
        id: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
        email,
        fullName,
        password,
        role: 'pending',
        mentorName: String(body.mentorName || '').trim(),
        eaName: String(body.eaName || '').trim(),
        phone: String(body.phone || '').trim(),
        mainText: String(body.mainText || '').trim(),
      };
      const nameParts = fullName.split(/\s+/).filter(Boolean);
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
      const savedToFirebase = await firebaseRegisterMentor(entry, workspace);
      if (!savedToFirebase) {
        send(res, 503, { error: 'Could not save registration to cloud database' });
        return;
      }
      db.auth = db.auth || { admins: [], admin: null };
      db.auth.admins = mergeAdmins(admins, [entry]);
      db.store = db.store || { workspaces: {} };
      db.store.workspaces = db.store.workspaces || {};
      db.store.workspaces[entry.id] = workspace;
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase is the source of truth for live mentor registrations
      }
      try {
        const { notifyMentorReceived } = await import('./_lib/email/index.mjs');
        queueEmail(notifyMentorReceived(emailCtx(), entry));
      } catch (err) {
        console.warn('[email] mentor received notify setup failed', err);
      }
      send(res, 201, publicAdminRecord(entry));
      return;
    }

    if (pathname === '/api/clients/repair-sync' && req.method === 'POST') {
      const merged = await loadMergedClients();
      const { db, sha } = await loadDb();
      db.clients = merged;
      for (const entry of merged) {
        if (entry?.email) mirrorClientToSuper(db, entry);
      }
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase still holds the live queue even if GitHub write fails
      }
      send(res, 200, {
        ok: true,
        total: merged.length,
        pending: merged.filter((c) => c?.status === 'pending').length,
        approved: merged.filter((c) => c?.status === 'approved').length,
      });
      return;
    }

    if (pathname === '/api/workspaces/repair-eas' && req.method === 'POST') {
      const { repairAllWorkspaces } = await import('./_lib/repairEas.mjs');
      const [rawWorkspaces, rawVault] = await Promise.all([
        firebaseRead('lumo/store/workspaces'),
        firebaseRead('lumo/vault'),
      ]);
      const workspacesObj =
        rawWorkspaces && typeof rawWorkspaces === 'object' ? rawWorkspaces : {};
      const vault = toArray(rawVault);
      const { workspaces, totalRestored, totalRestoredEas, totalRestoredLicenses, workspacesTouched } =
        repairAllWorkspaces(workspacesObj, vault);
      let easCount = 0;
      for (const ws of Object.values(workspaces)) {
        easCount += toArray(ws?.eas).length;
      }
      for (const [id, ws] of Object.entries(workspaces)) {
        await firebaseWrite(`lumo/store/workspaces/${id}`, ws);
      }
      await firebaseWrite('lumo/updatedAt', new Date().toISOString()).catch(() => false);
      try {
        const { db, sha } = await loadDb();
        const merged = mergeDatabases(db, { store: { workspaces } });
        await saveDb(merged, sha);
      } catch {
        // Firebase is source of truth — GitHub mirror is best-effort
      }
      send(res, 200, {
        ok: true,
        totalRestored,
        totalRestoredEas,
        totalRestoredLicenses,
        workspacesTouched,
        easCount,
      });
      return;
    }

    if (pathname === '/api/clients' && req.method === 'GET') {
      const merged = await loadMergedClients();
      send(res, 200, merged);
      return;
    }

    if (pathname === '/api/clients' && req.method === 'POST') {
      const body = await readBody(req);
      const { isRegistrationEmail, normalizeRegistrationEmail } = await import(
        './_lib/registrationEmail.mjs'
      );
      const email = normalizeRegistrationEmail(body.email);
      if (!isRegistrationEmail(email)) {
        send(res, 400, { error: 'valid email required' });
        return;
      }
      const {
        firebasePostClientEntry,
        firebasePatchClientById,
      } = await import('./_lib/clientMerge.mjs');
      let created = await firebasePostClientEntry({
        email,
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        status: body.status || 'pending',
        paymentClaimed: body.paymentClaimed,
        paymentClaimedAt: body.paymentClaimedAt,
      });
      if (body.status === 'approved' || body.paymentClaimed) {
        created =
          (await firebasePatchClientById(email, {
            status: 'approved',
            paymentClaimed: true,
            paymentClaimedAt: body.paymentClaimedAt || new Date().toISOString(),
          })) || created;
      }
      if (!created) {
        send(res, 503, { error: 'Could not save client to Firebase' });
        return;
      }
      const { db, sha } = await loadDb();
      db.clients = mergeClients(toArray(db.clients), [created]);
      mirrorClientToSuper(db, created);
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase is the live source of truth
      }
      send(res, 201, created);
      return;
    }

    if (pathname.startsWith('/api/clients/') && req.method === 'PATCH') {
      const id = decodeURIComponent(pathname.replace('/api/clients/', ''));
      const body = await readBody(req);
      const { firebasePatchClientById } = await import('./_lib/clientMerge.mjs');
      // Live registrations often exist only in Firebase — patch Firebase first.
      const fbUpdated = await firebasePatchClientById(id, body);
      if (!fbUpdated) {
        send(res, 404, {
          error: 'Client not found in Firebase',
          id,
          table: 'lumo/clients',
        });
        return;
      }
      const { db, sha } = await loadDb();
      db.clients = mergeClients(toArray(db.clients), [fbUpdated]);
      mirrorClientToSuper(db, fbUpdated);
      try {
        await saveDb(db, sha);
      } catch {
        // Firebase write already succeeded
      }
      send(res, 200, fbUpdated);
      return;
    }

    if (pathname.startsWith('/api/clients/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/clients/', ''));
      const { db, sha } = await loadDb();
      const before = (db.clients || []).length;
      db.clients = (db.clients || []).filter((c) => c.id !== id && c.email !== id);
      const sid = 'LM-004821';
      const ws = db.store?.workspaces?.[sid];
      if (ws) {
        ws.clientRequests = (ws.clientRequests || []).filter(
          (c) => c.id !== id && c.email !== id,
        );
      }
      await saveDb(db, sha);
      send(res, 200, { ok: true, removed: before - (db.clients || []).length });
      return;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'GET') {
      const email = decodeURIComponent(pathname.replace('/api/sessions/', '')).toLowerCase();
      const { db } = await loadDb();
      send(res, 200, db.sessions?.[email] ?? null);
      return;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'PUT') {
      const email = decodeURIComponent(pathname.replace('/api/sessions/', '')).toLowerCase();
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      const prev = db.sessions?.[email];
      db.sessions = {
        ...(db.sessions || {}),
        [email]: mergeSessionPreferLicense(prev, body),
      };
      await saveDb(db, sha);
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/vault' && req.method === 'GET') {
      const { db } = await loadDb();
      send(res, 200, db.vault || []);
      return;
    }

    if (pathname === '/api/vault' && req.method === 'PUT') {
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      db.vault = Array.isArray(body) ? body : body.vault || db.vault;
      await saveDb(db, sha);
      send(res, 200, db.vault);
      return;
    }

    if (pathname.startsWith('/api/images/') && req.method === 'PUT') {
      const key = decodeURIComponent(pathname.replace('/api/images/', '')).trim();
      if (!key) {
        send(res, 400, { error: 'image key required' });
        return;
      }
      const body = await readBody(req);
      const dataUrl = String(body.dataUrl || '');
      if (!dataUrl.startsWith('data:')) {
        send(res, 400, { error: 'dataUrl required' });
        return;
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        send(res, 413, { error: 'File too large for cloud upload (max ~6 MB image)' });
        return;
      }
      const { db, sha } = await loadDb();
      db.images = { ...(db.images || {}), [key]: dataUrl };
      await saveDb(db, sha);
      send(res, 200, { ok: true, url: `/api/images/${encodeURIComponent(key)}` });
      return;
    }

    if (pathname.startsWith('/api/images/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const key = decodeURIComponent(pathname.replace('/api/images/', '')).trim();
      const { db } = await loadDb();
      let dataUrl = db.images?.[key];
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        const fromFirebase = await firebaseRead(`lumo/images/${key}`);
        if (typeof fromFirebase === 'string' && fromFirebase.startsWith('data:')) {
          dataUrl = fromFirebase;
        }
      }
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        send(res, 404, { error: 'Image not found' });
        return;
      }
      const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl));
      if (!m) {
        send(res, 404, { error: 'Invalid image' });
        return;
      }
      const buf = Buffer.from(m[2], 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', m[1] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(buf.length));
        res.end();
        return;
      }
      res.end(buf);
      return;
    }

    // Mentor media aliases → same durable images store (fixes Vercel "Not found")
    if (pathname === '/api/media' && req.method === 'POST') {
      const body = await readBody(req);
      const key = String(body.key || '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120);
      const dataUrl = String(body.dataUrl || '');
      if (!key || !dataUrl.startsWith('data:')) {
        send(res, 400, { error: 'key and dataUrl required' });
        return;
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        send(res, 413, { error: 'File too large for cloud upload (max ~6 MB image)' });
        return;
      }
      const { db, sha } = await loadDb();
      db.images = { ...(db.images || {}), [key]: dataUrl };
      await saveDb(db, sha);
      send(res, 200, { ok: true, url: `/api/images/${encodeURIComponent(key)}`, key });
      return;
    }

    if (pathname === '/api/media/binary' && req.method === 'POST') {
      send(res, 501, {
        error: 'Binary media upload is not available on this host. Use a compressed image under 2.5 MB.',
      });
      return;
    }

    if (pathname.startsWith('/api/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const raw = decodeURIComponent(pathname.replace('/api/media/', '')).trim();
      const key = raw.replace(/\.[a-z0-9]+$/i, '');
      const { db } = await loadDb();
      const dataUrl = db.images?.[key] || db.images?.[raw];
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        send(res, 404, { error: 'Media not found' });
        return;
      }
      const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl));
      if (!m) {
        send(res, 404, { error: 'Invalid media' });
        return;
      }
      const buf = Buffer.from(m[2], 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', m[1] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(buf.length));
        res.end();
        return;
      }
      res.end(buf);
      return;
    }

    if (pathname.startsWith('/api/media/') && req.method === 'DELETE') {
      const key = decodeURIComponent(pathname.replace('/api/media/', '')).trim();
      const { db, sha } = await loadDb();
      if (db.images?.[key]) {
        const next = { ...(db.images || {}) };
        delete next[key];
        db.images = next;
        await saveDb(db, sha);
      }
      send(res, 200, { ok: true });
      return;
    }

    // Chart Scanner — OpenAI vision (same behavior as local server.mjs)
    if (pathname === '/api/scan' && req.method === 'POST') {
      const body = await readBody(req);
      const image = String(body.image || '');
      if (!image.startsWith('data:image/')) {
        send(res, 400, { ok: false, accuracy: 0, error: 'image data URL required' });
        return;
      }

      const scanCfg = await resolveChartScanConfig();
      const CHART_SCAN_API_KEY = scanCfg.apiKey;
      const CHART_SCAN_API_URL = scanCfg.apiUrl;
      const CHART_SCAN_MODEL = scanCfg.model;

      if (!CHART_SCAN_API_KEY) {
        send(res, 503, {
          ok: false,
          accuracy: 0,
          error: 'Scanner unavailable. Please try again later.',
        });
        return;
      }

      const {
        CHART_SCAN_PROMPT,
        normalizeScanAccuracy,
        resolveScanDirection,
        validateScanPrices,
      } = await import('./_lib/chartScanParse.mjs');

      const upstream = await fetch(CHART_SCAN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHART_SCAN_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHART_SCAN_MODEL,
          temperature: 0.15,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: CHART_SCAN_PROMPT },
                { type: 'image_url', image_url: { url: image, detail: 'high' } },
              ],
            },
          ],
        }),
      });

      const raw = await upstream.text();
      if (!upstream.ok) {
        send(res, 502, {
          ok: false,
          accuracy: 0,
          error: `Scan API ${upstream.status}: ${raw.slice(0, 240)}`,
        });
        return;
      }

      let parsed = {};
      try {
        const outer = JSON.parse(raw);
        const content =
          outer?.choices?.[0]?.message?.content ||
          outer?.output_text ||
          outer?.content ||
          '';
        const match =
          String(content).match(/\{[\s\S]*\}/) ||
          String(raw).match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      } catch {
        parsed = {};
      }

      const symbolVisible = parsed.symbol_visible !== false;
      let symbol = parsed.symbol == null ? '' : String(parsed.symbol).trim();
      if (
        !symbolVisible ||
        !symbol ||
        /null|unknown|n\/a|none|guess/i.test(symbol)
      ) {
        send(res, 422, {
          ok: false,
          accuracy: 0,
          error:
            'Could not read the symbol from this chart. Upload a clearer MT5 screenshot showing the pair name.',
        });
        return;
      }
      symbol = symbol.replace(/\s+/g, '').toUpperCase();

      let accuracy = normalizeScanAccuracy(parsed, image);
      const directionResult = resolveScanDirection(parsed, accuracy, image);
      if (!directionResult.ok) {
        send(res, 422, {
          ok: false,
          accuracy: 0,
          error: directionResult.error,
        });
        return;
      }

      const { direction, corrected, correctionReason } = directionResult;
      accuracy = directionResult.accuracy;
      if (accuracy < 65) {
        send(res, 422, {
          ok: false,
          accuracy,
          error: `Low confidence (${accuracy}%). Chart setup unclear — no trade signal. Upload a clearer chart or wait for a stronger setup.`,
        });
        return;
      }

      const timeframeRaw = parsed.timeframe == null ? '' : String(parsed.timeframe).trim();
      const timeframe =
        !timeframeRaw || /null|unknown|n\/a|none/i.test(timeframeRaw)
          ? undefined
          : timeframeRaw;

      const entryPrice = Number(parsed.entry_price);
      const stopLoss = Number(parsed.stop_loss);
      const priceCheck = validateScanPrices(direction, entryPrice, stopLoss);

      let summary = parsed.summary || `Scan for ${symbol}`;
      if (corrected && correctionReason) {
        summary = `${summary} (direction aligned to ${correctionReason})`;
      }

      send(res, 200, {
        ok: true,
        demo: false,
        accuracy: Math.round(accuracy),
        symbol,
        timeframe,
        direction,
        entryPrice: priceCheck.pricesValid ? priceCheck.entryPrice : undefined,
        stopLoss: priceCheck.pricesValid ? priceCheck.stopLoss : undefined,
        summary,
      });
      return;
    }

    if (pathname === '/api/scan/status' && req.method === 'GET') {
      const scanCfg = await resolveChartScanConfig();
      const configured = Boolean(scanCfg.apiKey);
      send(res, 200, {
        configured,
        model: scanCfg.model,
        url: scanCfg.apiUrl,
        source: scanCfg.source,
        mt5Base: Boolean(process.env.MT5_API_BASE),
        hint: configured
          ? 'Live AI scans enabled'
          : 'Scanner unavailable',
      });
      return;
    }

    if (pathname === '/api/email/send' && req.method === 'POST') {
      const body = await readBody(req);
      const adminEmail = String(body?.adminEmail || '').trim().toLowerCase();
      const adminPassword = String(body?.adminPassword || '');
      const SUPER_EMAIL = 'mukundimukhuba8@gmail.com';
      const SUPER_SHA =
        '18026064be7ec28f428f49e9c93cc0c1f86d3883f11189805f592298467663c9';
      const { createHash } = await import('node:crypto');
      const passHash = createHash('sha256').update(adminPassword).digest('hex');
      let allowed = adminEmail === SUPER_EMAIL && passHash === SUPER_SHA;
      if (!allowed && adminEmail && adminPassword) {
        const { verifyMentorLogin } = await import('./_lib/clientMerge.mjs');
        const login = await verifyMentorLogin(adminEmail, adminPassword);
        allowed =
          Boolean(login?.ok) &&
          String(login?.admin?.role || '').toLowerCase() === 'super';
      }
      if (!allowed) {
        send(res, 403, { ok: false, error: 'Super Admin only' });
        return;
      }
      const recipients = Array.isArray(body?.to)
        ? body.to
        : String(body?.to || '')
            .split(/[,;\s]+/)
            .filter(Boolean);
      const subject = String(body?.subject || '').trim();
      const message = String(body?.message || body?.text || '').trim();
      const html = body?.html ? String(body.html) : '';
      if (!recipients.length || !subject || (!message && !html)) {
        send(res, 400, { ok: false, error: 'to, subject, and message required' });
        return;
      }
      const { notifyAdminManual, isValidEmail } = await import('./_lib/email/index.mjs');
      const results = [];
      for (const raw of recipients) {
        const to = isValidEmail(raw);
        if (!to) {
          results.push({ to: raw, ok: false, error: 'invalid email' });
          continue;
        }
        const r = await notifyAdminManual(emailCtx(), {
          to,
          subject,
          text: message,
          html,
        });
        results.push({ to, ok: Boolean(r.ok), error: r.error || '', id: r.id || '' });
      }
      const sent = results.filter((r) => r.ok).length;
      send(res, 200, {
        ok: sent > 0,
        sent,
        failed: results.length - sent,
        results,
      });
      return;
    }

    if (pathname === '/api/telegram/config' && req.method === 'POST') {
      const body = await readBody(req);
      const mentorId = String(body?.mentorId || '').trim();
      let botToken = String(body?.botToken || '').trim();
      const chatId = String(body?.chatId || '').trim();
      const enabledRaw = body?.enabled;
      const hasEnabled = typeof enabledRaw === 'boolean';
      const enabled = hasEnabled ? Boolean(enabledRaw) : true;
      const fromUrl = botToken.match(
        /(?:https?:\/\/)?api\.telegram\.org\/bot([0-9]+:[A-Za-z0-9_-]+)/i,
      );
      if (fromUrl?.[1]) botToken = fromUrl[1].trim();
      botToken = botToken.replace(/^bot/i, '').trim().split('/')[0] || botToken;

      // Toggle-only: flip on/off without re-pasting token
      if (mentorId && hasEnabled && !botToken && !chatId) {
        const secret = (await firebaseRead('lumo/secrets/telegramAlerts')) || {};
        const existingTok = String(secret.botToken || secret.telegramBotToken || '').trim();
        const existingChat = String(secret.chatId || secret.telegramChatId || '').trim();
        if (!existingTok || !existingChat) {
          send(res, 400, {
            ok: false,
            error: 'Save bot token and chat ID first, then use On/Off.',
          });
          return;
        }
        const updatedAt = new Date().toISOString();
        const secretOk = await firebaseWrite('lumo/secrets/telegramAlerts', {
          ...secret,
          mentorId: String(secret.mentorId || mentorId).trim() || mentorId,
          botToken: existingTok,
          chatId: existingChat,
          enabled,
          updatedAt,
        });
        await firebasePatch(`lumo/store/workspaces/${mentorId}/profile`, {
          telegramAlertsEnabled: enabled,
        });
        await firebaseWrite('lumo/updatedAt', updatedAt).catch(() => false);
        if (!secretOk) {
          send(res, 502, { ok: false, error: 'Could not update Telegram On/Off' });
          return;
        }
        send(res, 200, { ok: true, enabled, updatedAt });
        return;
      }

      if (!mentorId || !botToken || !chatId) {
        send(res, 400, { ok: false, error: 'mentorId, botToken, and chatId required' });
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        send(res, 400, {
          ok: false,
          error: 'Bot token looks wrong. Paste only the BotFather token.',
        });
        return;
      }
      const updatedAt = new Date().toISOString();
      const secretOk = await firebaseWrite('lumo/secrets/telegramAlerts', {
        mentorId,
        botToken,
        chatId,
        enabled,
        updatedAt,
      });
      const profileOk = await firebasePatch(`lumo/store/workspaces/${mentorId}/profile`, {
        telegramBotToken: botToken,
        telegramChatId: chatId,
        telegramAlertsEnabled: enabled,
      });
      await firebaseWrite('lumo/updatedAt', updatedAt).catch(() => false);
      if (!secretOk) {
        send(res, 502, { ok: false, error: 'Could not save Telegram settings to cloud' });
        return;
      }
      send(res, 200, { ok: true, enabled, profileSynced: profileOk, updatedAt });
      return;
    }

    if (pathname === '/api/telegram/notify' && req.method === 'POST') {
      const body = await readBody(req);
      const {
        isTelegramAlertLicenseKey,
        buildTelegramTradeMessage,
        sendTelegramMessage,
      } = await import('./_lib/telegramNotify.mjs');
      const isTest = Boolean(body?.test);
      const licenseKey = String(body?.licenseKey || '').trim();
      if (!isTest && body?.notify === false) {
        send(res, 200, { ok: false, skipped: true, error: 'telegram notify off' });
        return;
      }
      if (!isTest && !isTelegramAlertLicenseKey(licenseKey)) {
        send(res, 200, {
          ok: false,
          skipped: true,
          error: 'license not allowed for Telegram alerts',
        });
        return;
      }

      const normalizeTok = (raw) => {
        let v = String(raw || '').trim();
        const m = v.match(
          /(?:https?:\/\/)?api\.telegram\.org\/bot([0-9]+:[A-Za-z0-9_-]+)/i,
        );
        if (m?.[1]) return m[1].trim();
        v = v.replace(/^bot/i, '').trim().split('/')[0] || v;
        return v.trim();
      };

      let botToken = normalizeTok(body?.botToken);
      let chatId = String(body?.chatId || '').trim();
      let alertsEnabled = true;

      // Preferred durable store
      {
        const secret = (await firebaseRead('lumo/secrets/telegramAlerts')) || {};
        if (typeof secret.enabled === 'boolean') alertsEnabled = secret.enabled;
        if (!botToken || !chatId) {
          botToken = botToken || normalizeTok(secret.botToken || secret.telegramBotToken);
          chatId = chatId || String(secret.chatId || secret.telegramChatId || '').trim();
        }
      }

      if (!isTest && !alertsEnabled) {
        send(res, 200, {
          ok: false,
          skipped: true,
          error: 'Telegram alerts are turned Off',
        });
        return;
      }

      // Fallback: mentor / super workspace profile
      if (!botToken || !chatId) {
        const preferredId = String(body?.mentorId || '').trim();
        const auth = (await firebaseRead('lumo/auth')) || {};
        const admins = toArray(auth.admins);
        const orderedIds = [
          preferredId,
          ...admins
            .filter((a) => String(a?.role || '').toLowerCase() === 'super')
            .map((a) => String(a?.id || '').trim()),
          ...admins.map((a) => String(a?.id || '').trim()),
        ].filter(Boolean);
        const seen = new Set();
        for (const id of orderedIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          const ws = (await firebaseRead(`lumo/store/workspaces/${id}`)) || {};
          const profile = (ws && ws.profile) || {};
          const token = normalizeTok(
            profile.telegramBotToken || profile.telegramToken || '',
          );
          const chat = String(
            profile.telegramChatId || profile.telegramGroupId || '',
          ).trim();
          if (token && chat) {
            botToken = token;
            chatId = chat;
            break;
          }
        }
      }

      if (!botToken || !chatId) {
        send(res, 200, {
          ok: false,
          skipped: true,
          error: 'not configured',
        });
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        send(res, 400, {
          ok: false,
          error:
            'Bot token looks wrong. Paste only the token from BotFather (like 123456:AAH...), not a full URL.',
        });
        return;
      }
      const text = buildTelegramTradeMessage(body || {});
      try {
        const result = await sendTelegramMessage(botToken, chatId, text);
        send(res, result.ok ? 200 : 502, result);
      } catch (e) {
        send(res, 502, {
          ok: false,
          error: e instanceof Error ? e.message : 'Telegram send failed',
        });
      }
      return;
    }

    if (pathname.startsWith('/api/copy/')) {
      const {
        ackCopyOrder,
        formatPollText,
        pollCopyOrder,
        registerTerminal,
      } = await import('./_lib/copyPoll.mjs');

      if (pathname === '/api/copy/register' && req.method === 'POST') {
        const body = await readBody(req);
        const result = await registerTerminal(firebaseRead, firebaseWrite, body);
        send(res, result.ok ? 200 : 400, result);
        return;
      }

      if (pathname === '/api/copy/ack' && req.method === 'POST') {
        const body = await readBody(req);
        const result = await ackCopyOrder(firebaseRead, firebaseWrite, body);
        send(res, result.ok ? 200 : 400, result);
        return;
      }

      if (pathname === '/api/copy/poll' && req.method === 'GET') {
        const mentorId = String(url.searchParams.get('mentorId') || '').trim();
        const eaId = String(url.searchParams.get('eaId') || url.searchParams.get('copyEaId') || '').trim();
        const terminalId = String(url.searchParams.get('terminalId') || 'default').trim();
        const format = String(url.searchParams.get('format') || 'json').trim().toLowerCase();
        const result = await pollCopyOrder(firebaseRead, firebaseWrite, {
          mentorId,
          eaId,
          terminalId,
        });
        if (format === 'text') {
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(formatPollText(result));
          return;
        }
        send(res, result.ok ? 200 : 400, result);
        return;
      }
    }

    // Backend broker connect — resolves web terminal host from server name
    if (pathname === '/api/mt5/connect') {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Method not allowed' });
        return;
      }
      const { connectMt5Broker } = await import('./_lib/mt5Bridge.mjs');
      const body = await readBody(req);
      const result = await connectMt5Broker({
        user: body.user,
        password: body.password,
        server: body.server,
      });
      if (result.ok && result.token) {
        send(res, 200, { token: result.token });
      } else {
        send(res, 502, { error: result.error || 'Connect failed' });
      }
      return;
    }

    // Proxy → MT5API RESTFul swagger host (Search, ConnectEx, Account*, OrderSend)
    if (pathname.startsWith('/api/mt5')) {
      // Swagger UI: https://66.23.225.158/swagger/index.html — API root is the host only
      const MT5_HOST = (process.env.MT5_API_HOST || '66.23.225.158').trim();
      const envBase = String(process.env.MT5_API_BASE || '').replace(/\/$/, '');
      // Try env base first, then https and http on the swagger host
      const bases = [
        ...(envBase ? [envBase] : []),
        `http://${MT5_HOST}`,
        `https://${MT5_HOST}`,
      ].filter((b, i, arr) => arr.indexOf(b) === i);

      const override = String(url.searchParams.get('_mt5') || '').trim();
      const targetPath = override
        ? override.startsWith('/')
          ? override
          : `/${override}`
        : pathname === '/api/mt5'
          ? '/'
          : pathname.slice('/api/mt5'.length);
      const forwardSearch = new URLSearchParams(url.searchParams);
      forwardSearch.delete('_mt5');
      const qs = forwardSearch.toString();
      const method = req.method || 'GET';
      const body =
        method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);
      const headers = {
        Accept: req.headers.accept || 'application/json, text/plain, */*',
      };
      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
      }

      let lastErr = 'MT5 bridge unreachable';
      for (const base of bases) {
        const targetUrl = `${base}${targetPath}${qs ? `?${qs}` : ''}`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 9000);
        try {
          const upstream = await fetch(targetUrl, {
            method,
            headers,
            body,
            signal: ac.signal,
          });
          clearTimeout(timer);
          const buf = Buffer.from(await upstream.arrayBuffer());
          const ct = upstream.headers.get('content-type') || 'application/json';
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', ct);
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end(buf);
          return;
        } catch (err) {
          clearTimeout(timer);
          lastErr =
            err instanceof Error
              ? `MT5 bridge unreachable via ${base}: ${err.message}`
              : `MT5 bridge unreachable via ${base}`;
        }
      }
      send(res, 502, { error: lastErr });
      return;
    }

    send(res, 404, { error: 'Not found', path: pathname });
  } catch (err) {
    send(res, 500, {
      error: err instanceof Error ? err.message : 'API error',
      durable: Boolean(token()),
    });
  }
}
