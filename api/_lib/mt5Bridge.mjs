/**
 * MT5 broker bridge — ConnectEx via swagger host (prefer HTTP; HTTPS hangs).
 */

function mt5Bases() {
  const host = (process.env.MT5_API_HOST || '66.23.225.158').trim();
  const envBase = String(process.env.MT5_API_BASE || '').replace(/\/$/, '');
  // Prefer HTTP — HTTPS on this host commonly hangs from serverless.
  const ordered = [
    `http://${host}`,
    ...(envBase && !/^https:\/\//i.test(envBase) ? [envBase] : []),
    ...(envBase && /^https:\/\//i.test(envBase) ? [envBase] : []),
    `https://${host}`,
  ];
  return ordered.filter((b, i, arr) => b && arr.indexOf(b) === i);
}

/** Swagger uses PascalCase server names (e.g. RazorMarkets-Live). */
function normalizeServerName(server) {
  const key = String(server || '').trim().toLowerCase();
  const aliases = {
    'razormarkets-live': 'RazorMarkets-Live',
    'razormarkets-demo': 'RazorMarkets-Demo',
  };
  return aliases[key] || String(server || '').trim();
}

function humanizeBrokerError(raw) {
  const text = String(raw || '').trim();
  const upper = text.toUpperCase();
  if (/INVALID_ACCOUNT|INVALID ACCOUNT|WRONG_PASSWORD|INVALID_PASSWORD/.test(upper)) {
    return 'Invalid login or password for this server. Check MT5 credentials and try again.';
  }
  if (/INVALID_SERVER|UNKNOWN_SERVER|SERVER_NOT_FOUND/.test(upper)) {
    return 'Unknown MT5 server. Search and select the exact server name from your broker.';
  }
  if (/ACCOUNT_DISABLED|DISABLED/.test(upper)) {
    return 'This trading account is disabled at the broker.';
  }
  if (/NO_CONNECTION|CONNECTION_FAILED|TIMEOUT/.test(upper)) {
    return 'Could not reach the broker server. Try again in a moment.';
  }
  if (/\[error\]:/i.test(text)) {
    return text.replace(/^\[error\]:\s*/i, '').trim() || text;
  }
  return text || 'Connection failed';
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
      if (typeof parsed.error === 'string') return parsed.error.trim();
      if (typeof parsed.message === 'string') return parsed.message.trim();
    }
    return text;
  } catch {
    return text.replace(/^"|"$/g, '');
  }
}

function isBrokerRejectBody(body) {
  return Boolean(body) && /error|fail|invalid|disabled|denied|wrong/i.test(body);
}

async function mt5Request(targetPath, timeoutMs = 18000) {
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

      // Got a real broker response — do NOT fall through to HTTPS (masks errors).
      if (upstream.ok && body && !isBrokerRejectBody(body)) {
        return { ok: true, token: body.replace(/^"|"$/g, ''), status: upstream.status };
      }
      if (body || upstream.status) {
        return {
          ok: false,
          error: humanizeBrokerError(body || `Connect failed (${upstream.status})`),
          status: upstream.status,
          brokerReject: true,
        };
      }
      lastErr = `Connect failed (${upstream.status})`;
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
  const server = normalizeServerName(input.server);
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
