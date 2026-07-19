/** Disk-backed API — survives Cloudflare URL changes */

export type RemoteDb = {
  auth: { admins: unknown[]; admin: unknown | null };
  store: { workspaces: Record<string, unknown> };
  vault: unknown[];
  images: Record<string, string>;
  clients: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    notifiedAt?: string;
  }>;
  sessions: Record<string, unknown>;
  revokedKeys?: string[];
  updatedAt?: string;
};

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
  try {
    return await req<RemoteDb>('/api/db');
  } catch {
    return null;
  }
}

export async function pushDb(partial: Partial<RemoteDb>): Promise<RemoteDb | null> {
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
  return req<RemoteDb['clients'][number]>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchClient(
  id: string,
  patch: { status?: 'pending' | 'approved' | 'rejected' },
) {
  return req<RemoteDb['clients'][number] | null>(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteClientRemote(id: string) {
  return req<{ ok: boolean; removed: number }>(`/api/clients/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchSession<T>(email: string): Promise<T | null> {
  try {
    return await req<T | null>(`/api/sessions/${encodeURIComponent(email.toLowerCase())}`);
  } catch {
    return null;
  }
}

export async function pushSession(email: string, session: unknown) {
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
  try {
    const r = await fetch('/api/health');
    return r.ok;
  } catch {
    return false;
  }
}
