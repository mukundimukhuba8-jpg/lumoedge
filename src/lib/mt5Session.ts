/**
 * Shared MT5 broker session — keep-alive, auto-reconnect, live status.
 * Credentials for auto-reconnect are AES-GCM encrypted with a per-device key
 * (Web Crypto) so the raw password never sits in plain localStorage.
 */

import {
  accountDetails,
  accountSummary,
  checkConnect,
  connectEx,
  openedOrders,
  type Mt5AccountDetails,
  type Mt5AccountSummary,
  type Mt5OpenedOrder,
} from './mt5Api';
import { loadJSON, saveJSON } from './storage';

export type Mt5AccountSnapshot = {
  summary: Mt5AccountSummary | null;
  details: Mt5AccountDetails | null;
  positions: Mt5OpenedOrder[];
  updatedAt: number;
};

const ACCOUNT_CACHE_KEY = 'ub-web/mt5-account-cache-v1';
const ACCOUNT_REFRESH_MS = 20_000;

const emptyAccount = (): Mt5AccountSnapshot => ({
  summary: null,
  details: null,
  positions: [],
  updatedAt: 0,
});

export type Mt5ConnState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type Mt5SessionInfo = {
  state: Mt5ConnState;
  token: string;
  server: string;
  login: string;
  lastCheckedAt: number;
  lastError: string;
};

const SESSION_KEY = 'ub-web/mt5-session-v1';
const DEVICE_KEY = 'ub-web/mt5-device-key-v1';
const CHECK_INTERVAL_MS = 30_000;
const RECONNECT_BACKOFF_MS = [5_000, 15_000, 45_000];

type StoredSession = {
  server: string;
  login: string;
  token: string;
  /** base64(iv) . base64(ciphertext) — AES-GCM with device key */
  enc?: string;
};

type SessionStore = Record<string, StoredSession>;

// ---------- device-scoped crypto ----------

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function deviceKey(): Promise<CryptoKey> {
  let stored = localStorage.getItem(DEVICE_KEY);
  if (!stored) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    stored = b64(raw);
    localStorage.setItem(DEVICE_KEY, stored);
  }
  return crypto.subtle.importKey(
    'raw',
    fromB64(stored).buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecret(plain: string): Promise<string> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

async function decryptSecret(enc: string): Promise<string> {
  const [ivB64, ctB64] = enc.split('.');
  if (!ivB64 || !ctB64) return '';
  const key = await deviceKey();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as unknown as BufferSource },
    key,
    fromB64(ctB64).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}

// ---------- session store ----------

function emailKey(email?: string): string {
  return (email || '').trim().toLowerCase();
}

function loadStore(): SessionStore {
  return loadJSON<SessionStore>(SESSION_KEY, {});
}

function saveStore(store: SessionStore) {
  saveJSON(SESSION_KEY, store);
}

export async function saveMt5Session(
  email: string,
  input: { server: string; login: string; token: string; password?: string },
) {
  const store = loadStore();
  let enc: string | undefined;
  if (input.password) {
    try {
      enc = await encryptSecret(input.password);
    } catch {
      enc = undefined; // crypto unavailable — reconnect will require re-login
    }
  } else {
    enc = store[emailKey(email)]?.enc;
  }
  store[emailKey(email)] = {
    server: input.server,
    login: input.login,
    token: input.token,
    enc,
  };
  saveStore(store);
}

export function clearMt5Session(email: string) {
  const key = emailKey(email);
  const store = loadStore();
  delete store[key];
  saveStore(store);
  stopAccountRefresh(key);
  clearAccount(key);
  const s = sessions.get(key);
  if (s) {
    stopKeepAlive(key);
    s.info = { ...s.info, state: 'disconnected', token: '' };
    emit(key);
  }
}

export function getMt5Token(email?: string): string {
  const key = emailKey(email);
  const live = sessions.get(key);
  if (live?.info.token && live.info.state === 'connected') return live.info.token;
  return loadStore()[key]?.token || '';
}

// ---------- live session state + subscribers ----------

type LiveSession = {
  info: Mt5SessionInfo;
  account: Mt5AccountSnapshot;
  timer: number | null;
  accountTimer: number | null;
  reconnectAttempt: number;
  subscribers: Set<(info: Mt5SessionInfo) => void>;
  accountSubscribers: Set<(snap: Mt5AccountSnapshot) => void>;
  checking: boolean;
  refreshingAccount: boolean;
};

const sessions = new Map<string, LiveSession>();

function loadAccountCache(key: string): Mt5AccountSnapshot {
  const all = loadJSON<Record<string, Mt5AccountSnapshot>>(ACCOUNT_CACHE_KEY, {});
  return all[key] || emptyAccount();
}

function saveAccountCache(key: string, snap: Mt5AccountSnapshot) {
  const all = loadJSON<Record<string, Mt5AccountSnapshot>>(ACCOUNT_CACHE_KEY, {});
  all[key] = snap;
  saveJSON(ACCOUNT_CACHE_KEY, all);
}

function ensureLive(key: string): LiveSession {
  let s = sessions.get(key);
  if (!s) {
    const stored = loadStore()[key];
    s = {
      info: {
        state: stored?.token ? 'connecting' : 'disconnected',
        token: stored?.token || '',
        server: stored?.server || '',
        login: stored?.login || '',
        lastCheckedAt: 0,
        lastError: '',
      },
      account: loadAccountCache(key),
      timer: null,
      accountTimer: null,
      reconnectAttempt: 0,
      subscribers: new Set(),
      accountSubscribers: new Set(),
      checking: false,
      refreshingAccount: false,
    };
    sessions.set(key, s);
  }
  return s;
}

function emitAccount(key: string) {
  const s = sessions.get(key);
  if (!s) return;
  for (const cb of s.accountSubscribers) cb({ ...s.account });
}

export function getMt5AccountSnapshot(email?: string): Mt5AccountSnapshot {
  const key = emailKey(email);
  if (!key) return emptyAccount();
  const live = sessions.get(key);
  if (live?.account.updatedAt) return { ...live.account };
  return loadAccountCache(key);
}

export function subscribeMt5Account(
  email: string | undefined,
  cb: (snap: Mt5AccountSnapshot) => void,
): () => void {
  const key = emailKey(email);
  if (!key) return () => undefined;
  const s = ensureLive(key);
  s.accountSubscribers.add(cb);
  cb({ ...s.account });
  return () => {
    s.accountSubscribers.delete(cb);
  };
}

async function refreshMt5Account(key: string, token: string) {
  const s = ensureLive(key);
  if (!token || s.refreshingAccount) return;
  s.refreshingAccount = true;
  try {
    const [sum, det, pos] = await Promise.allSettled([
      accountSummary(token),
      accountDetails(token),
      openedOrders(token),
    ]);
    const next: Mt5AccountSnapshot = {
      summary: sum.status === 'fulfilled' ? sum.value : s.account.summary,
      details: det.status === 'fulfilled' ? det.value : s.account.details,
      positions: pos.status === 'fulfilled' ? pos.value : s.account.positions,
      updatedAt: Date.now(),
    };
    s.account = next;
    saveAccountCache(key, next);
    emitAccount(key);
  } finally {
    s.refreshingAccount = false;
  }
}

function stopAccountRefresh(key: string) {
  const s = sessions.get(key);
  if (s?.accountTimer != null) {
    window.clearInterval(s.accountTimer);
    s.accountTimer = null;
  }
}

function scheduleAccountRefresh(key: string) {
  const s = ensureLive(key);
  stopAccountRefresh(key);
  if (s.info.state !== 'connected' || !s.info.token) return;
  s.accountTimer = window.setInterval(() => {
    void refreshMt5Account(key, s.info.token);
  }, ACCOUNT_REFRESH_MS);
}

function clearAccount(key: string) {
  const s = ensureLive(key);
  s.account = emptyAccount();
  saveAccountCache(key, s.account);
  emitAccount(key);
}

function shouldKeepAlive(key: string): boolean {
  const stored = loadStore()[key];
  return Boolean(stored?.token || stored?.enc);
}

function emit(key: string) {
  const s = sessions.get(key);
  if (!s) return;
  for (const cb of s.subscribers) cb({ ...s.info });
}

export function subscribeMt5Status(
  email: string | undefined,
  cb: (info: Mt5SessionInfo) => void,
): () => void {
  const key = emailKey(email);
  if (!key) return () => undefined;
  const s = ensureLive(key);
  s.subscribers.add(cb);
  cb({ ...s.info });
  return () => {
    s.subscribers.delete(cb);
  };
}

// ---------- keep-alive + auto-reconnect ----------

async function verifyOrReconnect(key: string) {
  const s = ensureLive(key);
  if (s.checking) return;
  s.checking = true;
  try {
    const stored = loadStore()[key];
    const token = s.info.token || stored?.token || '';
    if (token) {
      const alive = await checkConnect(token).catch(() => false);
      s.info.lastCheckedAt = Date.now();
      if (alive) {
        s.info = { ...s.info, state: 'connected', token, lastError: '' };
        s.reconnectAttempt = 0;
        emit(key);
        void refreshMt5Account(key, token);
        scheduleAccountRefresh(key);
        return;
      }
    }
    // Token dead — try credential reconnect
    if (stored?.enc && stored.login && stored.server) {
      s.info = { ...s.info, state: 'reconnecting' };
      emit(key);
      try {
        const password = await decryptSecret(stored.enc);
        if (!password) throw new Error('Stored credentials unavailable');
        const fresh = await connectEx({
          user: stored.login,
          password,
          server: stored.server,
        });
        await saveMt5Session(key, {
          server: stored.server,
          login: stored.login,
          token: fresh,
        });
        s.info = {
          ...s.info,
          state: 'connected',
          token: fresh,
          lastError: '',
          lastCheckedAt: Date.now(),
        };
        s.reconnectAttempt = 0;
        emit(key);
        void refreshMt5Account(key, fresh);
        scheduleAccountRefresh(key);
        return;
      } catch (e) {
        s.reconnectAttempt += 1;
        s.info = {
          ...s.info,
          state: s.reconnectAttempt >= RECONNECT_BACKOFF_MS.length
            ? 'disconnected'
            : 'reconnecting',
          lastError: e instanceof Error ? e.message : 'Reconnect failed',
        };
        emit(key);
        return;
      }
    }
    s.info = {
      ...s.info,
      state: 'disconnected',
      lastError: token ? 'Session expired — sign in again' : '',
    };
    stopAccountRefresh(key);
    clearAccount(key);
    emit(key);
  } finally {
    s.checking = false;
  }
}

function stopKeepAlive(key: string) {
  const s = sessions.get(key);
  if (s?.timer != null) {
    window.clearTimeout(s.timer);
    s.timer = null;
  }
}

function scheduleNext(key: string) {
  const s = ensureLive(key);
  stopKeepAlive(key);
  const delay =
    s.info.state === 'reconnecting'
      ? RECONNECT_BACKOFF_MS[
          Math.min(s.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)
        ]
      : CHECK_INTERVAL_MS;
  s.timer = window.setTimeout(() => {
    void verifyOrReconnect(key).then(() => {
      if (shouldKeepAlive(key)) scheduleNext(key);
    });
  }, delay);
}

const LEGACY_MT5_KEY = 'ub-web/client-mt5-v1';

async function waitForVerify(key: string): Promise<void> {
  const s = ensureLive(key);
  if (!s.checking) return;
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (!s.checking) resolve();
      else window.setTimeout(tick, 40);
    };
    tick();
  });
}

/**
 * Verify the broker session (auto-reconnect when credentials exist) and return
 * a live token. Use before trade/symbol calls — avoids stale session ids.
 */
export async function ensureMt5Token(email?: string): Promise<string> {
  const key = emailKey(email);
  if (!key) return '';

  if (shouldKeepAlive(key)) {
    ensureLive(key);
    await waitForVerify(key);
    await verifyOrReconnect(key);
    const s = sessions.get(key);
    if (s?.info.state === 'connected' && s.info.token) return s.info.token;
    return '';
  }

  const legacy = loadJSON<
    Record<string, { connected?: boolean; token?: string }>
  >(LEGACY_MT5_KEY, {})[key];
  const token = String(legacy?.token || '').trim();
  if (!legacy?.connected || !token) return '';
  const alive = await checkConnect(token).catch(() => false);
  return alive ? token : '';
}

/** Start (or resume) keep-alive for this user. Safe to call repeatedly. */
export function startMt5KeepAlive(email?: string) {
  const key = emailKey(email);
  if (!key || !shouldKeepAlive(key)) return;
  ensureLive(key);
  void verifyOrReconnect(key).then(() => scheduleNext(key));
}

/** Refresh account summary/positions for a connected session. */
export function refreshMt5AccountNow(email?: string) {
  const key = emailKey(email);
  if (!key) return;
  const s = ensureLive(key);
  const token = s.info.token || loadStore()[key]?.token || '';
  if (token) void refreshMt5Account(key, token);
}

/** Stop the background timer (subscribers keep last status). */
export function stopMt5KeepAlive(email?: string) {
  const key = emailKey(email);
  if (key) stopKeepAlive(key);
}
