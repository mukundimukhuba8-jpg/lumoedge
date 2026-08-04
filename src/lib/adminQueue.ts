/** Single source of truth helpers for mentor/admin approval roles. */

export type AdminApprovalRole = 'super' | 'admin' | 'pending';

export function normalizeAdminRole(raw: unknown): AdminApprovalRole {
  const value = String(raw ?? 'pending')
    .trim()
    .toLowerCase();
  if (value === 'super') return 'super';
  if (value === 'admin') return 'admin';
  return 'pending';
}

export function pickAdminRole(a: unknown, b: unknown): AdminApprovalRole {
  const left = normalizeAdminRole(a);
  const right = normalizeAdminRole(b);
  const rank = (role: AdminApprovalRole) =>
    role === 'super' ? 3 : role === 'admin' ? 2 : 1;
  return rank(left) >= rank(right) ? left : right;
}

export function isApprovedAdminRole(raw: unknown): boolean {
  return normalizeAdminRole(raw) === 'admin';
}

type AdminLike = { email?: string; role?: unknown; id?: string; password?: unknown; [key: string]: unknown };

function listAdmins<T extends AdminLike>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Role merge for live sync — never demote an approved mentor back to pending.
 * (Old "live pending beats backup admin" blocked approved mentors from logging in
 * whenever Firebase briefly lagged or an approve write used the wrong id.)
 */
export function pickAdminRoleLive(liveRole: unknown, backupRole: unknown): AdminApprovalRole {
  return pickAdminRole(liveRole, backupRole);
}

/** Merge mentor lists — preserve Firebase id/password; never demote admin → pending. */
export function mergeAdminsLive<T extends AdminLike>(live: T[], backup: T[]): T[] {
  const byEmail = new Map<string, T>();
  for (const item of listAdmins(live)) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) } as T);
  }
  for (const item of listAdmins(backup)) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email, role: normalizeAdminRole(item.role) } as T);
      continue;
    }
    const merged = { ...prev, ...item, email } as T;
    merged.role = pickAdminRole(prev.role, item.role) as T['role'];
    // Keep the live Firebase id so approve-by-id keeps matching
    if (prev.id) merged.id = prev.id;
    const livePass = String(prev.password || '');
    const backupPass = String(item.password || '');
    if (livePass || backupPass) {
      (merged as AdminLike).password = livePass || backupPass;
    }
    for (const [k, v] of Object.entries(prev)) {
      const nextVal = (item as Record<string, unknown>)[k];
      if ((nextVal === '' || nextVal == null) && v !== '' && v != null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
    byEmail.set(email, merged);
  }
  return Array.from(byEmail.values());
}

/** Sync mentor queue for Super Admin — keep orphan pending; never demote admin. */
export function mergeAdminsForApprovalSync<T extends AdminLike>(
  local: T[],
  remote: T[],
): T[] {
  const merged = mergeAdminsLive(remote, local);
  const byEmail = new Map<string, T>();

  for (const a of merged) {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...a, email, role: normalizeAdminRole(a.role) } as T);
  }

  // Keep local pending mentors that remote has not received yet
  for (const a of listAdmins(local)) {
    const email = String(a.email || '').trim().toLowerCase();
    if (!email || normalizeAdminRole(a.role) !== 'pending') continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, { ...a, email, role: 'pending' } as T);
    }
  }

  return Array.from(byEmail.values());
}

export function countAdminQueue<T extends { role?: unknown }>(list: T[]) {
  let pending = 0;
  let approved = 0;
  for (const item of listAdmins(list)) {
    const role = normalizeAdminRole(item.role);
    if (role === 'pending') pending += 1;
    else if (role === 'admin') approved += 1;
  }
  return { total: listAdmins(list).length, pending, approved };
}
