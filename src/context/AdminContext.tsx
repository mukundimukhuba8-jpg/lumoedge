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
  status: 'active' | 'deleted';
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
const DATA_KEY = 'ub-web/admin-data-v1';

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
  findLicense: (key: string) => LicenseRecord | undefined;
  saveMt5: (mt5: Mt5Connection) => void;
  updateProfile: (patch: Partial<AdminProfile>) => void;
  executeOrder: (order: Omit<CopyOrder, 'id' | 'copiedTo'>) => CopyOrder;
  stats: {
    activeLicenses: number;
    deletedLicenses: number;
    totalClients: number;
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
    return {
      ...defaultData,
      ...saved,
      eas: saved.eas?.length ? saved.eas : defaultData.eas,
      profile: { ...defaultData.profile, ...saved.profile },
      mt5: { ...defaultData.mt5, ...saved.mt5 },
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
    const activeLicenses = data.licenses.filter((l) => l.status === 'active').length;
    const deletedLicenses = data.licenses.filter((l) => l.status === 'deleted').length;

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
          key: makeLicenseKey(),
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
      findLicense: (key) =>
        data.licenses.find(
          (l) =>
            l.key.toLowerCase() === key.trim().toLowerCase() && l.status === 'active',
        ),
      saveMt5: (mt5) => saveData({ ...data, mt5 }),
      updateProfile: (patch) =>
        saveData({ ...data, profile: { ...data.profile, ...patch } }),
      executeOrder: (order) => {
        const created: CopyOrder = {
          ...order,
          id: `ord-${Date.now()}`,
          copiedTo: activeLicenses,
        };
        saveData({ ...data, orders: [created, ...data.orders] });
        return created;
      },
      stats: {
        activeLicenses,
        deletedLicenses,
        totalClients: activeLicenses + deletedLicenses,
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
