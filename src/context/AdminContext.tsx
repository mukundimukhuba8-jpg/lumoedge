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
};

export type LicenseRecord = {
  id: string;
  key: string;
  eaId: string;
  eaName: string;
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

const AUTH_KEY = 'ub-web/admin-auth-v1';
const DATA_KEY = 'ub-web/admin-data-v2';

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
  pendingAdmins: AdminUser[];
};

type DataState = {
  eas: ManagedEA[];
  licenses: LicenseRecord[];
  clientRequests: ClientRequest[];
  mt5: Mt5Connection;
  profile: AdminProfile;
  orders: CopyOrder[];
};

const defaultAuth: AuthState = {
  portalOpen: false,
  admin: null,
  pendingAdmins: [],
};

const defaultData: DataState = {
  eas: [
    {
      id: 'ea-unlimited-bull',
      name: 'UNLIMITED BULL v1',
      symbols: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US30', 'NAS100', 'BTCUSD'],
      lotSize: 0.01,
      direction: 'both',
    },
  ],
  licenses: [],
  clientRequests: [],
  mt5: {
    broker: 'Razor Markets',
    server: 'RazorMarkets-Live',
    accountType: 'Standard Live',
    login: '',
    password: '',
    eaName: 'UNLIMITED BULL',
    connected: false,
  },
  profile: {
    firstName: 'Mukundi',
    lastName: 'mukhuba',
    email: 'mukundimukhuba8@gmail.com',
    phone: '',
    mentorName: '',
    mentorId: 'LM-004821',
    eaDisplayName: 'UNLIMITED BULL V1',
    mainText: 'UNLIMITED POWER',
  },
  orders: [],
};

function uniqueKey(existing: LicenseRecord[]) {
  let key = makeLicenseKey();
  let guard = 0;
  while (existing.some((l) => l.key === key) && guard < 20) {
    key = makeLicenseKey();
    guard += 1;
  }
  return key;
}

type Ctx = {
  portalOpen: boolean;
  admin: AdminUser | null;
  pendingAdmins: AdminUser[];
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
  const [auth, setAuth] = useState<AuthState>(() => {
    const saved = loadJSON(AUTH_KEY, defaultAuth);
    return { ...saved, portalOpen: false };
  });
  const [data, setData] = useState<DataState>(() => {
    const saved = loadJSON(DATA_KEY, defaultData);
    const legacy = loadJSON<Partial<DataState>>('ub-web/admin-data-v1', {});
    const merged = { ...defaultData, ...legacy, ...saved };
    return {
      ...merged,
      eas: merged.eas?.length ? merged.eas : defaultData.eas,
      clientRequests: merged.clientRequests ?? [],
      licenses: (merged.licenses ?? []).map((l) => ({
        ...l,
        status: l.status === 'assigned' ? 'assigned' : l.status,
      })),
      profile: { ...defaultData.profile, ...merged.profile },
      mt5: { ...defaultData.mt5, ...merged.mt5 },
    };
  });

  const saveAuth = useCallback((next: AuthState) => {
    setAuth(next);
    saveJSON(AUTH_KEY, { ...next, portalOpen: false });
  }, []);

  const saveData = useCallback((next: DataState) => {
    setData(next);
    saveJSON(DATA_KEY, next);
  }, []);

  const value = useMemo<Ctx>(() => {
    const activeLicenses = data.licenses.filter(
      (l) => l.status === 'active' || l.status === 'assigned',
    ).length;
    const deletedLicenses = data.licenses.filter((l) => l.status === 'deleted').length;
    const pendingClients = data.clientRequests.filter((c) => c.status === 'pending').length;

    return {
      portalOpen: auth.portalOpen,
      admin: auth.admin,
      pendingAdmins: auth.pendingAdmins,
      openPortal: () => setAuth((a) => ({ ...a, portalOpen: true })),
      closePortal: () => setAuth((a) => ({ ...a, portalOpen: false })),
      login: (email, password) => {
        const normalized = email.trim().toLowerCase();
        if (
          normalized === SUPER_ADMIN.email.toLowerCase() &&
          password === SUPER_ADMIN.password
        ) {
          saveAuth({ ...auth, admin: SUPER_ADMIN.user, portalOpen: true });
          return null;
        }
        const pending = auth.pendingAdmins.find(
          (a) => a.email.toLowerCase() === normalized && a.password === password,
        );
        if (pending) {
          if (pending.role === 'pending') {
            return 'Your admin account is waiting for Super Admin approval.';
          }
          const { password: _p, ...user } = pending;
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
        if (auth.pendingAdmins.some((a) => a.email.toLowerCase() === email)) {
          return 'An admin with this email already registered.';
        }
        const entry: AdminUser = {
          ...form,
          email,
          id: `LM-${Math.floor(100000 + Math.random() * 900000)}`,
          role: 'pending',
        };
        saveAuth({
          ...auth,
          pendingAdmins: [...auth.pendingAdmins, entry],
        });
        return null;
      },
      logout: () => saveAuth({ ...auth, admin: null, portalOpen: false }),
      approveAdmin: (id) =>
        saveAuth({
          ...auth,
          pendingAdmins: auth.pendingAdmins.map((a) =>
            a.id === id ? { ...a, role: 'admin' } : a,
          ),
        }),
      clientRequests: data.clientRequests,
      submitClientRegistration: (input) => {
        const email = input.email.trim().toLowerCase();
        const existing = data.clientRequests.find((c) => c.email === email);
        if (existing) {
          return existing;
        }
        const entry: ClientRequest = {
          id: `cli-${Date.now()}`,
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          notifiedAt: new Date().toISOString(),
        };
        saveData({
          ...data,
          clientRequests: [entry, ...data.clientRequests],
        });
        return entry;
      },
      approveClient: (id) =>
        saveData({
          ...data,
          clientRequests: data.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'approved' } : c,
          ),
        }),
      rejectClient: (id) =>
        saveData({
          ...data,
          clientRequests: data.clientRequests.map((c) =>
            c.id === id ? { ...c, status: 'rejected' } : c,
          ),
        }),
      getClientByEmail: (email) =>
        data.clientRequests.find(
          (c) => c.email.toLowerCase() === email.trim().toLowerCase(),
        ),
      eas: data.eas,
      licenses: data.licenses,
      mt5: data.mt5,
      profile: data.profile,
      orders: data.orders,
      createEA: (ea) =>
        saveData({
          ...data,
          eas: [{ ...ea, id: `ea-${Date.now()}` }, ...data.eas],
        }),
      deleteEA: (id) =>
        saveData({ ...data, eas: data.eas.filter((e) => e.id !== id) }),
      generateLicense: (input) => {
        const ea = data.eas.find((e) => e.id === input.eaId);
        if (!ea || !input.clientName.trim() || !input.clientEmail.trim()) return null;
        const record: LicenseRecord = {
          id: `lic-${Date.now()}`,
          key: uniqueKey(data.licenses),
          eaId: ea.id,
          eaName: ea.name,
          clientName: input.clientName.trim(),
          clientEmail: input.clientEmail.trim().toLowerCase(),
          duration: input.duration,
          status: 'active',
        };
        saveData({ ...data, licenses: [record, ...data.licenses] });
        return record;
      },
      deleteLicense: (id) =>
        saveData({
          ...data,
          licenses: data.licenses.map((l) =>
            l.id === id ? { ...l, status: 'deleted' } : l,
          ),
        }),
      claimLicense: (key, email) => {
        const normalizedKey = key.trim().toUpperCase();
        const normalizedEmail = email.trim().toLowerCase();
        const license = data.licenses.find((l) => l.key.toUpperCase() === normalizedKey);
        if (!license || license.status === 'deleted') {
          return { ok: false, error: 'Invalid license key. Ask your admin to generate one.' };
        }
        if (license.status === 'assigned') {
          if (license.assignedEmail === normalizedEmail) {
            return { ok: true, license };
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
        const updated: LicenseRecord = {
          ...license,
          status: 'assigned',
          assignedEmail: normalizedEmail,
          assignedAt: new Date().toISOString(),
        };
        saveData({
          ...data,
          licenses: data.licenses.map((l) => (l.id === license.id ? updated : l)),
        });
        return { ok: true, license: updated };
      },
      findLicense: (key) =>
        data.licenses.find((l) => l.key.toUpperCase() === key.trim().toUpperCase()),
      saveMt5: (mt5) => saveData({ ...data, mt5 }),
      updateProfile: (patch) =>
        saveData({ ...data, profile: { ...data.profile, ...patch } }),
      executeOrder: (order) => {
        const created: CopyOrder = {
          ...order,
          id: `ord-${Date.now()}`,
          copiedTo: data.licenses.filter((l) => l.status === 'assigned').length,
        };
        saveData({ ...data, orders: [created, ...data.orders] });
        return created;
      },
      stats: {
        activeLicenses,
        deletedLicenses,
        totalClients: data.clientRequests.length,
        pendingClients,
      },
    };
  }, [auth, data, saveAuth, saveData]);

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
  // Open mail client without leaving the waiting page
  window.open(`mailto:${SUPER_ADMIN.email}?subject=${subject}&body=${body}`, '_blank');
}
