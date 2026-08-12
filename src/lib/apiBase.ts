/** Live production origin — used by the Capacitor shell for /api calls. */
export const LIVE_APP_ORIGIN = 'https://lumoedge.com';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
  }
}

/** True inside the Android/iOS Capacitor WebView (not the public website). */
export function isNativeShell(): boolean {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Resolve app API paths for web + Capacitor.
 * Capacitor can fake origin as lumoedge.com while still serving local assets,
 * so relative `/api/...` would 404 — pin those to the live host.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return p;
  if (!p.startsWith('/api')) return p;
  if (isNativeShell()) return `${LIVE_APP_ORIGIN}${p}`;
  return p;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}
