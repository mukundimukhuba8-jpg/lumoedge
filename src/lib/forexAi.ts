/** Lumo assistant — forex/trading only. Rejects personal / people topics. */

const FOREX_HINT =
  /\b(forex|fx|trade|trading|eurusd|gbpusd|usdjpy|xauusd|gold|silver|pair|pairs|pip|pips|lot|lots|leverage|broker|mt5|metatrader|chart|candle|support|resistance|trend|bullish|bearish|entry|sl|tp|stop\s*loss|take\s*profit|scalp|swing|market|liquidity|spread|swap|margin|ea|expert\s*advisor|signal|buy|sell|long|short|volatility|session|london|ny|tokyo|rsi|macd|ema|sma|fibonacci|order\s*block)\b/i;

const PEOPLE_HINT =
  /\b(who\s+is|who\s+are|person|people|celebrity|girlfriend|boyfriend|wife|husband|family|friend|president|politician|actor|singer|age|birthday|address|phone|email\s+of|personal|private\s+life|dating|relationship)\b/i;

export function isForexQuestion(input: string): boolean {
  const q = String(input || '').trim();
  if (!q) return false;
  if (PEOPLE_HINT.test(q) && !FOREX_HINT.test(q)) return false;
  return FOREX_HINT.test(q);
}

export function lumoForexReply(input: string): string {
  const q = String(input || '').trim();
  if (!q) {
    return 'Ask me about forex pairs, charts, risk, or trade setups.';
  }
  if (PEOPLE_HINT.test(q) && !FOREX_HINT.test(q)) {
    return 'I only answer forex and trading questions — not questions about people.';
  }
  if (!FOREX_HINT.test(q)) {
    return 'I only cover forex markets, charts, and trade management. Try asking about a pair, setup, or risk.';
  }
  if (/\bxau|gold\b/i.test(q)) {
    return 'XAUUSD often respects session liquidity. Wait for London/NY overlap confirmation before sizing up.';
  }
  if (/\beurusd|cable|gbpusd|usdjpy|pair\b/i.test(q)) {
    return 'Focus on higher-timeframe bias, then execute on your entry timeframe with clear SL beyond structure.';
  }
  if (/\brisk|lot|lots|leverage|margin\b/i.test(q)) {
    return 'Keep risk small per trade (often 0.5–1%). Lot size should follow stop distance, not emotion.';
  }
  if (/\bsl|tp|stop|take\s*profit\b/i.test(q)) {
    return 'Place stops beyond invalidation, not arbitrary pips. Targets should map to next liquidity or RR ≥ 1.5.';
  }
  return 'Stay process-driven: bias → location → confirmation → defined risk. I can help refine that forex plan.';
}

export function defaultForexBootLines(eaName: string, isPaused: boolean): string[] {
  return [
    'Connecting to Unlimited Bull...',
    'License verified.',
    `${eaName} ${isPaused ? 'is paused' : 'is online'}.`,
    'Forex assistant standing by.',
    'Ask about pairs, charts, or risk — not people.',
    'AI ready.',
  ];
}
