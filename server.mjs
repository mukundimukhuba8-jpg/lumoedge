import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api/_lib/handlers.mjs';
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
/** MT5API RESTFul — https://66.23.225.158/swagger/index.html (API root = host only) */
const MT5_API_BASE = (
  process.env.MT5_API_BASE ||
  `http://${process.env.MT5_API_HOST || '66.23.225.158'}`
).replace(/\/$/, '');
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
    // Shared durable API (local file here; GitHub-backed on Vercel)
    if (
      pathname === '/api/health' ||
      pathname === '/api/db' ||
      pathname === '/api/clients' ||
      pathname.startsWith('/api/clients/') ||
      pathname === '/api/auth/admins' ||
      pathname === '/api/auth/admins/repair-sync' ||
      pathname.startsWith('/api/auth/admins/') ||
      pathname === '/api/auth/register' ||
      pathname.startsWith('/api/sessions/') ||
      pathname === '/api/vault' ||
      pathname.startsWith('/api/images/')
    ) {
      const handled = await handleApi(req, res, pathname);
      if (handled) return;
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

      if (!CHART_SCAN_API_KEY) {
        sendJson(res, 503, {
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
      } = await import('./api/_lib/chartScanParse.mjs');

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

      let accuracy = normalizeScanAccuracy(parsed, image);
      const directionResult = resolveScanDirection(parsed, accuracy, image);
      if (!directionResult.ok) {
        sendJson(res, 422, {
          ok: false,
          accuracy: 0,
          error: directionResult.error,
        });
        return;
      }

      const { direction, corrected, correctionReason } = directionResult;
      accuracy = directionResult.accuracy;
      if (accuracy < 65) {
        sendJson(res, 422, {
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

      sendJson(res, 200, {
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
      sendJson(res, 200, {
        configured: Boolean(CHART_SCAN_API_KEY),
        model: CHART_SCAN_MODEL,
        url: CHART_SCAN_API_URL,
      });
      return;
    }

    if (pathname === '/api/telegram/config' && req.method === 'POST') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        body = {};
      }
      const fbUrl = (
        process.env.FIREBASE_DATABASE_URL ||
        process.env.VITE_FIREBASE_DATABASE_URL ||
        'https://lumoedge-61c02-default-rtdb.firebaseio.com'
      ).replace(/\/$/, '');
      const mentorId = String(body?.mentorId || '').trim();
      let botToken = String(body?.botToken || '').trim();
      const chatId = String(body?.chatId || '').trim();
      const hasEnabled = typeof body?.enabled === 'boolean';
      const enabled = hasEnabled ? Boolean(body.enabled) : true;
      const fromUrl = botToken.match(
        /(?:https?:\/\/)?api\.telegram\.org\/bot([0-9]+:[A-Za-z0-9_-]+)/i,
      );
      if (fromUrl?.[1]) botToken = fromUrl[1].trim();
      botToken = botToken.replace(/^bot/i, '').trim().split('/')[0] || botToken;

      if (mentorId && hasEnabled && !botToken && !chatId) {
        try {
          const secretRes = await fetch(`${fbUrl}/lumo/secrets/telegramAlerts.json`, {
            cache: 'no-store',
          });
          const secret = secretRes.ok ? await secretRes.json() : {};
          const existingTok = String(secret?.botToken || '').trim();
          const existingChat = String(secret?.chatId || '').trim();
          if (!existingTok || !existingChat) {
            sendJson(res, 400, {
              ok: false,
              error: 'Save bot token and chat ID first, then use On/Off.',
            });
            return;
          }
          const updatedAt = new Date().toISOString();
          const put = await fetch(`${fbUrl}/lumo/secrets/telegramAlerts.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...secret,
              mentorId: String(secret?.mentorId || mentorId).trim() || mentorId,
              botToken: existingTok,
              chatId: existingChat,
              enabled,
              updatedAt,
            }),
          });
          await fetch(`${fbUrl}/lumo/store/workspaces/${mentorId}/profile.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramAlertsEnabled: enabled }),
          }).catch(() => null);
          if (!put.ok) {
            sendJson(res, 502, { ok: false, error: 'Could not update Telegram On/Off' });
            return;
          }
          sendJson(res, 200, { ok: true, enabled, updatedAt });
        } catch {
          sendJson(res, 502, { ok: false, error: 'Could not update Telegram On/Off' });
        }
        return;
      }

      if (!mentorId || !botToken || !chatId) {
        sendJson(res, 400, {
          ok: false,
          error: 'mentorId, botToken, and chatId required',
        });
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        sendJson(res, 400, {
          ok: false,
          error: 'Bot token looks wrong. Paste only the BotFather token.',
        });
        return;
      }
      const updatedAt = new Date().toISOString();
      try {
        const secretRes = await fetch(`${fbUrl}/lumo/secrets/telegramAlerts.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mentorId, botToken, chatId, enabled, updatedAt }),
        });
        if (!secretRes.ok) {
          sendJson(res, 502, { ok: false, error: 'Could not save Telegram settings to cloud' });
          return;
        }
        await fetch(`${fbUrl}/lumo/store/workspaces/${mentorId}/profile.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramBotToken: botToken,
            telegramChatId: chatId,
            telegramAlertsEnabled: enabled,
          }),
        }).catch(() => null);
        await fetch(`${fbUrl}/lumo/updatedAt.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedAt),
        }).catch(() => null);
        sendJson(res, 200, { ok: true, enabled, updatedAt });
      } catch {
        sendJson(res, 502, { ok: false, error: 'Could not save Telegram settings to cloud' });
      }
      return;
    }

    if (pathname === '/api/telegram/notify' && req.method === 'POST') {
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        body = {};
      }
      const {
        isTelegramAlertLicenseKey,
        buildTelegramTradeMessage,
        sendTelegramMessage,
      } = await import('./api/_lib/telegramNotify.mjs');
      const isTest = Boolean(body?.test);
      const licenseKey = String(body?.licenseKey || '').trim();
      if (!isTest && body?.notify === false) {
        sendJson(res, 200, { ok: false, skipped: true, error: 'telegram notify off' });
        return;
      }
      if (!isTest && !isTelegramAlertLicenseKey(licenseKey)) {
        sendJson(res, 200, {
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
        return v.replace(/^bot/i, '').trim().split('/')[0] || v;
      };
      const fbUrl = (
        process.env.FIREBASE_DATABASE_URL ||
        process.env.VITE_FIREBASE_DATABASE_URL ||
        'https://lumoedge-61c02-default-rtdb.firebaseio.com'
      ).replace(/\/$/, '');
      let botToken = normalizeTok(body?.botToken);
      let chatId = String(body?.chatId || '').trim();
      let alertsEnabled = true;
      try {
        const secretRes = await fetch(`${fbUrl}/lumo/secrets/telegramAlerts.json`, {
          cache: 'no-store',
        });
        const secret = secretRes.ok ? await secretRes.json() : {};
        if (typeof secret?.enabled === 'boolean') alertsEnabled = secret.enabled;
        if (!botToken || !chatId) {
          botToken = botToken || normalizeTok(secret?.botToken);
          chatId = chatId || String(secret?.chatId || '').trim();
        }
        if (!isTest && !alertsEnabled) {
          sendJson(res, 200, {
            ok: false,
            skipped: true,
            error: 'Telegram alerts are turned Off',
          });
          return;
        }
        if (!botToken || !chatId) {
          const preferredId = String(body?.mentorId || '').trim();
          if (preferredId) {
            const r = await fetch(
              `${fbUrl}/lumo/store/workspaces/${preferredId}.json`,
              { cache: 'no-store' },
            );
            if (r.ok) {
              const ws = await r.json();
              const profile = (ws && ws.profile) || {};
              botToken = botToken || normalizeTok(profile.telegramBotToken);
              chatId = chatId || String(profile.telegramChatId || '').trim();
            }
          }
        }
      } catch {
        /* keep whatever we have */
      }
      if (!botToken || !chatId) {
        sendJson(res, 200, { ok: false, skipped: true, error: 'not configured' });
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        sendJson(res, 400, {
          ok: false,
          error:
            'Bot token looks wrong. Paste only the token from BotFather, not a full URL.',
        });
        return;
      }
      try {
        const result = await sendTelegramMessage(
          botToken,
          chatId,
          buildTelegramTradeMessage(body || {}),
        );
        sendJson(res, result.ok ? 200 : 502, result);
      } catch (e) {
        sendJson(res, 502, {
          ok: false,
          error: e instanceof Error ? e.message : 'Telegram send failed',
        });
      }
      return;
    }

    // Backend broker connect — resolves web terminal host from server name
    if (pathname === '/api/mt5/connect' && req.method === 'POST') {
      const { connectMt5Broker } = await import('./api/_lib/mt5Bridge.mjs');
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
        req.on('error', reject);
      });
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        body = {};
      }
      const result = await connectMt5Broker({
        user: body.user,
        password: body.password,
        server: body.server,
      });
      if (result.ok && result.token) {
        sendJson(res, 200, { token: result.token });
      } else {
        const msg = result.error || 'Connect failed';
        const unreachable = /unreachable|timeout|abort|fetch failed/i.test(msg);
        sendJson(res, unreachable ? 502 : 400, { error: msg });
      }
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
