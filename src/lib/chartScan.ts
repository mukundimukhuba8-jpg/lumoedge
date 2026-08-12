import { apiUrl } from './apiBase';
import { fetchDb, pushDb } from './remote';
import { loadJSON, saveJSON } from './storage';

export const DAILY_SCAN_LIMIT = 7;
export const MIN_SCAN_CONFIDENCE = 65;
export const SCAN_RESET_EVENT = 'ub-scan-reset';
export const SAST_TIMEZONE = 'Africa/Johannesburg';

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
  /** YYYY-MM-DD (SAST) -> remaining counts by email */
  days: Record<string, Record<string, number>>;
};

type HistoryStore = Record<string, ScanHistoryItem[]>;

type DayMarker = { day: string };

type ScanAdminSync = {
  quotaResetAll?: string;
  historyClearAll?: string;
  quotaResets?: Record<string, string>;
  historyClears?: Record<string, string>;
};

type ScanAdminApplied = {
  quotaResetAll?: string;
  historyClearAll?: string;
  quotaResets?: Record<string, string>;
  historyClears?: Record<string, string>;
};

const QUOTA_KEY = 'ub-web/scan-quota-v1';
const HISTORY_KEY = 'ub-web/scan-history-v1';
const DAY_MARKER_KEY = 'ub-web/scan-day-marker-v1';
const ADMIN_APPLIED_KEY = 'ub-web/scan-admin-applied-v1';

export function emailKey(email?: string) {
  return (email || 'guest').trim().toLowerCase() || 'guest';
}

/** Calendar day in South African Standard Time (YYYY-MM-DD). */
export function getSastDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function todayKey() {
  return getSastDayKey();
}

function loadAdminApplied(): ScanAdminApplied {
  return loadJSON<ScanAdminApplied>(ADMIN_APPLIED_KEY, {});
}

function saveAdminApplied(next: ScanAdminApplied) {
  saveJSON(ADMIN_APPLIED_KEY, next);
}

export function emitScanReset() {
  window.dispatchEvent(new CustomEvent(SCAN_RESET_EVENT));
}

/** Midnight SAST — clear history and daily quota for a new trading day. */
export function applyDailyResetIfNeeded(): boolean {
  const day = todayKey();
  const marker = loadJSON<DayMarker>(DAY_MARKER_KEY, { day: '' });
  if (marker.day === day) return false;

  saveJSON(HISTORY_KEY, {});
  saveJSON(QUOTA_KEY, { days: { [day]: {} } });
  saveJSON(DAY_MARKER_KEY, { day });
  emitScanReset();
  return true;
}

export function msUntilNextSastMidnight(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const elapsed =
    pick('hour') * 3600 + pick('minute') * 60 + pick('second');
  return Math.max(1000, (86400 - elapsed) * 1000 + 800);
}

export function scheduleSastMidnightReset(onReset: () => void): () => void {
  let timer: number | null = null;
  const schedule = () => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      applyDailyResetIfNeeded();
      onReset();
      schedule();
    }, msUntilNextSastMidnight());
  };
  schedule();
  return () => {
    if (timer != null) window.clearTimeout(timer);
  };
}

export function getScansLeft(email?: string): number {
  applyDailyResetIfNeeded();
  const store = loadJSON<QuotaStore>(QUOTA_KEY, { days: {} });
  const day = todayKey();
  const user = emailKey(email);
  const left = store.days[day]?.[user];
  if (typeof left === 'number') return Math.max(0, left);
  return DAILY_SCAN_LIMIT;
}

export function consumeScan(email?: string): number {
  applyDailyResetIfNeeded();
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
  for (const d of Object.keys(store.days)) {
    if (d !== day) delete store.days[d];
  }
  saveJSON(QUOTA_KEY, store);
  return next;
}

export function resetScanQuotaForUser(email: string) {
  applyDailyResetIfNeeded();
  const store = loadJSON<QuotaStore>(QUOTA_KEY, { days: {} });
  const day = todayKey();
  if (!store.days[day]) store.days[day] = {};
  store.days[day][emailKey(email)] = DAILY_SCAN_LIMIT;
  saveJSON(QUOTA_KEY, store);
  emitScanReset();
}

export function resetAllScanQuotasLocal() {
  applyDailyResetIfNeeded();
  const day = todayKey();
  saveJSON(QUOTA_KEY, { days: { [day]: {} } });
  emitScanReset();
}

export function loadScanHistory(email?: string): ScanHistoryItem[] {
  applyDailyResetIfNeeded();
  const all = loadJSON<HistoryStore>(HISTORY_KEY, {});
  return all[emailKey(email)] || [];
}

export function pushScanHistory(email: string | undefined, item: ScanHistoryItem) {
  applyDailyResetIfNeeded();
  const all = loadJSON<HistoryStore>(HISTORY_KEY, {});
  const key = emailKey(email);
  // Keep a tiny thumb only — full JPEG history froze Safari on saveJSON
  const rawImage = String(item.imageDataUrl || '');
  const slimImage =
    rawImage.startsWith('data:') && rawImage.length > 80_000
      ? rawImage.slice(0, 0) // drop oversized payload; preview not required for history list
      : rawImage.length > 120_000
        ? ''
        : rawImage;
  const slim: ScanHistoryItem = { ...item, imageDataUrl: slimImage };
  all[key] = [slim, ...(all[key] || [])].slice(0, 8);
  saveJSON(HISTORY_KEY, all);
  return all[key];
}

export function clearScanHistoryForUser(email: string) {
  const all = loadJSON<HistoryStore>(HISTORY_KEY, {});
  delete all[emailKey(email)];
  saveJSON(HISTORY_KEY, all);
  emitScanReset();
}

export function clearAllScanHistoryLocal() {
  saveJSON(HISTORY_KEY, {});
  emitScanReset();
}

function isNewer(ts: string | undefined, prev: string | undefined) {
  if (!ts) return false;
  if (!prev) return true;
  return Date.parse(ts) > Date.parse(prev);
}

/** Apply Super Admin scan resets pushed via shared DB — immediate on all devices. */
export function applyScanAdminFromRemote(
  scanAdmin: ScanAdminSync | undefined,
  email?: string,
): { quotaChanged: boolean; historyChanged: boolean } {
  if (!scanAdmin) return { quotaChanged: false, historyChanged: false };
  const user = emailKey(email);
  const applied = loadAdminApplied();
  let quotaChanged = false;
  let historyChanged = false;

  if (isNewer(scanAdmin.quotaResetAll, applied.quotaResetAll)) {
    resetAllScanQuotasLocal();
    applied.quotaResetAll = scanAdmin.quotaResetAll;
    quotaChanged = true;
  }

  const userQuotaTs = scanAdmin.quotaResets?.[user];
  if (isNewer(userQuotaTs, applied.quotaResets?.[user])) {
    if (email) resetScanQuotaForUser(email);
    applied.quotaResets = { ...(applied.quotaResets || {}), [user]: userQuotaTs! };
    quotaChanged = true;
  }

  if (isNewer(scanAdmin.historyClearAll, applied.historyClearAll)) {
    clearAllScanHistoryLocal();
    applied.historyClearAll = scanAdmin.historyClearAll;
    historyChanged = true;
  }

  const userHistoryTs = scanAdmin.historyClears?.[user];
  if (isNewer(userHistoryTs, applied.historyClears?.[user])) {
    if (email) clearScanHistoryForUser(email);
    applied.historyClears = { ...(applied.historyClears || {}), [user]: userHistoryTs! };
    historyChanged = true;
  }

  if (quotaChanged || historyChanged) {
    saveAdminApplied(applied);
    emitScanReset();
  }

  return { quotaChanged, historyChanged };
}

export async function syncScanRemoteAdmin(email?: string) {
  try {
    const db = await fetchDb();
    const scanAdmin = (db as { scanAdmin?: ScanAdminSync } | null)?.scanAdmin;
    return applyScanAdminFromRemote(scanAdmin, email);
  } catch {
    return { quotaChanged: false, historyChanged: false };
  }
}

export async function pushScanAdminReset(input: {
  email?: string;
  allUsers?: boolean;
  clearHistory?: boolean;
  clearHistoryAll?: boolean;
}) {
  const ts = new Date().toISOString();
  const db = await fetchDb();
  const prev = ((db as { scanAdmin?: ScanAdminSync } | null)?.scanAdmin ||
    {}) as ScanAdminSync;
  const next: ScanAdminSync = {
    quotaResets: { ...(prev.quotaResets || {}) },
    historyClears: { ...(prev.historyClears || {}) },
    quotaResetAll: prev.quotaResetAll,
    historyClearAll: prev.historyClearAll,
  };

  if (input.allUsers) {
    next.quotaResetAll = ts;
    resetAllScanQuotasLocal();
  } else if (input.email) {
    const key = emailKey(input.email);
    next.quotaResets = { ...(next.quotaResets || {}), [key]: ts };
    resetScanQuotaForUser(input.email);
  }

  if (input.clearHistoryAll) {
    next.historyClearAll = ts;
    clearAllScanHistoryLocal();
  } else if (input.clearHistory && input.email) {
    const key = emailKey(input.email);
    next.historyClears = { ...(next.historyClears || {}), [key]: ts };
    clearScanHistoryForUser(input.email);
  }

  await pushDb({ scanAdmin: next } as Partial<import('./firebaseDb').RemoteDb>);
  emitScanReset();
}

export function formatScanTime(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: SAST_TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(d);
  return { time, date };
}

export function scanResultStatus(accuracy: number): string {
  if (accuracy >= 80) return 'Strong';
  if (accuracy >= 65) return 'Complete';
  return 'Review';
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

const SCAN_TIMEOUT_MS = 55_000;

/** Call server OpenAPI/OpenAI vision proxy — always finishes (timeout / abort). */
export async function runChartScan(
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<ScanApiResult> {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) {
      return { ok: false, accuracy: 0, error: 'Scan cancelled.' };
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = window.setTimeout(() => ac.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl('/api/scan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
      signal: ac.signal,
    });
    const text = await res.text();
    let data: ScanApiResult;
    try {
      data = JSON.parse(text) as ScanApiResult;
    } catch {
      return {
        ok: false,
        accuracy: 0,
        error: 'Scanner unavailable. Please try again later.',
      };
    }
    if (!res.ok) {
      const msg = String(data?.error || '').trim();
      const safe =
        msg &&
        !/CHART_SCAN|Vercel|OpenAI|API key|redeploy|configured/i.test(msg)
          ? msg
          : 'Scanner unavailable. Please try again later.';
      return {
        ok: false,
        accuracy: 0,
        error: safe,
      };
    }
    return data;
  } catch (e) {
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    return {
      ok: false,
      accuracy: 0,
      error: aborted
        ? 'Scan timed out — try a clearer chart screenshot.'
        : 'Scanner unavailable. Please try again later.',
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
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
