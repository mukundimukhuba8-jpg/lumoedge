import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load local .env into process.env (does not override existing env) */
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}
loadEnvFile();

const DIST = path.join(__dirname, 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 4174);
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;
/** MT5API RESTFul — https://66.23.225.158/swagger/index.html */
const MT5_API_BASE = (process.env.MT5_API_BASE || 'http://66.23.225.158').replace(/\/$/, '');
/** Chart Scanner — put your OpenAI/OpenAPI key here or in env */
const CHART_SCAN_API_KEY =
  process.env.CHART_SCAN_API_KEY ||
  process.env.OPENAI_API_KEY ||
  '';
const CHART_SCAN_API_URL =
  process.env.CHART_SCAN_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const CHART_SCAN_MODEL = process.env.CHART_SCAN_MODEL || 'gpt-4o';

const emptyDb = () => ({
  auth: { admins: [], admin: null },
  store: { workspaces: {} },
  vault: [],
  images: {},
  clients: [],
  sessions: {},
  revokedKeys: [],
  updatedAt: new Date().toISOString(),
});

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  return { mime, buf };
}

function extForMime(mime) {
  return (
    {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-m4v': '.m4v',
    }[mime] || ''
  );
}

function safeMediaKey(key) {
  return String(key || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Stream media with HTTP Range support (required for mobile video playback). */
function serveMediaFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const type = contentType(filePath);
  const range = req.headers.range;

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    end = Math.min(end, size - 1);
    const chunk = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk,
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    'Content-Type': type,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
  });
  fs.createReadStream(filePath).pipe(res);
}

function clearMediaKeyFiles(key) {
  for (const name of fs.readdirSync(MEDIA_DIR)) {
    if (name === key || name.startsWith(`${key}.`)) {
      try {
        fs.unlinkSync(path.join(MEDIA_DIR, name));
      } catch {
        // ignore
      }
    }
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
    'Access-Control-Allow-Methods': 'GET,PUT,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Media-Key',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
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
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
    }[ext] || 'application/octet-stream'
  );
}

function readBodyLimited(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
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
        revokedKeys: Array.isArray(body.revokedKeys)
          ? [...new Set([...(current.revokedKeys || []), ...body.revokedKeys])]
          : current.revokedKeys || [],
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

    if (pathname.startsWith('/api/clients/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/clients/', '');
      const db = readDb();
      const before = (db.clients || []).length;
      db.clients = (db.clients || []).filter((c) => c.id !== id);
      const sid = 'LM-004821';
      const ws = db.store?.workspaces?.[sid];
      if (ws) {
        ws.clientRequests = (ws.clientRequests || []).filter((c) => c.id !== id);
      }
      writeDb(db);
      sendJson(res, 200, { ok: true, removed: before - (db.clients || []).length });
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

    // Mentor custom media (images / videos) — stored as files, not in db.json
    if (pathname === '/api/media' && req.method === 'POST') {
      ensureDb();
      let body;
      try {
        body = await readBodyLimited(req, Math.floor(MAX_MEDIA_BYTES * 1.4));
      } catch (e) {
        sendJson(res, 413, { error: e.message || 'Payload too large' });
        return;
      }
      const key = safeMediaKey(body.key);
      const parsed = parseDataUrl(body.dataUrl);
      if (!key || !parsed) {
        sendJson(res, 400, { error: 'key and dataUrl (base64) required' });
        return;
      }
      const isImage = parsed.mime.startsWith('image/');
      const isVideo = parsed.mime.startsWith('video/');
      if (!isImage && !isVideo) {
        sendJson(res, 400, { error: 'Only image and video uploads are allowed' });
        return;
      }
      if (parsed.buf.length > MAX_MEDIA_BYTES) {
        sendJson(res, 413, { error: 'File too large (max 30 MB)' });
        return;
      }
      const ext = extForMime(parsed.mime);
      if (!ext) {
        sendJson(res, 400, { error: `Unsupported type: ${parsed.mime}` });
        return;
      }
      clearMediaKeyFiles(key);
      const filename = `${key}${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, filename), parsed.buf);
      sendJson(res, 200, { ok: true, url: `/api/media/${filename}`, key, mime: parsed.mime });
      return;
    }

    // Binary upload (preferred for videos — no base64 bloat)
    if (pathname === '/api/media/binary' && req.method === 'POST') {
      ensureDb();
      const key = safeMediaKey(req.headers['x-media-key']);
      const mime = String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!key) {
        sendJson(res, 400, { error: 'X-Media-Key header required' });
        return;
      }
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      if (!isImage && !isVideo) {
        sendJson(res, 400, { error: 'Only image and video uploads are allowed' });
        return;
      }
      const ext = extForMime(mime);
      if (!ext) {
        sendJson(res, 400, { error: `Unsupported type: ${mime}` });
        return;
      }
      let buf;
      try {
        buf = await readRawBody(req, MAX_MEDIA_BYTES);
      } catch (e) {
        sendJson(res, 413, { error: e.message || 'Payload too large' });
        return;
      }
      if (!buf.length) {
        sendJson(res, 400, { error: 'Empty file' });
        return;
      }
      clearMediaKeyFiles(key);
      const filename = `${key}${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
      sendJson(res, 200, { ok: true, url: `/api/media/${filename}`, key, mime });
      return;
    }

    if (pathname.startsWith('/api/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      ensureDb();
      const filename = safeMediaKey(decodeURIComponent(pathname.replace('/api/media/', '')));
      const filePath = path.join(MEDIA_DIR, filename);
      if (!filePath.startsWith(MEDIA_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404).end('Not found');
        return;
      }
      if (req.method === 'HEAD') {
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType(filePath),
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        });
        res.end();
        return;
      }
      serveMediaFile(req, res, filePath);
      return;
    }

    if (pathname.startsWith('/api/media/') && req.method === 'DELETE') {
      ensureDb();
      const key = safeMediaKey(pathname.replace('/api/media/', ''));
      let removed = 0;
      for (const name of fs.readdirSync(MEDIA_DIR)) {
        if (name === key || name.startsWith(`${key}.`)) {
          try {
            fs.unlinkSync(path.join(MEDIA_DIR, name));
            removed += 1;
          } catch {
            // ignore
          }
        }
      }
      sendJson(res, 200, { ok: true, removed });
      return;
    }

    // Chart Scanner — OpenAI / OpenAPI vision
    if (pathname === '/api/scan' && req.method === 'POST') {
      const body = await readBody(req);
      const image = String(body.image || '');
      if (!image.startsWith('data:image/')) {
        sendJson(res, 400, { ok: false, accuracy: 0, error: 'image data URL required' });
        return;
      }

      // No key yet → demo scan so UI still works (70–90%)
      if (!CHART_SCAN_API_KEY) {
        const accuracy = 70 + Math.floor(Math.random() * 21);
        const demoSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'BTCUSD'];
        const symbol = demoSymbols[Math.floor(Math.random() * demoSymbols.length)];
        const direction = Math.random() > 0.5 ? 'buy' : 'sell';
        sendJson(res, 200, {
          ok: true,
          demo: true,
          accuracy,
          symbol,
          timeframe: 'M15',
          direction,
          summary: 'Demo mode — add CHART_SCAN_API_KEY on the server for live AI scans.',
        });
        return;
      }

      const prompt =
        'You analyze MT5 / trading chart screenshots.\n' +
        'CRITICAL RULES FOR SYMBOL:\n' +
        '- Read the EXACT trading symbol text shown on the chart UI (title bar, market watch, or chart header).\n' +
        '- Do NOT guess, invent, or substitute a different pair (never default to XAUUSD/EURUSD unless that text is clearly visible).\n' +
        '- If the symbol text is not clearly readable on the image, set symbol to null and symbol_visible to false.\n' +
        '- Copy the symbol characters as shown (e.g. XAUUSD, EURUSD.r, NAS100, BTCUSD).\n' +
        'Also read timeframe only if visible (M1,M5,M15,H1,H4,D1, etc), else null.\n' +
        'Decide direction buy or sell from the chart structure only.\n' +
        'accuracy_percent must be an integer from 70 to 90.\n' +
        'Reply ONLY compact JSON:\n' +
        '{"symbol":"EXACT_OR_null","symbol_visible":true,"timeframe":"M15_or_null","direction":"buy|sell","accuracy_percent":78,"summary":"one short sentence"}';

      const upstream = await fetch(CHART_SCAN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHART_SCAN_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHART_SCAN_MODEL,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image, detail: 'high' } },
              ],
            },
          ],
        }),
      });

      const raw = await upstream.text();
      if (!upstream.ok) {
        sendJson(res, 502, {
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
        sendJson(res, 422, {
          ok: false,
          accuracy: 0,
          error:
            'Could not read the symbol from this chart. Upload a clearer MT5 screenshot showing the pair name.',
        });
        return;
      }
      // Normalize common chart formatting but keep the same instrument
      symbol = symbol.replace(/\s+/g, '').toUpperCase();

      let accuracy = Number(parsed.accuracy_percent ?? parsed.accuracy ?? 0);
      if (!Number.isFinite(accuracy) || accuracy < 70 || accuracy > 90) {
        accuracy = 70 + Math.floor(Math.random() * 21);
      }
      const rawDir = String(parsed.direction || parsed.side || '').toLowerCase();
      if (!rawDir.includes('sell') && !rawDir.includes('buy')) {
        sendJson(res, 422, {
          ok: false,
          accuracy: 0,
          error: 'Could not determine BUY/SELL from this chart. Try another screenshot.',
        });
        return;
      }
      const direction = rawDir.includes('sell') ? 'sell' : 'buy';
      const timeframeRaw = parsed.timeframe == null ? '' : String(parsed.timeframe).trim();
      const timeframe =
        !timeframeRaw || /null|unknown|n\/a|none/i.test(timeframeRaw)
          ? undefined
          : timeframeRaw;

      sendJson(res, 200, {
        ok: true,
        demo: false,
        accuracy: Math.round(accuracy),
        symbol,
        timeframe,
        direction,
        summary: parsed.summary || `Scan for ${symbol}`,
      });
      return;
    }

    if (pathname === '/api/scan/status' && req.method === 'GET') {
      sendJson(res, 200, {
        configured: Boolean(CHART_SCAN_API_KEY),
        model: CHART_SCAN_MODEL,
        url: CHART_SCAN_API_URL,
      });
      return;
    }

    // Proxy → MT5API RESTFul (broker search, ConnectEx, account, trading)
    if (pathname.startsWith('/api/mt5')) {
      const targetPath = pathname === '/api/mt5' ? '/' : pathname.slice('/api/mt5'.length);
      const targetUrl = `${MT5_API_BASE}${targetPath}${url.search}`;
      const method = req.method || 'GET';
      /** @type {Buffer[]} */
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      const rawBody = Buffer.concat(chunks);
      const headers = {
        Accept: req.headers.accept || 'application/json, text/plain, */*',
      };
      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
      }
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : rawBody,
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = upstream.headers.get('content-type') || 'application/json';
      res.writeHead(upstream.status, {
        'Content-Type': ct,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(buf);
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
