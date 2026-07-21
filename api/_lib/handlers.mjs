import { emptyDb, hasDurableBackend, loadDb, saveDb } from './store.mjs';
import {
  adminRoleRank,
  firebasePatchAdminRole,
  firebasePatchClientById,
  firebasePostClientEntry,
  loadMergedClients,
  mergeClients,
} from './clientMerge.mjs';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

/** Base64 data URLs for mentor media — ~6 MB decoded image budget */
const MAX_DATA_URL_CHARS = 8_000_000;

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

/** Never let a stale pending push wipe a saved license key. */
function mergeSessionPreferLicense(prev, incoming) {
  if (!incoming || typeof incoming !== 'object') return prev || incoming;
  if (!prev || typeof prev !== 'object') return incoming;
  const prevBot = prev.bot && typeof prev.bot === 'object' ? prev.bot : {};
  const nextBot = incoming.bot && typeof incoming.bot === 'object' ? incoming.bot : {};
  const incomingKey = String(nextBot.licenseKey || '').trim();
  const prevKey = String(prevBot.licenseKey || '').trim();
  // deleteBot sends paid + empty key — allow that clear. Block other demotions.
  const intentionalClear =
    nextBot.licenseKey !== undefined &&
    !incomingKey &&
    (incoming.accessStatus === 'paid' || incoming.accessStatus === 'pending');
  const licenseKey = intentionalClear ? '' : incomingKey || prevKey;
  const accessStatus = licenseKey
    ? 'licensed'
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
  const rest = (ws.clientRequests || []).filter((c) => c.id !== entry.id && c.email !== entry.email);
  ws.clientRequests = [entry, ...rest];
  db.store.workspaces[sid] = ws;
}

/** Shared API router used by Vercel serverless + local server.mjs */
export async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return true;
  }

  try {
    if (pathname === '/api/health') {
      const { db, backend } = await loadDb();
      json(res, 200, {
        ok: true,
        durable: hasDurableBackend(),
        backend,
        updatedAt: db.updatedAt || new Date().toISOString(),
      });
      return true;
    }

    if (pathname === '/api/db' && req.method === 'GET') {
      const { db } = await loadDb();
      const mergedClients = await loadMergedClients(loadDb);
      json(res, 200, { ...db, clients: mergedClients });
      return true;
    }

    if (pathname === '/api/db' && req.method === 'PUT') {
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      const next = {
        ...db,
        ...body,
        auth: { ...db.auth, ...(body.auth || {}) },
        store: {
          workspaces: {
            ...(db.store?.workspaces || {}),
            ...(body.store?.workspaces || {}),
          },
        },
        vault: Array.isArray(body.vault) ? body.vault : db.vault,
        images: { ...db.images, ...(body.images || {}) },
        clients: Array.isArray(body.clients) ? body.clients : db.clients,
        sessions: { ...db.sessions, ...(body.sessions || {}) },
        revokedKeys: Array.isArray(body.revokedKeys)
          ? [...new Set([...(db.revokedKeys || []), ...body.revokedKeys])]
          : db.revokedKeys || [],
      };
      const saved = await saveDb(next, sha);
      json(res, 200, saved.db);
      return true;
    }

    if (pathname === '/api/clients' && req.method === 'GET') {
      const merged = await loadMergedClients(loadDb);
      json(res, 200, merged);
      return true;
    }

    if (pathname === '/api/clients' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      if (!email || !body.firstName || !body.lastName) {
        json(res, 400, { error: 'email, firstName, lastName required' });
        return true;
      }
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
        json(res, 503, { error: 'Could not save client to Firebase' });
        return true;
      }
      const { db, sha } = await loadDb();
      db.clients = mergeClients(db.clients || [], [created]);
      mirrorClientToSuper(db, created);
      await saveDb(db, sha);
      json(res, 201, created);
      return true;
    }

    if (pathname.startsWith('/api/clients/') && req.method === 'PATCH') {
      const id = decodeURIComponent(pathname.replace('/api/clients/', ''));
      const body = await readBody(req);
      const fbUpdated = await firebasePatchClientById(id, body);
      if (!fbUpdated) {
        json(res, 404, { error: 'Client not found in Firebase', id, table: 'lumo/clients' });
        return true;
      }
      const { db, sha } = await loadDb();
      db.clients = mergeClients(db.clients || [], [fbUpdated]);
      mirrorClientToSuper(db, fbUpdated);
      await saveDb(db, sha);
      json(res, 200, fbUpdated);
      return true;
    }

    if (pathname.startsWith('/api/auth/admins/') && req.method === 'PATCH') {
      const id = decodeURIComponent(pathname.replace('/api/auth/admins/', ''));
      const body = await readBody(req);
      const role = body.role === 'admin' ? 'admin' : body.role === 'pending' ? 'pending' : null;
      if (!role || !id) {
        json(res, 400, { error: 'id and role (admin|pending) required' });
        return true;
      }
      const { db, sha } = await loadDb();
      db.auth = db.auth || { admins: [], admin: null };
      db.auth.admins = (db.auth.admins || []).map((a) => {
        const match =
          a.id === id || String(a.email || '').toLowerCase() === id.toLowerCase();
        if (!match) return a;
        return {
          ...a,
          role: adminRoleRank(a.role) >= adminRoleRank(role) ? a.role : role,
        };
      });
      const updated =
        (db.auth.admins || []).find(
          (a) =>
            a.id === id || String(a.email || '').toLowerCase() === id.toLowerCase(),
        ) || null;
      await saveDb(db, sha);
      const fbUpdated = await firebasePatchAdminRole(id, role).catch(() => null);
      if (!fbUpdated) {
        json(res, 404, {
          error: 'Mentor not found in Firebase or role update failed',
          id,
          table: 'lumo/auth/admins',
        });
        return true;
      }
      json(res, 200, { ok: true, admin: fbUpdated });
      return true;
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
      json(res, 200, { ok: true, removed: before - (db.clients || []).length });
      return true;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'GET') {
      const email = decodeURIComponent(pathname.replace('/api/sessions/', '')).toLowerCase();
      const { db } = await loadDb();
      json(res, 200, db.sessions?.[email] ?? null);
      return true;
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
      json(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/vault' && req.method === 'GET') {
      const { db } = await loadDb();
      json(res, 200, db.vault || []);
      return true;
    }

    if (pathname === '/api/vault' && req.method === 'PUT') {
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      db.vault = Array.isArray(body) ? body : body.vault || db.vault;
      await saveDb(db, sha);
      json(res, 200, db.vault);
      return true;
    }

    if (pathname.startsWith('/api/images/') && req.method === 'PUT') {
      const key = decodeURIComponent(pathname.replace('/api/images/', '')).trim();
      if (!key) {
        json(res, 400, { error: 'image key required' });
        return true;
      }
      const body = await readBody(req);
      const dataUrl = String(body.dataUrl || '');
      if (!dataUrl.startsWith('data:')) {
        json(res, 400, { error: 'dataUrl required' });
        return true;
      }
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        json(res, 413, { error: 'File too large for cloud upload (max ~6 MB image)' });
        return true;
      }
      const { db, sha } = await loadDb();
      db.images = { ...(db.images || {}), [key]: dataUrl };
      await saveDb(db, sha);
      json(res, 200, { ok: true, url: `/api/images/${encodeURIComponent(key)}` });
      return true;
    }

    if (pathname.startsWith('/api/images/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const key = decodeURIComponent(pathname.replace('/api/images/', '')).trim();
      const { db } = await loadDb();
      const dataUrl = db.images?.[key];
      if (!dataUrl || !String(dataUrl).startsWith('data:')) {
        json(res, 404, { error: 'Image not found' });
        return true;
      }
      const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl));
      if (!m) {
        json(res, 404, { error: 'Invalid image' });
        return true;
      }
      const buf = Buffer.from(m[2], 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', m[1] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(buf.length));
        res.end();
        return true;
      }
      res.end(buf);
      return true;
    }

    return false;
  } catch (err) {
    json(res, 500, {
      error: err instanceof Error ? err.message : 'API error',
      durable: hasDurableBackend(),
    });
    return true;
  }
}

export { emptyDb };
