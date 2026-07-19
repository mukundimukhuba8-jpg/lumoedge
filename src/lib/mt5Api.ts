/**
 * Client for the brokers API (MT5API RESTFul swagger host).
 * All broker operations — search, connect, account info, trades —
 * talk straight to this API from the user's device.
 */

const BROKER_API_BASE = 'https://66.23.225.158';

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

async function mt5Fetch(path: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 15_000);
  try {
    return await fetch(`${BROKER_API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? ac.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(
      err instanceof Error && /certificate|Failed to fetch|network|abort/i.test(err.message)
        ? 'Cannot reach the broker server. Check your connection and try again.'
        : err instanceof Error
          ? err.message
          : 'Broker server unreachable',
    );
  } finally {
    window.clearTimeout(timer);
  }
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

/** Search existing broker companies / MT5 server names (live results only) */
export async function searchBrokers(company: string): Promise<Mt5Company[]> {
  const q = company.trim();
  if (q.length < 2) return [];
  const res = await mt5Fetch(`/Search?company=${encodeURIComponent(q)}`);
  const data = await readBody(res);
  if (!res.ok) {
    throw new Error(typeof data === 'string' ? data : 'Broker search failed');
  }
  return Array.isArray(data) ? (data as Mt5Company[]) : [];
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
