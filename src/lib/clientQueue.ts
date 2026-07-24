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

/** Live Firebase queue wins for pending — stale GitHub approved must not hide new registrations. */
export function pickClientStatusLive(
  live: unknown,
  backup: unknown,
): ClientApprovalStatus {
  const l = normalizeClientStatus(live);
  const b = normalizeClientStatus(backup);
  if (l === 'rejected') return 'rejected';
  if (l === 'approved') return 'approved';
  if (l === 'pending') return 'pending';
  return b;
}

export function mergeClientsLive<
  T extends ClientPaymentFields & { email?: string },
>(live: T[], backup: T[]): T[] {
  const byEmail = new Map<string, T>();
  for (const item of backup) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { ...item, email } as T);
  }
  for (const item of live) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev) {
      byEmail.set(email, { ...item, email } as T);
      continue;
    }
    byEmail.set(email, {
      ...prev,
      ...item,
      email,
      status: pickClientStatusLive(item.status, prev.status),
      ...mergeClientPaymentFields(prev, item),
    });
  }
  return [...byEmail.values()];
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

export type ClientPaymentFields = {
  status?: unknown;
  paymentClaimed?: boolean;
  paymentClaimedAt?: string;
  licenseReleasedAt?: string;
};

/** Merge payment flags — allow explicit false when a license is deleted. */
export function mergeClientPaymentFields<
  T extends ClientPaymentFields,
>(prev: T, incoming: Partial<T>): Pick<T, 'paymentClaimed' | 'paymentClaimedAt' | 'licenseReleasedAt'> {
  return {
    paymentClaimed:
      'paymentClaimed' in incoming
        ? Boolean(incoming.paymentClaimed)
        : Boolean(prev.paymentClaimed),
    paymentClaimedAt:
      'paymentClaimedAt' in incoming
        ? incoming.paymentClaimedAt || undefined
        : prev.paymentClaimedAt,
    licenseReleasedAt:
      'licenseReleasedAt' in incoming
        ? incoming.licenseReleasedAt || undefined
        : prev.licenseReleasedAt,
  };
}

/** True after license delete until payment is marked again. */
export function clientRepaymentRequired(
  client: ClientPaymentFields | null | undefined,
  requiresRepayment = false,
): boolean {
  if (requiresRepayment) return true;
  if (!client?.licenseReleasedAt) return false;
  return !client.paymentClaimed;
}

/** Whether the client may open the license key screen. */
export function clientCanEnterLicense(
  client: ClientPaymentFields | null | undefined,
  prepaid: boolean,
  requiresRepayment = false,
): boolean {
  if (clientRepaymentRequired(client, requiresRepayment)) {
    return (
      normalizeClientStatus(client?.status) === 'approved' && Boolean(client?.paymentClaimed)
    );
  }
  if (prepaid) return true;
  return normalizeClientStatus(client?.status) === 'approved' && Boolean(client?.paymentClaimed);
}
