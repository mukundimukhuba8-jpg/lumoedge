import { buildTradeComment, orderSend } from './mt5Api';
import { getMt5Token } from './mt5Session';
import { findInVault } from './storage';

export type CopyOrderPayload = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  stopLoss: number;
  takeProfit: number;
  comment: string;
  trades: number;
};

const PROCESSED_KEY = 'ub-web/copy-processed-v1';

function loadProcessed(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PROCESSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function markProcessed(mentorId: string, orderId: string) {
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

/** Resolve mentor admin id from the client's active license key. */
export function mentorIdForLicense(licenseKey: string): string {
  const hit = findInVault(licenseKey);
  return hit?.ownerAdminId || '';
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function seedProcessedOrders(mentorId: string, orderIds: string[]) {
  const all = loadProcessed();
  const merged = [...new Set([...(all[mentorId] || []), ...orderIds.filter(Boolean)])];
  all[mentorId] = merged.slice(0, 100);
  localStorage.setItem(PROCESSED_KEY, JSON.stringify(all));
}

/** Execute a mentor copy order on this client's MT5 session. */
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
  const symbol = String(input.order.symbol || 'XAUUSD').trim().toUpperCase();
  const comment = (input.order.comment || buildTradeComment(input.eaName)).slice(0, 31);
  const sl = Number(input.order.stopLoss) || undefined;
  const tp = Number(input.order.takeProfit) || undefined;

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
