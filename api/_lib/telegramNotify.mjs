function fmt(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

export function buildTelegramTradeMessage(input) {
  const side = String(input.side || '').toUpperCase() || '—';
  const symbol = String(input.symbol || '').toUpperCase() || '—';
  const ea = String(input.eaName || '').trim();
  const source = String(input.source || 'Auto Trade').trim();
  const lines = [
    `📡 ${source}`,
    ea ? `EA: ${ea}` : null,
    `${side} ${symbol}`,
    `Entry: ${fmt(input.entry)}`,
    `SL: ${fmt(input.stopLoss)}`,
    `TP: ${fmt(input.takeProfit)}`,
  ].filter(Boolean);
  if (input.volume != null && input.volume !== '') {
    lines.push(`Lot: ${fmt(input.volume)}`);
  }
  if (input.trades != null && Number(input.trades) > 1) {
    lines.push(`Trades: ${fmt(input.trades)}`);
  }
  if (input.accuracy != null && Number(input.accuracy) > 0) {
    lines.push(`Confidence: ${Math.round(Number(input.accuracy))}%`);
  }
  return lines.join('\n');
}

/** Send a text message to a Telegram chat via Bot API. */
export async function sendTelegramMessage(botToken, chatId, text) {
  const token = String(botToken || '').trim();
  const chat = String(chatId || '').trim();
  if (!token || !chat || !text) {
    return { ok: false, error: 'Telegram not configured' };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: String(text).slice(0, 3900),
      disable_web_page_preview: true,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error:
        (data && (data.description || data.error)) ||
        `Telegram HTTP ${res.status}`,
    };
  }
  return { ok: true };
}
