/** Shared remote API — Firebase first, then Vercel/local /api fallback */

import {
  firebaseDeleteClient,
  firebaseFetchClients,
  firebaseFetchDb,
  firebaseFetchSession,
  firebaseHealthy,
  firebasePatchClient,
  firebasePostClient,
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

export async function fetchDb(): Promise<RemoteDb | null> {
  if (isFirebaseConfigured()) {
    const fb = await firebaseFetchDb();
    if (fb) return fb;
  }
  try {
    return await req<RemoteDb>('/api/db');
  } catch {
    return null;
  }
}

export async function publishLicensesRemote(input: {
  adminId: string;
  vaultEntries: unknown[];
  workspace: unknown;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/licenses/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
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
