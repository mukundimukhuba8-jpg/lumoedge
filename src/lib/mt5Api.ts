/**
 * MT5 client — broker search, connect, account, and trades via the
 * MT5API RESTFul swagger host (https://66.23.225.158) through /api/mt5.
 */

const PROXY_BASE = '/api/mt5';

async function mt5Fetch(path: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 14_000);
  try {
    const res = await fetch(`${PROXY_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? ac.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init?.headers || {}),
      },
    });
    if (res.status === 502 || res.status === 504) {
      throw new Error('Broker bridge unavailable');
    }
    return res;
  } catch (err) {
    throw new Error(
      err instanceof Error &&
      /certificate|Failed to fetch|network|abort|unavailable/i.test(err.message)
        ? 'Cannot reach the broker server right now. Please try again shortly.'
        : err instanceof Error
          ? err.message
          : 'Broker server unreachable',
    );
  } finally {
    window.clearTimeout(timer);
  }
}

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

/** Turn raw broker API failures into honest, readable messages */
function brokerError(status: number, data: unknown, fallback: string): Error {
  const text = typeof data === 'string' ? data : '';
  if (status === 503 || /service is unavailable/i.test(text)) {
    return new Error(
      'The broker service is temporarily offline (server maintenance). This is not your internet — try again in a few minutes.',
    );
  }
  return new Error(text || fallback);
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

/** Search broker companies via swagger /Search */
export async function searchBrokers(company: string): Promise<Mt5Company[]> {
  const q = company.trim();
  if (q.length < 2) return [];

  const res = await mt5Fetch(`/Search?company=${encodeURIComponent(q)}`);
  const data = await readBody(res);
  if (!res.ok) {
    return [];
  }
  return Array.isArray(data) ? (data as Mt5Company[]) : [];
}

/**
 * Connect via backend bridge — swagger ConnectEx only.
 * Returns session token for further /Account* and /OrderSend calls.
 */
export async function connectEx(input: {
  user: string | number;
  password: string;
  server: string;
}): Promise<string> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch('/api/mt5/connect', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: String(input.user).trim(),
        password: input.password,
        server: input.server.trim(),
      }),
      signal: ac.signal,
    });
    const data = await readBody(res);
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error?: string }).error || '')
          : typeof data === 'string'
            ? data
            : '';
      throw brokerError(res.status, data, msg || `Connect failed (${res.status})`);
    }
    const token =
      data && typeof data === 'object' && 'token' in data
        ? String((data as { token?: string }).token || '').trim()
        : typeof data === 'string'
          ? data.trim()
          : '';
    if (!token || /error|fail|invalid/i.test(token)) {
      throw new Error(token || 'Connect failed — no session token returned');
    }
    return token.replace(/^"|"$/g, '');
  } catch (err) {
    if (err instanceof Error && /abort/i.test(err.message)) {
      throw new Error('Not connecting');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
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
 * Send market order via swagger MT5 bridge (/OrderSend).
 * Comment format: "{EA name} Lumo~edge"
 */
export async function orderSend(input: {
  id: string;
  symbol: string;
  operation: Mt5OrderOperation;
  volume: number;
  comment?: string;
  slippage?: number;
  stopLoss?: number;
  takeProfit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams({
    id: input.id,
    symbol: input.symbol.trim(),
    operation: input.operation,
    volume: String(input.volume),
  });
  if (input.comment) params.set('comment', input.comment.slice(0, 31));
  if (input.slippage != null) params.set('slippage', String(input.slippage));
  if (input.stopLoss && input.stopLoss > 0) {
    params.set('stoploss', String(input.stopLoss));
  }
  if (input.takeProfit && input.takeProfit > 0) {
    params.set('takeprofit', String(input.takeProfit));
  }
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
