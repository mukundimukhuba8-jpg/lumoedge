const SUFFIXES = ['', '.M', '.m', '.PRO', '.pro', '.STD', '.std', '.R', '.r', '.ECN', '.RAW', '.I', '.SB'];

/** Match AI-detected symbol to broker instruments (exact + suffix variants). */
export function resolveBrokerSymbol(
  detected: string,
  brokerSymbols: string[],
): { symbol: string | null; message: string } {
  const raw = String(detected || '').trim().toUpperCase();
  if (!raw) {
    return { symbol: null, message: 'No symbol detected on the chart.' };
  }
  if (!brokerSymbols.length) {
    return { symbol: raw, message: 'Broker list unavailable — using detected symbol.' };
  }

  const byUpper = new Map(brokerSymbols.map((s) => [s.toUpperCase(), s]));
  if (byUpper.has(raw)) {
    return { symbol: byUpper.get(raw)!, message: `Exact match: ${byUpper.get(raw)}` };
  }

  const stripped = raw.replace(/\.(M|PRO|STD|R|ECN|RAW|I|SB)$/i, '');
  const candidates = new Set<string>();
  for (const base of [raw, stripped]) {
    for (const suf of SUFFIXES) {
      candidates.add(`${base}${suf}`.toUpperCase());
      candidates.add(`${base}${suf}`.replace(/^\./, ''));
    }
  }

  for (const c of candidates) {
    const hit = byUpper.get(c);
    if (hit) {
      return {
        symbol: hit,
        message: hit.toUpperCase() === raw ? `Verified ${hit}` : `Mapped ${raw} → ${hit}`,
      };
    }
  }

  const close = brokerSymbols.filter((s) => {
    const u = s.toUpperCase();
    return u.includes(stripped) || stripped.includes(u.replace(/\./g, ''));
  });
  if (close.length === 1) {
    return { symbol: close[0], message: `Closest broker match: ${close[0]}` };
  }
  if (close.length > 1) {
    return {
      symbol: null,
      message: `Symbol "${raw}" is ambiguous on this broker (${close.slice(0, 4).join(', ')}…).`,
    };
  }

  return {
    symbol: null,
    message: `Symbol "${raw}" is not available on this broker account.`,
  };
}
