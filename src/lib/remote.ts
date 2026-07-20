/** Shared remote API — Firebase first, then Vercel/local /api fallback */

import {
  firebaseDeleteClient,
  firebaseFetchAdmins,
  firebaseFetchClients,
  firebaseFetchDb,
  firebaseFetchSession,
  firebaseHealthy,
  firebasePatchClient,
  firebasePostClient,
  firebasePostMentorRegistration,
  firebasePushDb,
  firebasePushSession,
  type RemoteDb,
} from './firebaseDb';
import { isFirebaseConfigured } from './firebase';

export type { RemoteDb };

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const FETCH_DB_TIMEOUT_MS = 6000;

function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

export async function fetchDb(): Promise<RemoteDb | null> {
  const work = async (): Promise<RemoteDb | null> => {
    if (isFirebaseConfigured()) {
      const fb = await firebaseFetchDb();
      if (fb) return fb;
    }
    try {
      return await req<RemoteDb>('/api/db');
    } catch {
      return null;
    }
  };
  return fetchWithTimeout(work(), FETCH_DB_TIMEOUT_MS);
}

export type PublishLicensesResult =
  | { ok: true; key?: string }
  | { ok: false; error: string; status?: number };

export type ClaimLicenseRemoteResult =
  | { ok: true; license: Record<string, unknown> }
  | { ok: false; error: string; retryable?: boolean; status?: number };

const PUBLISH_TIMEOUT_MS = 45_000;
const CLAIM_TIMEOUT_MS = 6_000;
const CLAIM_HARD_CAP_MS = 8_000;

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, data };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function publishLicensesRemote(input: {
  adminId: string;
  vaultEntries: unknown[];
  workspace: unknown;
  revokedKeys?: string[];
}): Promise<PublishLicensesResult> {
  try {
    const { res, data } = await fetchJsonWithTimeout(
      '/api/licenses/publish',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      PUBLISH_TIMEOUT_MS,
    );
    if (res.ok && data.ok !== false) {
      return { ok: true, key: typeof data.key === 'string' ? data.key : undefined };
    }
    return {
      ok: false,
      error:
        (typeof data.error === 'string' && data.error) ||
        `Could not publish license (${res.status})`,
      status: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error while saving license',
    };
  }
}

async function claimLicenseRemoteOnce(
  key: string,
  email: string,
): Promise<ClaimLicenseRemoteResult> {
  try {
    const { res, data } = await fetchJsonWithTimeout(
      '/api/licenses/claim',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, email }),
      },
      CLAIM_TIMEOUT_MS,
    );
    if (res.ok && data.ok !== false && data.license && typeof data.license === 'object') {
      return { ok: true, license: data.license as Record<string, unknown> };
    }
    const error =
      (typeof data.error === 'string' && data.error) ||
      `Activation failed (${res.status})`;
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    return { ok: false, error, retryable, status: res.status };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? 'Activation timed out. Check your connection and try again.'
        : err instanceof Error
          ? err.message
          : 'Network error during activation',
      retryable: true,
    };
  }
}

export async function claimLicenseRemote(
  key: string,
  email: string,
): Promise<ClaimLicenseRemoteResult> {
  return Promise.race([
    claimLicenseRemoteOnce(key, email),
    new Promise<ClaimLicenseRemoteResult>((resolve) =>
      window.setTimeout(
        () =>
          resolve({
            ok: false,
            error: 'Activation timed out. Check your connection and try again.',
            retryable: true,
          }),
        CLAIM_HARD_CAP_MS,
      ),
    ),
  ]);
}

export async function pushDb(partial: Partial<RemoteDb>): Promise<RemoteDb | null> {
  if (isFirebaseConfigured()) {
    const fb = await firebasePushDb(partial);
    if (fb) {
      // Best-effort mirror to /api for local/dev tools
      void req<RemoteDb>('/api/db', {
        method: 'PUT',
        body: JSON.stringify(partial),
      }).catch(() => null);
      return fb;
    }
  }
  try {
    return await req<RemoteDb>('/api/db', {
      method: 'PUT',
      body: JSON.stringify(partial),
    });
  } catch {
    return null;
  }
}

export async function fetchClients() {
  if (isFirebaseConfigured()) {
    const fb = await firebaseFetchClients();
    if (fb) return fb;
  }
  try {
    return await req<RemoteDb['clients']>('/api/clients');
  } catch {
    return null;
  }
}

export async function fetchAdmins() {
  if (isFirebaseConfigured()) {
    const fb = await firebaseFetchAdmins();
    if (fb) return fb;
  }
  try {
    return await req<RemoteDb['auth']['admins']>('/api/auth/admins');
  } catch {
    return null;
  }
}

export async function postMentorRegistration(input: {
  email: string;
  password: string;
  fullName: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}) {
  try {
    const created = await req<Record<string, unknown>>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (created) return created;
  } catch {
    // fall through to direct Firebase write
  }
  if (isFirebaseConfigured()) {
    const fb = await firebasePostMentorRegistration(input);
    if (fb) return fb;
  }
  return null;
}

export async function postClient(input: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  if (isFirebaseConfigured()) {
    const fb = await firebasePostClient(input);
    if (fb) return fb;
  }
  return req<RemoteDb['clients'][number]>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchClient(
  id: string,
  patch: {
    status?: 'pending' | 'approved' | 'rejected';
    paymentClaimed?: boolean;
    paymentClaimedAt?: string;
  },
) {
  if (isFirebaseConfigured()) {
    const fb = await firebasePatchClient(id, patch);
    if (fb) return fb;
  }
  return req<RemoteDb['clients'][number] | null>(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteClientRemote(id: string) {
  if (isFirebaseConfigured()) {
    const fb = await firebaseDeleteClient(id);
    if (fb) return fb;
  }
  return req<{ ok: boolean; removed: number }>(`/api/clients/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchSession<T>(email: string): Promise<T | null> {
  if (isFirebaseConfigured()) {
    const fb = await firebaseFetchSession<T>(email);
    if (fb) return fb;
  }
  try {
    return await req<T | null>(`/api/sessions/${encodeURIComponent(email.toLowerCase())}`);
  } catch {
    return null;
  }
}

export async function pushSession(email: string, session: unknown) {
  if (isFirebaseConfigured()) {
    const ok = await firebasePushSession(email, session);
    if (ok) return;
  }
  try {
    await req(`/api/sessions/${encodeURIComponent(email.toLowerCase())}`, {
      method: 'PUT',
      body: JSON.stringify(session),
    });
  } catch {
    // offline / static host fallback
  }
}

export async function apiHealthy() {
  if (isFirebaseConfigured() && (await firebaseHealthy())) return true;
  try {
    const r = await fetch('/api/health');
    return r.ok;
  } catch {
    return false;
  }
}
