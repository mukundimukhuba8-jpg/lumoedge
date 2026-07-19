import { emptyDb, hasDurableBackend, loadDb, saveDb } from './store.mjs';

function json(res, status, data) {
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
      json(res, 200, db);
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
      const { db } = await loadDb();
      json(res, 200, db.clients || []);
      return true;
    }

    if (pathname === '/api/clients' && req.method === 'POST') {
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      if (!email || !body.firstName || !body.lastName) {
        json(res, 400, { error: 'email, firstName, lastName required' });
        return true;
      }
      const existing = (db.clients || []).find((c) => c.email === email);
      if (existing) {
        json(res, 200, existing);
        return true;
      }
      const entry = {
        id: `cli-${Date.now()}`,
        email,
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        notifiedAt: new Date().toISOString(),
        paymentClaimed: false,
      };
      db.clients = [entry, ...(db.clients || [])];
      mirrorClientToSuper(db, entry);
      const saved = await saveDb(db, sha);
      const created = (saved.db.clients || []).find((c) => c.email === email) || entry;
      json(res, 201, created);
      return true;
    }

    if (pathname.startsWith('/api/clients/') && req.method === 'PATCH') {
      const id = decodeURIComponent(pathname.replace('/api/clients/', ''));
      const body = await readBody(req);
      const { db, sha } = await loadDb();
      db.clients = (db.clients || []).map((c) => {
        if (c.id !== id && c.email !== id) return c;
        return {
          ...c,
          ...body,
          id: c.id,
          email: c.email,
          paymentClaimed:
            body.paymentClaimed === true || c.paymentClaimed === true
              ? true
              : Boolean(body.paymentClaimed ?? c.paymentClaimed),
          paymentClaimedAt:
            body.paymentClaimed === true
              ? body.paymentClaimedAt || new Date().toISOString()
              : c.paymentClaimedAt,
        };
      });
      const updated =
        db.clients.find((c) => c.id === id) ||
        db.clients.find((c) => c.email === id);
      if (updated) mirrorClientToSuper(db, updated);
      await saveDb(db, sha);
      json(res, 200, updated || null);
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
      db.sessions = { ...(db.sessions || {}), [email]: body };
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
