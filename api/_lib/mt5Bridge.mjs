/**
 * MT5 broker bridge — connects through the swagger REST API at 66.23.225.158
 * (ConnectEx only) and proxies account + trade endpoints server-side.
 */

function mt5Bases() {
  const host = (process.env.MT5_API_HOST || '66.23.225.158').trim();
  const envBase = String(process.env.MT5_API_BASE || '').replace(/\/$/, '');
  return [...(envBase ? [envBase] : []), `https://${host}`, `http://${host}`].filter(
    (b, i, arr) => arr.indexOf(b) === i,
  );
}

async function readUpstreamText(res) {
  const text = (await res.text()).trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.token === 'string') return parsed.token.trim();
      if (typeof parsed.id === 'string') return parsed.id.trim();
    }
    return text;
  } catch {
    return text.replace(/^"|"$/g, '');
  }
}

async function mt5Request(targetPath, timeoutMs = 20000) {
  let lastErr = 'MT5 bridge unreachable';
  for (const base of mt5Bases()) {
    const targetUrl = `${base}${targetPath}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: ac.signal,
      });
      clearTimeout(timer);
      const body = await readUpstreamText(upstream);
      if (upstream.ok && body && !/error|fail|invalid/i.test(body)) {
        return { ok: true, token: body.replace(/^"|"$/g, ''), status: upstream.status };
      }
      lastErr = body || `Connect failed (${upstream.status})`;
    } catch (err) {
      clearTimeout(timer);
      lastErr =
        err instanceof Error
          ? `MT5 bridge unreachable via ${base}: ${err.message}`
          : `MT5 bridge unreachable via ${base}`;
    }
  }
  return { ok: false, error: lastErr };
}

/** Connect to MT5 via swagger ConnectEx (server name). */
export async function connectMt5Broker(input) {
  const user = String(input.user || '').trim();
  const password = String(input.password || '');
  const server = String(input.server || '').trim();
  if (!user || !password || !server) {
    return { ok: false, error: 'Missing login, password, or server' };
  }

  const exParams = new URLSearchParams({ user, password, server });
  const result = await mt5Request(`/ConnectEx?${exParams.toString()}`);
  if (result.ok && result.token) {
    return { ok: true, token: result.token };
  }

  return { ok: false, error: result.error || 'Connection failed' };
}
