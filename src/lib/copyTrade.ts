import { fetchBrokerSymbols, formatCopyTradeComment, orderSend } from './mt5Api';
import { resolveBrokerSymbol } from './symbolVerify';
import { getMt5Token } from './mt5Session';
import { findInVault, loadJSON, normalizeLicenseKey } from './storage';

export type CopyOrderPayload = {
  id: string;
  eaId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  stopLoss: number;
  takeProfit: number;
  comment: string;
  trades: number;
  createdAt?: string;
};

const PROCESSED_KEY = 'ub-web/copy-processed-v1';
const OWNER_KEY = 'ub-web/copy-owner-v1';

function loadProcessed(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PROCESSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function markProcessed(mentorId: string, orderId: string) {
  const all = loadProcessed();
  const list = all[mentorId] || [];
  if (!list.includes(orderId)) {
    all[mentorId] = [orderId, ...list].slice(0, 100);
    localStorage.setItem(PROCESSED_KEY, JSON.stringify(all));
  }
}

export function isCopyOrderProcessed(mentorId: string, orderId: string): boolean {
  return (loadProcessed()[mentorId] || []).includes(orderId);
}

/** Remember mentor owner id for a license key (survives slim vault rows). */
export function rememberLicenseOwner(licenseKey: string, ownerAdminId: string) {
  const key = normalizeLicenseKey(licenseKey);
  const owner = String(ownerAdminId || '').trim();
  if (!key || !owner) return;
  const all = loadJSON<Record<string, string>>(OWNER_KEY, {});
  all[key] = owner;
  localStorage.setItem(OWNER_KEY, JSON.stringify(all));
}

/** Resolve mentor admin id from the client's active license key. */
export function mentorIdForLicense(licenseKey: string): string {
  const key = normalizeLicenseKey(licenseKey);
  if (!key) return '';
  const hit = findInVault(key);
  if (hit?.ownerAdminId) return hit.ownerAdminId;
  const owners = loadJSON<Record<string, string>>(OWNER_KEY, {});
  return owners[key] || '';
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function seedProcessedOrders(mentorId: string, orderIds: string[]) {
  const all = loadProcessed();
  const merged = [...new Set([...(all[mentorId] || []), ...orderIds.filter(Boolean)])];
  all[mentorId] = merged.slice(0, 100);
  localStorage.setItem(PROCESSED_KEY, JSON.stringify(all));
}

/** Sort copy orders newest first (id embeds timestamp). */
export function sortCopyOrders<T extends { id?: unknown }>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const ai = Number(String(a.id || '').replace(/^ord-/, '')) || 0;
    const bi = Number(String(b.id || '').replace(/^ord-/, '')) || 0;
    return bi - ai;
  });
}

/** Execute a copy order on this client's MT5 session. */
export async function executeCopyOrder(input: {
  email: string;
  eaName: string;
  order: CopyOrderPayload;
  mentorId: string;
}): Promise<{ ok: boolean; message: string }> {
  const token = getMt5Token(input.email);
  if (!token) {
    return { ok: false, message: 'Connect MetaTrader to receive copy trades.' };
  }

  if (isCopyOrderProcessed(input.mentorId, input.order.id)) {
    return { ok: true, message: 'Already copied' };
  }

  const operation = input.order.side === 'sell' ? 'Sell' : 'Buy';
  const volume = Math.max(0.01, Number(input.order.volume) || 0.01);
  const count = Math.max(1, Math.min(50, Math.round(input.order.trades) || 1));
  let symbol = String(input.order.symbol || 'XAUUSD').trim().toUpperCase();
  const comment = formatCopyTradeComment(input.eaName, input.order.comment);
  const sl = Number(input.order.stopLoss) || undefined;
  const tp = Number(input.order.takeProfit) || undefined;

  // Alert mentor group as soon as this client starts copying the trade
  void import('./telegramNotify').then(({ notifyMentorTelegramTrade }) => {
    notifyMentorTelegramTrade({
      mentorId: input.mentorId,
      symbol,
      side: input.order.side,
      entry: undefined,
      stopLoss: sl,
      takeProfit: tp,
      volume,
      trades: count,
      eaName: input.eaName,
      source: 'Copy Trade Auto',
    });
  });

  try {
    const brokerSymbols = await fetchBrokerSymbols(token);
    const match = resolveBrokerSymbol(symbol, brokerSymbols);
    if (match.symbol) {
      symbol = match.symbol;
    } else if (brokerSymbols.length > 0) {
      return { ok: false, message: match.message || `Symbol ${symbol} not on broker.` };
    }
  } catch {
    // broker list unavailable — try raw symbol
  }

  let ok = 0;
  let lastErr = '';
  for (let i = 0; i < count; i += 1) {
    try {
      await orderSend({
        id: token,
        symbol,
        operation,
        volume,
        comment,
        slippage: 10000,
        stopLoss: sl && sl > 0 ? sl : undefined,
        takeProfit: tp && tp > 0 ? tp : undefined,
      });
      ok += 1;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'Copy trade failed';
      break;
    }
    if (i < count - 1) await wait(250);
  }

  if (ok > 0) {
    markProcessed(input.mentorId, input.order.id);
    return {
      ok: true,
      message: `Copied ${ok}/${count} ${operation} ${symbol}`,
    };
  }
  return { ok: false, message: lastErr || 'Copy trade failed on MT5' };
}
