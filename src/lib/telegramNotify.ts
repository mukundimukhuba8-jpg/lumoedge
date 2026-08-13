import { apiUrl } from './apiBase';

export type TelegramTradeAlert = {
  mentorId: string;
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
};

/** Fire-and-forget mentor Telegram alert when Auto Trade starts. */
export function notifyMentorTelegramTrade(alert: TelegramTradeAlert): void {
  const mentorId = String(alert.mentorId || '').trim();
  if (!mentorId) return;
  void fetch(apiUrl('/api/telegram/notify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alert),
  }).catch(() => {
    /* never block trading */
  });
}
