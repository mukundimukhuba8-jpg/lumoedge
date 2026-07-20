import { loadJSON, saveJSON } from './storage';

export const DAILY_SCAN_LIMIT = 7;

export type TradeDirection = 'buy' | 'sell';

export type ScanHistoryItem = {
  id: string;
  imageDataUrl: string;
  accuracy: number;
  symbol?: string;
  timeframe?: string;
  direction?: TradeDirection;
  entryPrice?: number;
  stopLoss?: number;
  summary?: string;
  createdAt: string;
};

type QuotaStore = {
  /** YYYY-MM-DD -> remaining counts by email */
  days: Record<string, Record<string, number>>;
};

type HistoryStore = Record<string, ScanHistoryItem[]>;

const QUOTA_KEY = 'ub-web/scan-quota-v1';
const HISTORY_KEY = 'ub-web/scan-history-v1';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function emailKey(email?: string) {
  return (email || 'guest').trim().toLowerCase() || 'guest';
}

export function getScansLeft(email?: string): number {
  const store = loadJSON<QuotaStore>(QUOTA_KEY, { days: {} });
  const day = todayKey();
  const user = emailKey(email);
  const left = store.days[day]?.[user];
  if (typeof left === 'number') return Math.max(0, left);
  return DAILY_SCAN_LIMIT;
}

export function consumeScan(email?: string): number {
  const store = loadJSON<QuotaStore>(QUOTA_KEY, { days: {} });
  const day = todayKey();
  const user = emailKey(email);
  if (!store.days[day]) store.days[day] = {};
  const current =
    typeof store.days[day][user] === 'number'
      ? store.days[day][user]
      : DAILY_SCAN_LIMIT;
  const next = Math.max(0, current - 1);
  store.days[day][user] = next;
  // prune old days
  for (const d of Object.keys(store.days)) {
    if (d !== day) delete store.days[d];
  }
  saveJSON(QUOTA_KEY, store);
  return next;
}

export function loadScanHistory(email?: string): ScanHistoryItem[] {
  const all = loadJSON<HistoryStore>(HISTORY_KEY, {});
  return all[emailKey(email)] || [];
}

export function pushScanHistory(email: string | undefined, item: ScanHistoryItem) {
  const all = loadJSON<HistoryStore>(HISTORY_KEY, {});
  const key = emailKey(email);
  all[key] = [item, ...(all[key] || [])].slice(0, 40);
  saveJSON(HISTORY_KEY, all);
  return all[key];
}

export type ScanApiResult = {
  ok: boolean;
  accuracy: number;
  symbol?: string;
  timeframe?: string;
  direction?: TradeDirection;
  entryPrice?: number;
  stopLoss?: number;
  summary?: string;
  error?: string;
  demo?: boolean;
};

/**
 * Take-profit ladder from entry/stop by risk:reward.
 * 1 trade → 1:2 · 2 trades → 1:2, 1:3 · 3+ trades → 1:1, 1:2, 1:3
 */
export function buildTpLadder(
  entry: number,
  stopLoss: number,
  direction: TradeDirection,
  trades: number,
): number[] {
  if (!entry || !stopLoss || entry === stopLoss || trades < 1) return [];
  const risk = Math.abs(entry - stopLoss);
  const ratios =
    trades === 1 ? [2] : trades === 2 ? [2, 3] : [1, 2, 3];
  const decimals = Math.min(
    6,
    Math.max(
      (String(entry).split('.')[1] || '').length,
      (String(stopLoss).split('.')[1] || '').length,
    ),
  );
  const tps: number[] = [];
  for (let i = 0; i < trades; i += 1) {
    const rr = ratios[Math.min(i, ratios.length - 1)];
    const tp =
      direction === 'sell' ? entry - risk * rr : entry + risk * rr;
    tps.push(Number(tp.toFixed(decimals)));
  }
  return tps;
}

/** Call server OpenAPI/OpenAI vision proxy */
export async function runChartScan(imageDataUrl: string): Promise<ScanApiResult> {
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    const text = await res.text();
    let data: ScanApiResult;
    try {
      data = JSON.parse(text) as ScanApiResult;
    } catch {
      return {
        ok: false,
        accuracy: 0,
        error:
          res.status === 404
            ? 'Chart Scanner API not deployed yet. Redeploy the latest build.'
            : `Scan failed (${res.status})`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        accuracy: 0,
        error: data.error || `Scan failed (${res.status})`,
      };
    }
    return data;
  } catch (e) {
    return {
      ok: false,
      accuracy: 0,
      error: e instanceof Error ? e.message : 'Scan request failed',
    };
  }
}

/** Compress image file/blob to data URL for upload (smaller = faster scan) */
export async function fileToScanDataUrl(file: Blob, maxSide = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.78);
}
