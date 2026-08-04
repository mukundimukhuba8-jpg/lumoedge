import { loadJSON, saveJSONSafe } from './storage';

export type DashStatsCache = {
  adminId: string;
  activeLicenses: number;
  totalClients: number;
  pendingClients: number;
  deletedLicenses: number;
  approvedClients: number;
  firstName: string;
  mentorId: string;
  role: string;
  at: number;
};

const KEY = 'ub-web/admin-dash-stats-v1';

/** Offline-first dashboard numbers — paint instantly, sync later. */
export function loadDashStats(adminId: string): DashStatsCache | null {
  if (!adminId) return null;
  try {
    const cached = loadJSON<DashStatsCache | null>(KEY, null);
    if (!cached || cached.adminId !== adminId) return null;
    return cached;
  } catch {
    return null;
  }
}

export function saveDashStats(next: DashStatsCache) {
  if (!next.adminId) return;
  saveJSONSafe(KEY, next);
}
