/**
 * MT5 broker bridge — resolves web terminal hosts server-side and connects
 * through the MT5 REST API (never exposed to the client UI).
 */

const BROKER_TERMINALS = [
  { server: 'razormarkets-live', terminalUrl: 'https://webtrader.razormarkets.co.za/terminal' },
  { server: 'rcgmarkets-live', terminalUrl: 'https://webtrader.rcgmarkets.com/terminal' },
  { server: 'rcgmarkets-demo', terminalUrl: 'https://webtrader-demo.rcgmarkets.com/terminal' },
  { server: 'accumarkets-live', terminalUrl: 'https://webterminal.accumarkets.co.za/terminal' },
  { server: 'rockwest-server', terminalUrl: 'https://webtrader.rock-west.com/terminal' },
  { server: 'luxetradingmarkets-live', terminalUrl: 'https://webtrader.luxemarkets.forex/' },
  { server: 'maonoglobalmarkets-live', terminalUrl: 'https://web.maonoglobalmarkets.com/terminal' },
  { server: 'rocketx-live', terminalUrl: 'https://webtrader.rocketx.io:1950/terminal' },
  { server: 'spacemarkets-live', terminalUrl: 'https://webtrader.spacemarkets.io:1960/terminal' },
  { server: 'deriv-demo', terminalUrl: 'https://mt5-demo-web.deriv.com/terminal' },
  { server: 'derivsvg-server', terminalUrl: 'https://mt5-real01-web-svg.deriv.com/terminal' },
  { server: 'derivsvg-server-02', terminalUrl: 'https://mt5-real02-web-svg.deriv.com/terminal' },
  { server: 'derivsvg-server-03', terminalUrl: 'https://mt5-real03-web-svg.deriv.com/terminal' },
  { server: 'derivbvi-server', terminalUrl: 'https://mt5-real01-web-bvi.deriv.com/terminal' },
  { server: 'derivbvi-server-02', terminalUrl: 'https://mt5-real02-web-bvi.deriv.com/terminal' },
  { server: 'derivbvi-server-03', terminalUrl: 'https://mt5-real03-web-bvi.deriv.com/terminal' },
  { server: 'derivbvi-server-vu', terminalUrl: 'https://mt5-real01-web-vu.deriv.com/terminal' },
  { server: 'derivbvi-server-vu-02', terminalUrl: 'https://mt5-real02-web-vu.deriv.com/terminal' },
  { server: 'derivbvi-server-vu-03', terminalUrl: 'https://mt5-real03-web-vu.deriv.com/terminal' },
];

const byServer = new Map(
  BROKER_TERMINALS.map((entry) => [entry.server.toLowerCase(), entry]),
);

export function getBrokerTerminal(serverName) {
  return byServer.get(String(serverName || '').trim().toLowerCase());
}

export function parseTerminalEndpoint(terminalUrl) {
  try {
    const u = new URL(terminalUrl);
    const host = u.hostname;
    if (!host) return null;
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    return { host, port };
  } catch {
    return null;
  }
}

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

async function mt5Request(targetPath, timeoutMs = 12000) {
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

/**
 * Connect to MT5 using the broker web terminal host only (no server-name API).
 */
export async function connectMt5Broker(input) {
  const user = String(input.user || '').trim();
  const password = String(input.password || '');
  const server = String(input.server || '').trim();
  if (!user || !password || !server) {
    return { ok: false, error: 'Missing login, password, or server' };
  }

  const entry = getBrokerTerminal(server);
  if (!entry) {
    return {
      ok: false,
      error: 'Pick a supported broker server from the list — web terminal required.',
    };
  }

  const endpoint = parseTerminalEndpoint(entry.terminalUrl);
  if (!endpoint) {
    return { ok: false, error: 'Invalid web terminal configuration for this broker.' };
  }

  const params = new URLSearchParams({
    user,
    password,
    host: endpoint.host,
    port: String(endpoint.port),
  });
  const result = await mt5Request(`/Connect?${params.toString()}`);
  if (result.ok && result.token) {
    return { ok: true, token: result.token, terminalUrl: entry.terminalUrl };
  }

  return { ok: false, error: result.error || 'Connection failed' };
}
