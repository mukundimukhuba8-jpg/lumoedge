import { apiUrl } from './apiBase';
import { normalizeLicenseKey } from './storage';

/** Only these Super Admin license keys may post Chart Scanner trades to Telegram. */
export const TELEGRAM_ALERT_LICENSE_KEYS = [
  'LUMO-JSDZ-8MC4-P4R3',
  'LUMO-WB5J-4YBH-RK8P',
] as const;

const SCANNER_TG_PREF = 'lumo-scanner-telegram-on';

/** Accept raw token or a pasted api.telegram.org/bot<token>/... URL. */
export function normalizeTelegramBotToken(raw: string): string {
  let v = String(raw || '').trim();
  if (!v) return '';
  const fromUrl = v.match(
    /(?:https?:\/\/)?api\.telegram\.org\/bot([0-9]+:[A-Za-z0-9_-]+)/i,
  );
  if (fromUrl?.[1]) return fromUrl[1].trim();
  v = v.replace(/^bot/i, '').trim();
  // Drop trailing path if user pasted token/getUpdates
  v = v.split('/')[0]?.trim() || v;
  return v;
}

export function normalizeTelegramChatId(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, '');
}

const ALLOWED = new Set(
  TELEGRAM_ALERT_LICENSE_KEYS.map((k) => normalizeLicenseKey(k)),
);

export function isTelegramAlertLicenseKey(licenseKey?: string): boolean {
  const key = normalizeLicenseKey(String(licenseKey || ''));
  return Boolean(key && ALLOWED.has(key));
}

/** Per-device Chart Scanner preference — trade alone when off. */
export function loadScannerTelegramPref(email?: string): boolean {
  try {
    const v = localStorage.getItem(`${SCANNER_TG_PREF}:${String(email || '').toLowerCase()}`);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function saveScannerTelegramPref(email: string | undefined, on: boolean) {
  try {
    localStorage.setItem(
      `${SCANNER_TG_PREF}:${String(email || '').toLowerCase()}`,
      on ? '1' : '0',
    );
  } catch {
    /* ignore */
  }
}

export type TelegramTradeAlert = {
  /** Required — must be one of TELEGRAM_ALERT_LICENSE_KEYS */
  licenseKey: string;
  mentorId?: string;
  symbol: string;
  side: 'buy' | 'sell' | string;
  entry?: string | number;
  stopLoss?: string | number;
  takeProfit?: string | number;
  volume?: string | number;
  trades?: number;
  eaName?: string;
  accuracy?: number;
  source?: string;
  /** Super Admin test button only */
  test?: boolean;
  /** Chart Scanner session toggle — false = trade alone */
  notify?: boolean;
};

/** Fire-and-forget Telegram alert (allowlisted license keys only). */
export function notifyMentorTelegramTrade(alert: TelegramTradeAlert): void {
  if (!alert.test && alert.notify === false) return;
  if (!alert.test && !isTelegramAlertLicenseKey(alert.licenseKey)) return;
  void fetch(apiUrl('/api/telegram/notify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alert),
  }).catch(() => {
    /* never block trading */
  });
}
