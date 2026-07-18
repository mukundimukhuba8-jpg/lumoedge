import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 4174);

const emptyDb = () => ({
  auth: { admins: [], admin: null },
  store: { workspaces: {} },
  vault: [],
  images: {},
  clients: [],
  sessions: {},
  updatedAt: new Date().toISOString(),
});

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    return emptyDb();
  }
}

function writeDb(db) {
  ensureDb();
  const next = { ...db, updatedAt: new Date().toISOString() };
  fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2));
  return next;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream'
  );
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(DIST, rel);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  // SPA fallback
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(index).pipe(res);
    return;
  }
  res.writeHead(404).end('Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, updatedAt: readDb().updatedAt });
      return;
    }

    if (pathname === '/api/db' && req.method === 'GET') {
      sendJson(res, 200, readDb());
      return;
    }

    if (pathname === '/api/db' && req.method === 'PUT') {
      const body = await readBody(req);
      const current = readDb();
      const next = writeDb({
        ...current,
        ...body,
        // deep-ish merge for known maps
        auth: { ...current.auth, ...(body.auth || {}) },
        store: {
          workspaces: {
            ...(current.store?.workspaces || {}),
            ...(body.store?.workspaces || {}),
          },
        },
        vault: Array.isArray(body.vault) ? body.vault : current.vault,
        images: { ...current.images, ...(body.images || {}) },
        clients: Array.isArray(body.clients) ? body.clients : current.clients,
        sessions: { ...current.sessions, ...(body.sessions || {}) },
      });
      sendJson(res, 200, next);
      return;
    }

    if (pathname === '/api/clients' && req.method === 'GET') {
      sendJson(res, 200, readDb().clients || []);
      return;
    }

    if (pathname === '/api/clients' && req.method === 'POST') {
      const body = await readBody(req);
      const db = readDb();
      const email = String(body.email || '')
        .trim()
        .toLowerCase();
      if (!email || !body.firstName || !body.lastName) {
        sendJson(res, 400, { error: 'email, firstName, lastName required' });
        return;
      }
      const existing = (db.clients || []).find((c) => c.email === email);
      if (existing) {
        sendJson(res, 200, existing);
        return;
      }
      const entry = {
        id: `cli-${Date.now()}`,
        email,
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        notifiedAt: new Date().toISOString(),
      };
      db.clients = [entry, ...(db.clients || [])];
      // also mirror into super admin workspace for older UI paths
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
      };
      ws.clientRequests = [entry, ...(ws.clientRequests || [])];
      db.store.workspaces[sid] = ws;
      writeDb(db);
      sendJson(res, 201, entry);
      return;
    }

    if (pathname.startsWith('/api/clients/') && req.method === 'PATCH') {
      const id = pathname.replace('/api/clients/', '');
      const body = await readBody(req);
      const db = readDb();
      db.clients = (db.clients || []).map((c) =>
        c.id === id ? { ...c, ...body, id: c.id, email: c.email } : c,
      );
      const sid = 'LM-004821';
      const ws = db.store?.workspaces?.[sid];
      if (ws) {
        ws.clientRequests = (ws.clientRequests || []).map((c) =>
          c.id === id ? { ...c, ...body, id: c.id, email: c.email } : c,
        );
      }
      writeDb(db);
      const updated = db.clients.find((c) => c.id === id);
      sendJson(res, 200, updated || null);
      return;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'GET') {
      const email = decodeURIComponent(pathname.replace('/api/sessions/', '')).toLowerCase();
      const session = readDb().sessions?.[email] || null;
      sendJson(res, 200, session);
      return;
    }

    if (pathname.startsWith('/api/sessions/') && req.method === 'PUT') {
      const email = decodeURIComponent(pathname.replace('/api/sessions/', '')).toLowerCase();
      const body = await readBody(req);
      const db = readDb();
      db.sessions = { ...(db.sessions || {}), [email]: body };
      writeDb(db);
      sendJson(res, 200, body);
      return;
    }

    if (pathname === '/api/vault' && req.method === 'GET') {
      sendJson(res, 200, readDb().vault || []);
      return;
    }

    if (pathname === '/api/vault' && req.method === 'PUT') {
      const body = await readBody(req);
      const db = readDb();
      db.vault = Array.isArray(body) ? body : body.vault || db.vault;
      writeDb(db);
      sendJson(res, 200, db.vault);
      return;
    }

    if (!pathname.startsWith('/api')) {
      serveStatic(req, res, pathname);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error' });
  }
});

ensureDb();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lumo Edge server on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DB_FILE}`);
});
