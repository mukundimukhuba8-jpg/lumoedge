import { LIVE_APP_ORIGIN, apiUrl, isNativeShell } from './apiBase';

export const COPY_TRADE_MODE = 'hybrid' as const;

/** Public API base used in MT5 WebRequest allowlist (no trailing slash). */
export function getCopyApiBaseUrl(): string {
  const env = String(import.meta.env.VITE_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  if (typeof window !== 'undefined' && isNativeShell()) {
    return LIVE_APP_ORIGIN;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return LIVE_APP_ORIGIN;
}

export function getWebRequestAllowlistUrl(): string {
  return getCopyApiBaseUrl();
}

export const COPY_SCRIPT_PATH = '/LumoEdgeCopy.mq5';

export function getCopyScriptUrl(): string {
  if (typeof window !== 'undefined' && isNativeShell()) {
    return `${LIVE_APP_ORIGIN}${COPY_SCRIPT_PATH}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${COPY_SCRIPT_PATH}`;
  }
  return `${LIVE_APP_ORIGIN}${COPY_SCRIPT_PATH}`;
}

export async function registerCopyTerminal(input: {
  copyEaId: string;
  licenseKey: string;
  email?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl('/api/copy/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    return { ok: Boolean(data.ok), error: data.error };
  } catch {
    return { ok: false, error: 'Could not reach Lumo Edge API' };
  }
}
