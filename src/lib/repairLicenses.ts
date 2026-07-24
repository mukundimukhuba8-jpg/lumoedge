import { dbList } from './firebaseDb';
import { isRevokedKey, keyFingerprint, keysMatch, type VaultLicense } from './storage';

export type LicenseLike = {
  id: string;
  key: string;
  eaId: string;
  eaName: string;
  eaImage: string;
  mainText: string;
  symbols: string[];
  customMedia?: unknown[];
  ownerAdminId: string;
  clientName: string;
  clientEmail: string;
  duration: string;
  status: 'active' | 'deleted' | 'assigned';
  assignedEmail?: string;
  assignedAt?: string;
};

export function vaultEntryToLicense(v: VaultLicense): LicenseLike {
  const email = String(v.email || '').trim().toLowerCase();
  return {
    id: v.id,
    key: v.key,
    eaId: v.eaId,
    eaName: v.eaName,
    eaImage: v.eaImage || '',
    mainText: v.mainText || '',
    symbols: Array.isArray(v.symbols) ? v.symbols : [],
    customMedia: v.customMedia,
    ownerAdminId: v.ownerAdminId,
    clientName: v.clientName || '',
    clientEmail: email,
    duration: v.duration || '',
    status: v.status === 'assigned' ? 'assigned' : v.status === 'deleted' ? 'deleted' : 'active',
    assignedEmail: v.assignedEmail,
    assignedAt: v.assignedAt,
  };
}

function isLicenseRevoked(key: string, wsRevoked: string[] = []): boolean {
  return isRevokedKey(key) || wsRevoked.some((k) => keysMatch(k, key));
}

/** Rebuild missing workspace license rows from vault — never delete existing keys. */
export function healLicensesFromVault<T extends LicenseLike>(
  workspace: { licenses?: unknown; revokedKeys?: unknown },
  ownerAdminId: string,
  vaultEntries: VaultLicense[],
  wsRevoked: string[] = dbList<string>(workspace.revokedKeys),
): { licenses: T[]; restored: number } {
  const licByKey = new Map<string, T>();
  for (const lic of dbList<T>(workspace.licenses)) {
    if (!lic?.key || lic.status === 'deleted' || isLicenseRevoked(lic.key, wsRevoked)) continue;
    const mergeKey = keyFingerprint(lic.key) || lic.id || lic.key;
    if (mergeKey) licByKey.set(mergeKey, lic);
  }

  let restored = 0;
  for (const v of vaultEntries) {
    if (!v?.key || v.status === 'deleted') continue;
    if (ownerAdminId && v.ownerAdminId && v.ownerAdminId !== ownerAdminId) continue;
    if (isLicenseRevoked(v.key, wsRevoked)) continue;
    const mergeKey = keyFingerprint(v.key) || v.id || v.key;
    if (!mergeKey || licByKey.has(mergeKey)) continue;
    licByKey.set(mergeKey, vaultEntryToLicense(v) as T);
    restored += 1;
  }

  return { licenses: [...licByKey.values()], restored };
}
