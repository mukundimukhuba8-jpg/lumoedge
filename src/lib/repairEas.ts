import { dbList } from './firebaseDb';
import type { VaultLicense } from './storage';

type EasRow = {
  id: string;
  name: string;
  symbols: string[];
  lotSize: number;
  direction: 'buy' | 'sell' | 'both';
  imageUrl?: string;
  ownerAdminId?: string;
};

type LicenseSource = {
  eaId?: string;
  eaName?: string;
  name?: string;
  symbols?: string[];
  eaImage?: string;
  ownerAdminId?: string;
  status?: string;
};

function mergeEasById(existing: unknown, incoming: unknown): EasRow[] {
  const byId = new Map<string, EasRow>();
  for (const ea of [...dbList<EasRow>(existing), ...dbList<EasRow>(incoming)]) {
    if (!ea?.id) continue;
    const prev = byId.get(ea.id);
    byId.set(ea.id, prev ? { ...prev, ...ea } : ea);
  }
  return [...byId.values()];
}

function licenseSources(
  workspace: Record<string, unknown>,
  ownerAdminId: string,
  vaultEntries: VaultLicense[],
): LicenseSource[] {
  const wsLicenses = dbList<LicenseSource>(workspace.licenses).filter(
    (l) => l?.status !== 'deleted',
  );
  const vaultLicenses = vaultEntries
    .filter(
      (v) =>
        v.eaId &&
        v.status !== 'deleted' &&
        (!ownerAdminId || !v.ownerAdminId || v.ownerAdminId === ownerAdminId),
    )
    .map((v) => ({
      eaId: v.eaId,
      eaName: v.eaName,
      symbols: v.symbols,
      eaImage: v.eaImage,
      ownerAdminId: v.ownerAdminId,
      status: v.status,
    }));
  const byEaId = new Map<string, LicenseSource>();
  for (const lic of [...wsLicenses, ...vaultLicenses]) {
    const eaId = String(lic.eaId || '').trim();
    if (!eaId) continue;
    const prev = byEaId.get(eaId);
    byEaId.set(eaId, prev ? { ...prev, ...lic } : lic);
  }
  return [...byEaId.values()];
}

/** Rebuild missing EA rows from licenses + vault — never delete existing EAs. */
export function repairWorkspaceEas(
  workspace: Record<string, unknown> | undefined,
  ownerAdminId = '',
  vaultEntries: VaultLicense[] = [],
): { workspace: Record<string, unknown>; restored: number } {
  const ws = workspace && typeof workspace === 'object' ? { ...workspace } : {};
  const tombstones = new Set(dbList<string>(ws.deletedEaIds).map(String));
  const eas = mergeEasById(ws.eas, []);
  const easById = new Map(eas.map((ea) => [ea.id, ea]));
  let restored = 0;

  for (const lic of licenseSources(ws, ownerAdminId, vaultEntries)) {
    const eaId = String(lic.eaId || '').trim();
    if (!eaId || tombstones.has(eaId) || easById.has(eaId)) continue;
    const rebuilt: EasRow = {
      id: eaId,
      name: String(lic.eaName || lic.name || 'EA').trim() || 'EA',
      symbols:
        Array.isArray(lic.symbols) && lic.symbols.length ? lic.symbols : ['XAUUSD'],
      lotSize: 0.01,
      direction: 'both',
      imageUrl: String(lic.eaImage || '').trim(),
      ownerAdminId: String(lic.ownerAdminId || ownerAdminId || '').trim() || undefined,
    };
    easById.set(eaId, rebuilt);
    restored += 1;
  }

  return {
    workspace: {
      ...ws,
      eas: [...easById.values()].filter((ea) => !tombstones.has(String(ea.id))),
    },
    restored,
  };
}

export function countExpectedEas(
  workspace: Record<string, unknown> | undefined,
  ownerAdminId = '',
  vaultEntries: VaultLicense[] = [],
): number {
  const ws = workspace && typeof workspace === 'object' ? workspace : {};
  const tombstones = new Set(dbList<string>(ws.deletedEaIds).map(String));
  const ids = new Set<string>();
  for (const lic of licenseSources(ws, ownerAdminId, vaultEntries)) {
    const eaId = String(lic.eaId || '').trim();
    if (eaId && !tombstones.has(eaId)) ids.add(eaId);
  }
  for (const ea of dbList<EasRow>(ws.eas)) {
    if (ea?.id && !tombstones.has(ea.id)) ids.add(ea.id);
  }
  return ids.size;
}
