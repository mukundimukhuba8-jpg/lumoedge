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
