import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadJSON, makeLicenseKey, saveJSON } from '../lib/storage';

export type AdminRole = 'super' | 'admin' | 'pending';

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  password?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
};

export type ClientRequest = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  notifiedAt?: string;
};

export type ManagedEA = {
  id: string;
  name: string;
  symbols: string[];
  lotSize: number;
  direction: 'buy' | 'sell' | 'both';
  imageUrl?: string;
};

export type LicenseRecord = {
  id: string;
  key: string;
  eaId: string;
  eaName: string;
  eaImage: string;
  mainText: string;
  symbols: string[];
  ownerAdminId: string;
  clientName: string;
  clientEmail: string;
  duration: string;
  status: 'active' | 'deleted' | 'assigned';
  assignedEmail?: string;
  assignedAt?: string;
};

export type Mt5Connection = {
  broker: string;
  server: string;
  accountType: string;
  login: string;
  password: string;
  eaName: string;
  connected: boolean;
};

export type AdminProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mentorName: string;
  mentorId: string;
  eaDisplayName: string;
  mainText: string;
  eaImage: string;
};

export type CopyOrder = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  stopLoss: number;
  takeProfit: number;
  comment: string;
  trades: number;
  copiedTo: number;
};

export type AdminWorkspace = {
  eas: ManagedEA[];
  licenses: LicenseRecord[];
  clientRequests: ClientRequest[];
  mt5: Mt5Connection;
  profile: AdminProfile;
  orders: CopyOrder[];
};

const AUTH_KEY = 'ub-web/admin-auth-v3';
const STORE_KEY = 'ub-web/admin-store-v3';

export const SUPER_ADMIN = {
  email: 'mukundimukhuba8@gmail.com',
  password: 'admin123',
  user: {
    id: 'LM-004821',
    email: 'mukundimukhuba8@gmail.com',
    fullName: 'Mukundi',
    role: 'super' as const,
  },
};

type AuthState = {
  portalOpen: boolean;
  admin: AdminUser | null;
  admins: AdminUser[];
};

type StoreState = {
  workspaces: Record<string, AdminWorkspace>;
};

function emptyMt5(eaName = ''): Mt5Connection {
  return {
    broker: 'Razor Markets',
    server: 'RazorMarkets-Live',
    accountType: 'Standard Live',
    login: '',
    password: '',
    eaName,
    connected: false,
  };
}

function emptyProfile(seed?: {
  id?: string;
  email?: string;
  fullName?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}): AdminProfile {
  const parts = (seed?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    email: seed?.email ?? '',
    phone: seed?.phone ?? '',
    mentorName: seed?.mentorName ?? '',
    mentorId: seed?.id ?? '',
    eaDisplayName: seed?.eaName ?? '',
    mainText: seed?.mainText ?? '',
    eaImage: '',
  };
}

/** Brand-new admin portals start empty — nothing shared. */
export function createEmptyWorkspace(seed?: {
  id?: string;
  email?: string;
  fullName?: string;
  mentorName?: string;
  eaName?: string;
  phone?: string;
  mainText?: string;
}): AdminWorkspace {
  return {
    eas: [],
    licenses: [],
    clientRequests: [],
    mt5: emptyMt5(seed?.eaName ?? ''),
    profile: emptyProfile(seed),
    orders: [],
  };
}

function uniqueKey(allLicenses: LicenseRecord[]) {
  let key = makeLicenseKey();
  let guard = 0;
  while (allLicenses.some((l) => l.key === key) && guard < 20) {
    key = makeLicenseKey();
    guard += 1;
  }
  return key;
}

function migrateAuth(): AuthState {
  const v3 = loadJSON<AuthState | null>(AUTH_KEY, null as unknown as AuthState);
  if (v3 && Array.isArray(v3.admins)) {
    return { ...v3, portalOpen: false };
  }
  const v1 = loadJSON<{
    portalOpen?: boolean;
    admin?: AdminUser | null;
    pendingAdmins?: AdminUser[];
  }>('ub-web/admin-auth-v1', {});
  return {
    portalOpen: false,
    admin: null,
    admins: v1.pendingAdmins ?? [],
  };
}

function migrateStore(admins: AdminUser[]): StoreState {
  const v3 = loadJSON<StoreState | null>(STORE_KEY, null as unknown as StoreState);
  if (v3?.workspaces && typeof v3.workspaces === 'object') {
    return v3;
  }

  // Migrate legacy shared data into Super Admin workspace only
  const legacy = loadJSON<Partial<AdminWorkspace>>('ub-web/admin-data-v2', {});
  const legacyV1 = loadJSON<Partial<AdminWorkspace>>('ub-web/admin-data-v1', {});
  const merged = { ...legacyV1, ...legacy };
  const workspaces: Record<string, AdminWorkspace> = {};

  const superWs = createEmptyWorkspace({
    id: SUPER_ADMIN.user.id,
    email: SUPER_ADMIN.email,
    fullName: SUPER_ADMIN.user.fullName,
  });

  if (merged.eas?.length || merged.licenses?.length || merged.profile) {
    superWs.eas = (merged.eas ?? []).map((ea) => ({ ...ea, imageUrl: ea.imageUrl ?? '' }));
    superWs.licenses = (merged.licenses ?? []).map((l) => ({
      ...l,
      eaImage: l.eaImage ?? '',
      mainText: l.mainText ?? merged.profile?.mainText ?? '',
      symbols: l.symbols ?? [],
      ownerAdminId: SUPER_ADMIN.user.id,
    }));
    superWs.clientRequests = merged.clientRequests ?? [];
    superWs.mt5 = { ...emptyMt5(), ...merged.mt5 };
    superWs.profile = {
      ...emptyProfile({
        id: SUPER_ADMIN.user.id,
        email: SUPER_ADMIN.email,
        fullName: SUPER_ADMIN.user.fullName,
      }),
      ...merged.profile,
      eaImage: merged.profile?.eaImage ?? '',
    };
    superWs.orders = merged.orders ?? [];
  }
  workspaces[SUPER_ADMIN.user.id] = superWs;

  for (const a of admins) {
    if (!workspaces[a.id]) {
      workspaces[a.id] = createEmptyWorkspace(a);
    }
  }

  return { workspaces };
}

type Ctx = {
  portalOpen: boolean;
  admin: AdminUser | null;
  admins: AdminUser[];
  openPortal: () => void;
  closePortal: () => void;
  login: (email: string, password: string) => string | null;
  registerAdmin: (data: Omit<AdminUser, 'id' | 'role'> & { password: string }) => string | null;
  logout: () => void;
  approveAdmin: (id: string) => void;
  clientRequests: ClientRequest[];
  submitClientRegistration: (input: {
    email: string;
    firstName: string;
    lastName: string;
  }) => ClientRequest;
  approveClient: (id: string) => void;
  rejectClient: (id: string) => void;
  getClientByEmail: (email: string) => ClientRequest | undefined;
  eas: ManagedEA[];
  licenses: LicenseRecord[];
  mt5: Mt5Connection;
  profile: AdminProfile;
  orders: CopyOrder[];
  createEA: (ea: Omit<ManagedEA, 'id'>) => void;
  deleteEA: (id: string) => void;
  generateLicense: (input: {
    eaId: string;
    clientName: string;
    clientEmail: string;
    duration: string;
  }) => LicenseRecord | null;
  deleteLicense: (id: string) => void;
  claimLicense: (
    key: string,
    email: string,
  ) => { ok: true; license: LicenseRecord } | { ok: false; error: string };
  findLicense: (key: string) => LicenseRecord | undefined;
  saveMt5: (mt5: Mt5Connection) => void;
  updateProfile: (patch: Partial<AdminProfile>) => void;
  executeOrder: (order: Omit<CopyOrder, 'id' | 'copiedTo'>) => CopyOrder;
  stats: {
    activeLicenses: number;
    deletedLicenses: number;
    totalClients: number;
    pendingClients: number;
  };
};

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => migrateAuth());
  const [store, setStore] = useState<StoreState>(() => migrateStore(migrateAuth().admins));

  const saveAuth = useCallback((next: AuthState) => {
    setAuth(next);
    // Persist admins + current session; portalOpen always resets on reload
    saveJSON(AUTH_KEY, { ...next, portalOpen: false });
  }, []);

  const saveStore = useCallback((next: StoreState) => {
    setStore(next);
    saveJSON(STORE_KEY, next);
  }, []);

  const ensureWorkspace = useCallback(
    (adminId: string, seed?: AdminUser): AdminWorkspace => {
      const existing = store.workspaces[adminId];
      if (existing) return existing;
      return createEmptyWorkspace(seed ?? { id: adminId });
    },
    [store.workspaces],
  );

  const patchWorkspace = useCallback(
    (adminId: string, updater: (ws: AdminWorkspace) => AdminWorkspace, seed?: AdminUser) => {
      const current = store.workspaces[adminId] ?? createEmptyWorkspace(seed ?? { id: adminId });
      const nextWs = updater(current);
      saveStore({
        ...store,
        workspaces: { ...store.workspaces, [adminId]: nextWs },
      });
    },
    [saveStore, store],
  );

  const allLicenses = useMemo(
    () => Object.values(store.workspaces).flatMap((ws) => ws.licenses),
    [store.workspaces],
  );

  const value = useMemo<Ctx>(() => {
    const adminId = auth.admin?.id ?? '';
    const workspace =
      (adminId && store.workspaces[adminId]) ||
      createEmptyWorkspace(auth.admin ?? undefined);

    const activeLicenses = workspace.licenses.filter(
      (l) => l.status === 'active' || l.status === 'assigned',
    ).length;
    const deletedLicenses = workspace.licenses.filter((l) => l.status === 'deleted').length;
    const pendingClients = workspace.clientRequests.filter((c) => c.status === 'pending').length;

    return {
      portalOpen: auth.portalOpen,
      admin: auth.admin,
      admins: auth.admins,
      openPortal: () => setAuth((a) => ({ ...a, portalOpen: true })),
      closePortal: () => setAuth((a) => ({ ...a, portalOpen: false })),
      login: (email, password) => {
        const normalized = email.trim().toLowerCase();
        if (
          normalized === SUPER_ADMIN.email.toLowerCase() &&
          password === SUPER_ADMIN.password
        ) {
          const id = SUPER_ADMIN.user.id;
          if (!store.workspaces[id]) {
            saveStore({
              ...store,
              workspaces: {
                ...store.workspaces,
                [id]: createEmptyWorkspace({
                  id,
                  email: SUPER_ADMIN.email,
                  fullName: SUPER_ADMIN.user.fullName,
                }),
              },
            });
          }
          saveAuth({ ...auth, admin: SUPER_ADMIN.user, portalOpen: true });
          return null;
        }
        const found = auth.admins.find(
          (a) => a.email.toLowerCase() === normalized && a.password === password,
        );
        if (found) {
          if (found.role === 'pending') {
            return 'Your admin account is waiting for Super Admin approval.';
          }
          if (!store.workspaces[found.id]) {
            saveStore({
              ...store,
              workspaces: {
                ...store.workspaces,
                [found.id]: createEmptyWorkspace(found),
              },
            });
          }
          const { password: _p, ...user } = found;
          saveAuth({ ...auth, admin: user, portalOpen: true });
          return null;
        }
        return 'Invalid email or password.';
      },
      registerAdmin: (form) => {
        const email = form.email.trim().toLowerCase();
        if (!email || !form.password || !form.fullName.trim()) {
          return 'Fill all required fields.';
        }
        if (email === SUPER_ADMIN.email.toLowerCase()) {
          return 'This email is reserved for Super Admin.';
        }
        if (auth.admins.some((a) => a.email.toLowerCase() === email)) {
          return 'An admin with this email already registered.';
        }
        const entry: AdminUser = {
          ...form,
          email,
          id: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
          role: 'pending',
        };
        // Own empty portal (profile seed only — no shared EAs/licenses)
        saveStore({
          ...store,
          workspaces: {
            ...store.workspaces,
            [entry.id]: createEmptyWorkspace(entry),
          },
        });
        saveAuth({
          ...auth,
          admins: [...auth.admins, entry],
        });
        return null;
      },
      logout: () => saveAuth({ ...auth, admin: null, portalOpen: false }),
      approveAdmin: (id) =>
        saveAuth({
          ...auth,
          admins: auth.admins.map((a) => (a.id === id ? { ...a, role: 'admin' } : a)),
        }),
      clientRequests: workspace.clientRequests,
      submitClientRegistration: (input) => {
        // Platform registrations go to Super Admin's own queue only
        const sid = SUPER_ADMIN.user.id;
        const superWs = store.workspaces[sid] ?? createEmptyWorkspace({
          id: sid,
          email: SUPER_ADMIN.email,
          fullName: SUPER_ADMIN.user.fullName,
        });
        const email = input.email.trim().toLowerCase();
        const existing = Object.values(store.workspaces)
          .flatMap((ws) => ws.clientRequests)
          .find((c) => c.email === email);
        if (existing) return existing;
        const entry: ClientRequest = {
          id: `cli-${Date.now()}`,
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          notifiedAt: new Date().toISOString(),
        };
        saveStore({
          ...store,
          workspaces: {
            ...store.workspaces,
            [sid]: {
              ...superWs,
              clientRequests: [entry, ...superWs.clientRequests],
            },
          },
        });
        return entry;
      },
      approveClient: (id) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          clientRequests: ws.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'approved' } : c,
          ),
        }));
      },
      rejectClient: (id) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          clientRequests: ws.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'rejected' } : c,
          ),
        }));
      },
      getClientByEmail: (email) => {
        const normalized = email.trim().toLowerCase();
        return Object.values(store.workspaces)
          .flatMap((ws) => ws.clientRequests)
          .find((c) => c.email.toLowerCase() === normalized);
      },
      eas: workspace.eas,
      licenses: workspace.licenses,
      mt5: workspace.mt5,
      profile: workspace.profile,
      orders: workspace.orders,
      createEA: (ea) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          eas: [
            {
              ...ea,
              id: `ea-${Date.now()}`,
              imageUrl: ea.imageUrl || ws.profile.eaImage || '',
            },
            ...ws.eas,
          ],
        }));
      },
      deleteEA: (id) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          eas: ws.eas.filter((e) => e.id !== id),
        }));
      },
      generateLicense: (input) => {
        if (!adminId) return null;
        const ws = ensureWorkspace(adminId, auth.admin ?? undefined);
        const ea = ws.eas.find((e) => e.id === input.eaId);
        if (!ea || !input.clientName.trim() || !input.clientEmail.trim()) return null;
        const eaImage = ea.imageUrl || ws.profile.eaImage || '';
        const record: LicenseRecord = {
          id: `lic-${Date.now()}`,
          key: uniqueKey(allLicenses),
          eaId: ea.id,
          eaName: ea.name,
          eaImage,
          mainText: ws.profile.mainText || '',
          symbols: ea.symbols,
          ownerAdminId: adminId,
          clientName: input.clientName.trim(),
          clientEmail: input.clientEmail.trim().toLowerCase(),
          duration: input.duration,
          status: 'active',
        };
        patchWorkspace(adminId, (current) => ({
          ...current,
          licenses: [record, ...current.licenses],
        }));
        return record;
      },
      deleteLicense: (id) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          licenses: ws.licenses.map((l) =>
            l.id === id ? { ...l, status: 'deleted' } : l,
          ),
        }));
      },
      claimLicense: (key, email) => {
        const normalizedKey = key.trim().toUpperCase();
        const normalizedEmail = email.trim().toLowerCase();
        let ownerId: string | null = null;
        let license: LicenseRecord | undefined;
        for (const [wid, ws] of Object.entries(store.workspaces)) {
          const found = ws.licenses.find((l) => l.key.toUpperCase() === normalizedKey);
          if (found) {
            ownerId = wid;
            license = found;
            break;
          }
        }
        if (!ownerId || !license || license.status === 'deleted') {
          return { ok: false, error: 'Invalid license key. Ask your admin to generate one.' };
        }
        if (license.status === 'assigned') {
          if (license.assignedEmail === normalizedEmail) {
            const ownerWs = store.workspaces[ownerId];
            const ea = ownerWs?.eas.find((e) => e.id === license!.eaId);
            return {
              ok: true,
              license: {
                ...license,
                eaName: ea?.name ?? license.eaName,
                eaImage: ea?.imageUrl || ownerWs?.profile.eaImage || license.eaImage,
                mainText: ownerWs?.profile.mainText || license.mainText,
                symbols: ea?.symbols?.length ? ea.symbols : license.symbols,
              },
            };
          }
          return { ok: false, error: 'This license key is already used by another account.' };
        }
        if (
          license.clientEmail &&
          license.clientEmail.toLowerCase() !== normalizedEmail
        ) {
          return {
            ok: false,
            error: 'This license key was issued for a different email. Use the key generated for your account.',
          };
        }
        const ownerWs = store.workspaces[ownerId];
        const ea = ownerWs?.eas.find((e) => e.id === license!.eaId);
        const updated: LicenseRecord = {
          ...license,
          status: 'assigned',
          assignedEmail: normalizedEmail,
          assignedAt: new Date().toISOString(),
          eaName: ea?.name ?? license.eaName,
          eaImage: ea?.imageUrl || ownerWs?.profile.eaImage || license.eaImage,
          mainText: ownerWs?.profile.mainText || license.mainText,
          symbols: ea?.symbols?.length ? ea.symbols : license.symbols ?? [],
        };
        saveStore({
          ...store,
          workspaces: {
            ...store.workspaces,
            [ownerId]: {
              ...ownerWs!,
              licenses: ownerWs!.licenses.map((l) => (l.id === license!.id ? updated : l)),
            },
          },
        });
        return { ok: true, license: updated };
      },
      findLicense: (key) =>
        allLicenses.find((l) => l.key.toUpperCase() === key.trim().toUpperCase()),
      saveMt5: (mt5) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({ ...ws, mt5 }));
      },
      updateProfile: (patch) => {
        if (!adminId) return;
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          profile: { ...ws.profile, ...patch },
          // Keep EA records in sync with uploaded branding image when set
          eas: patch.eaImage
            ? ws.eas.map((ea) => ({
                ...ea,
                imageUrl: patch.eaImage || ea.imageUrl,
              }))
            : ws.eas,
          mt5:
            patch.eaDisplayName !== undefined
              ? { ...ws.mt5, eaName: patch.eaDisplayName || ws.mt5.eaName }
              : ws.mt5,
        }));
      },
      executeOrder: (order) => {
        if (!adminId) {
          return {
            ...order,
            id: `ord-${Date.now()}`,
            copiedTo: 0,
          };
        }
        const created: CopyOrder = {
          ...order,
          id: `ord-${Date.now()}`,
          copiedTo: workspace.licenses.filter((l) => l.status === 'assigned').length,
        };
        patchWorkspace(adminId, (ws) => ({
          ...ws,
          orders: [created, ...ws.orders],
        }));
        return created;
      },
      stats: {
        activeLicenses,
        deletedLicenses,
        totalClients: workspace.clientRequests.length,
        pendingClients,
      },
    };
  }, [auth, store, saveAuth, saveStore, patchWorkspace, ensureWorkspace, allLicenses]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin missing provider');
  return ctx;
}

export function notifySuperAdminEmail(client: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const subject = encodeURIComponent('Lumo Edge — New client registration');
  const body = encodeURIComponent(
    `A new client registered on Lumo Edge and needs approval.\n\n` +
      `Name: ${client.firstName} ${client.lastName}\n` +
      `Email: ${client.email}\n\n` +
      `Open the Super Admin portal → Subscriptions to approve.`,
  );
  window.open(`mailto:${SUPER_ADMIN.email}?subject=${subject}&body=${body}`, '_blank');
}
