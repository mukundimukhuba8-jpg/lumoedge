import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

export type UserProfile = { email: string; firstName: string; lastName: string };

export type AccessStatus = 'none' | 'pending' | 'approved' | 'paid' | 'licensed';

export type EABot = {
  name: string;
  displayName: string;
  mainText: string;
  licenseKey: string;
  status: 'active' | 'paused';
  symbols: string[];
  imageUrl: string;
};

export type LicenseSync = {
  name?: string;
  displayName?: string;
  mainText?: string;
  symbols?: string[];
  imageUrl?: string;
};

type Session = {
  user: UserProfile | null;
  accessStatus: AccessStatus;
  bot: EABot;
};

const KEY = 'ub-web/session-v2';

const DEFAULT_BOT: EABot = {
  name: 'LUMOEDGE',
  displayName: 'Lumo Edge',
  mainText: 'LUMO EDGE',
  licenseKey: '',
  status: 'paused',
  symbols: ['XAUUSD'],
  imageUrl: '',
};

type Ctx = {
  user: UserProfile | null;
  accessStatus: AccessStatus;
  bot: EABot;
  isPaused: boolean;
  setAccessStatus: (status: AccessStatus) => void;
  registerLocal: (u: UserProfile) => void;
  markPaid: () => void;
  activateWithLicense: (key: string, sync?: LicenseSync) => void;
  togglePause: () => void;
  deleteBot: () => void;
  setSymbols: (s: string[]) => void;
};

const AppContext = createContext<Ctx | null>(null);

function migrateSession(): Session {
  const v2 = loadJSON<Session | null>(KEY, null as unknown as Session);
  if (v2 && typeof v2 === 'object' && 'accessStatus' in (v2 as object)) {
    return {
      user: v2.user ?? null,
      accessStatus: v2.accessStatus ?? 'none',
      bot: { ...DEFAULT_BOT, ...(v2.bot ?? {}) },
    };
  }
  // migrate old session
  const v1 = loadJSON<{ user: UserProfile | null; paid?: boolean; bot?: EABot }>(
    'ub-web/session-v1',
    { user: null, paid: false, bot: DEFAULT_BOT },
  );
  let accessStatus: AccessStatus = 'none';
  if (v1.user) {
    if (v1.bot?.licenseKey) accessStatus = 'licensed';
    else if (v1.paid) accessStatus = 'paid';
    else accessStatus = 'pending';
  }
  return {
    user: v1.user,
    accessStatus,
    bot: { ...DEFAULT_BOT, ...(v1.bot ?? {}) },
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => migrateSession());

  const persist = useCallback((next: Session) => {
    setSession(next);
    saveJSON(KEY, next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user: session.user,
      accessStatus: session.accessStatus,
      bot: { ...DEFAULT_BOT, ...session.bot },
      isPaused: session.bot.status === 'paused',
      setAccessStatus: (accessStatus) => persist({ ...session, accessStatus }),
      registerLocal: (user) =>
        persist({ ...session, user, accessStatus: 'pending' }),
      markPaid: () => persist({ ...session, accessStatus: 'paid' }),
      activateWithLicense: (key, sync) => {
        const displayName =
          sync?.displayName ?? sync?.name ?? session.bot.displayName;
        persist({
          ...session,
          accessStatus: 'licensed',
          bot: {
            ...session.bot,
            licenseKey: key.trim().toUpperCase(),
            status: 'active',
            name: (sync?.name ?? displayName).replace(/\s+/g, '').toUpperCase(),
            displayName,
            mainText: sync?.mainText ?? session.bot.mainText,
            symbols: sync?.symbols?.length ? sync.symbols : session.bot.symbols,
            imageUrl: sync?.imageUrl ?? session.bot.imageUrl ?? '',
          },
        });
      },
      togglePause: () =>
        persist({
          ...session,
          bot: {
            ...session.bot,
            status: session.bot.status === 'active' ? 'paused' : 'active',
          },
        }),
      deleteBot: () =>
        persist({
          ...session,
          accessStatus: 'paid',
          bot: { ...session.bot, status: 'paused', licenseKey: '' },
        }),
      setSymbols: (symbols) =>
        persist({ ...session, bot: { ...session.bot, symbols } }),
    }),
    [persist, session],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp missing provider');
  return ctx;
}
