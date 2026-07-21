/** Single source of truth helpers for client subscription approval status. */

export type ClientApprovalStatus = 'pending' | 'approved' | 'rejected';

export function normalizeClientStatus(raw: unknown): ClientApprovalStatus {
  const value = String(raw ?? 'pending')
    .trim()
    .toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  return 'pending';
}

export function pickClientStatus(
  a: unknown,
  b: unknown,
): ClientApprovalStatus {
  const left = normalizeClientStatus(a);
  const right = normalizeClientStatus(b);
  if (left === 'approved' || right === 'approved') return 'approved';
  if (left === 'pending' || right === 'pending') return 'pending';
  return 'rejected';
}

export function countClientQueue<
  T extends { status?: unknown },
>(list: T[]) {
  let pending = 0;
  let approved = 0;
  for (const item of list) {
    const status = normalizeClientStatus(item.status);
    if (status === 'pending') pending += 1;
    else if (status === 'approved') approved += 1;
  }
  return { total: list.length, pending, approved };
}
