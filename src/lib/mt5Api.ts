/**
 * Client for MT5API RESTFul — Swagger: https://66.23.225.158/swagger/index.html
 * Order: server proxy (/api/mt5) first, then direct browser call to the
 * bridge (the MT5 host blocks datacenter IPs but allows real users).
 */

const PROXY_BASE = '/api/mt5';
const DIRECT_BASE = 'https://66.23.225.158';

/** Remember which base worked so later calls are fast */
let preferredBase: string | null = null;

export type Mt5ServerResult = {
  name: string;
  logo_url?: string;
  site?: string;
  access?: string[];
};

export type Mt5Company = {
  company: string;
  results: Mt5ServerResult[];
};

export type Mt5AccountSummary = {
  balance?: number;
  credit?: number;
  profit?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
  leverage?: number;
  currency?: string;
};

export type Mt5AccountDetails = {
  login?: number;
  type?: string;
  userName?: string;
  balance?: number;
  leverage?: number;
  email?: string;
  [key: string]: unknown;
};

export type Mt5OpenedOrder = {
  ticket?: number;
  symbol?: string;
  orderType?: string;
  type?: string;
  lots?: number;
  volume?: number;
  openPrice?: number;
  closePrice?: number;
  profit?: number;
  swap?: number;
  openTime?: string;
  comment?: string;
  [key: string]: unknown;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? ac.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init?.headers || {}),
      },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/** 502 from our proxy means the bridge blocked the datacenter IP */
function isBridgeBlocked(res: Response): boolean {
  return res.status === 502 || res.status === 504;
}

async function mt5Fetch(path: string, init?: RequestInit): Promise<Response> {
  const bases = preferredBase
    ? [preferredBase, ...[PROXY_BASE, DIRECT_BASE].filter((b) => b !== preferredBase)]
    : [PROXY_BASE, DIRECT_BASE];
  let lastError: unknown = null;
  for (const base of bases) {
    try {
      const res = await fetchWithTimeout(
        `${base}${path}`,
        init,
        base === PROXY_BASE ? 12_000 : 10_000,
      );
      if (base === PROXY_BASE && isBridgeBlocked(res)) {
        lastError = new Error('MT5 bridge unreachable from server');
        continue; // try direct browser connection
      }
      preferredBase = base;
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    lastError instanceof Error && /certificate|Failed to fetch|network/i.test(lastError.message)
      ? 'Cannot reach the broker bridge. Open https://66.23.225.158/swagger/index.html once in this browser, accept the security warning, then try again.'
      : lastError instanceof Error
        ? lastError.message
        : 'MT5 bridge unreachable',
  );
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function pingMt5(): Promise<boolean> {
  try {
    const res = await mt5Fetch('/Ping');
    return res.ok;
  } catch {
    return false;
  }
}

/** Search existing broker companies / MT5 server names */
export async function searchBrokers(company: string): Promise<Mt5Company[]> {
  const q = company.trim();
  if (q.length < 2) return [];
  try {
    const res = await mt5Fetch(`/Search?company=${encodeURIComponent(q)}`);
    const data = await readBody(res);
    if (!res.ok) {
      throw new Error(typeof data === 'string' ? data : 'Broker search failed');
    }
    const list = Array.isArray(data) ? (data as Mt5Company[]) : [];
    if (list.length) return list;
  } catch (err) {
    // Fall through to local known brokers when MT5 bridge is down
    console.warn('[mt5] search failed, using offline list', err);
  }
  return offlineBrokerMatches(q);
}

/** Known brokers when the live MT5 search bridge is unreachable */
function offlineBrokerMatches(q: string): Mt5Company[] {
  const known: Mt5Company[] = [
    {
      company: 'Razor Markets',
      results: [
        { name: 'RazorMarkets-Live', site: 'https://razormarkets.co.za' },
        { name: 'RazorMarkets-Demo', site: 'https://razormarkets.co.za' },
      ],
    },
    {
      company: 'IC Markets',
      results: [
        { name: 'ICMarketsSC-MT5', site: 'https://www.icmarkets.com' },
        { name: 'ICMarketsSC-Demo', site: 'https://www.icmarkets.com' },
      ],
    },
    {
      company: 'Exness',
      results: [
        { name: 'Exness-MT5Real', site: 'https://www.exness.com' },
        { name: 'Exness-MT5Trial', site: 'https://www.exness.com' },
      ],
    },
    {
      company: 'XM',
      results: [
        { name: 'XMGlobal-MT5', site: 'https://www.xm.com' },
        { name: 'XMGlobal-MT5 2', site: 'https://www.xm.com' },
      ],
    },
    {
      company: 'FTMO',
      results: [{ name: 'FTMO-Server', site: 'https://ftmo.com' }],
    },
    {
      company: 'Pepperstone',
      results: [
        { name: 'Pepperstone-MT5-Live', site: 'https://pepperstone.com' },
        { name: 'Pepperstone-MT5-Demo', site: 'https://pepperstone.com' },
      ],
    },
    {
      company: 'FBS',
      results: [
        { name: 'FBS-Real', site: 'https://fbs.com' },
        { name: 'FBS-Demo', site: 'https://fbs.com' },
      ],
    },
    {
      company: 'RoboForex',
      results: [
        { name: 'RoboForex-Pro', site: 'https://roboforex.com' },
        { name: 'RoboForex-Demo', site: 'https://roboforex.com' },
      ],
    },
    {
      company: 'Tickmill',
      results: [
        { name: 'Tickmill-Live', site: 'https://tickmill.com' },
        { name: 'Tickmill-Demo', site: 'https://tickmill.com' },
      ],
    },
    {
      company: 'Admiral Markets',
      results: [
        { name: 'AdmiralsGroup-Demo', site: 'https://admiralmarkets.com' },
        { name: 'AdmiralsGroup-Live', site: 'https://admiralmarkets.com' },
      ],
    },
  ];
  const needle = q.toLowerCase();
  return known.filter(
    (c) =>
      c.company.toLowerCase().includes(needle) ||
      c.results.some((r) => r.name.toLowerCase().includes(needle)),
  );
}

/**
 * Connect using MT5 terminal server name (e.g. RazorMarkets-Live).
 * Returns session token for further /Account* calls.
 */
export async function connectEx(input: {
  user: string | number;
  password: string;
  server: string;
}): Promise<string> {
  const params = new URLSearchParams({
    user: String(input.user).trim(),
    password: input.password,
    server: input.server.trim(),
  });
  const res = await mt5Fetch(`/ConnectEx?${params.toString()}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(
      typeof data === 'string'
        ? data
        : `Connect failed (${res.status})`,
    );
  }
  const token = typeof data === 'string' ? data.trim() : String(data ?? '').trim();
  if (!token || /error|fail|invalid/i.test(token)) {
    throw new Error(token || 'Connect failed — no session token returned');
  }
  return token.replace(/^"|"$/g, '');
}

export async function checkConnect(id: string): Promise<boolean> {
  const res = await mt5Fetch(`/CheckConnect?id=${encodeURIComponent(id)}`);
  const data = await readBody(res);
  return res.ok && String(data).toUpperCase().includes('OK');
}

export async function disconnectMt5(id: string): Promise<void> {
  const res = await mt5Fetch(`/Disconnect?id=${encodeURIComponent(id)}`);
  if (!res.ok) {
    const data = await readBody(res);
    throw new Error(typeof data === 'string' ? data : 'Disconnect failed');
  }
}

export async function accountSummary(id: string): Promise<Mt5AccountSummary> {
  const res = await mt5Fetch(`/AccountSummary?id=${encodeURIComponent(id)}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : 'AccountSummary failed');
  }
  return (data && typeof data === 'object' ? data : {}) as Mt5AccountSummary;
}

export async function accountDetails(id: string): Promise<Mt5AccountDetails> {
  const res = await mt5Fetch(`/AccountDetails?id=${encodeURIComponent(id)}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : 'AccountDetails failed');
  }
  return (data && typeof data === 'object' ? data : {}) as Mt5AccountDetails;
}

/** Open positions / orders for the connected account */
export async function openedOrders(id: string): Promise<Mt5OpenedOrder[]> {
  const res = await mt5Fetch(`/OpenedOrders?id=${encodeURIComponent(id)}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : 'OpenedOrders failed');
  }
  return Array.isArray(data) ? (data as Mt5OpenedOrder[]) : [];
}

export type Mt5OrderOperation = 'Buy' | 'Sell';

/**
 * Send market order via MT5 bridge.
 * Comment format: "{EA name} Lumo~edge"
 */
export async function orderSend(input: {
  id: string;
  symbol: string;
  operation: Mt5OrderOperation;
  volume: number;
  comment?: string;
  slippage?: number;
}): Promise<unknown> {
  const params = new URLSearchParams({
    id: input.id,
    symbol: input.symbol.trim(),
    operation: input.operation,
    volume: String(input.volume),
  });
  if (input.comment) params.set('comment', input.comment.slice(0, 31));
  if (input.slippage != null) params.set('slippage', String(input.slippage));
  const res = await mt5Fetch(`/OrderSend?${params.toString()}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(
      typeof data === 'string'
        ? data
        : (data as { title?: string })?.title || `OrderSend failed (${res.status})`,
    );
  }
  return data;
}

/** Build MT5 order comment: EA name then Lumo~edge */
export function buildTradeComment(eaName: string): string {
  const name = (eaName || 'Lumo Edge').trim().replace(/\s+/g, ' ');
  const base = name || 'Lumo Edge';
  const tagged = `${base} Lumo~edge`;
  // MT5 comments are short — keep within ~31 chars
  return tagged.slice(0, 31);
}
