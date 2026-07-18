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

export type EABot = {
  name: string;
  displayName: string;
  mainText: string;
  licenseKey: string;
  status: 'active' | 'paused';
  symbols: string[];
};

export type LicenseSync = {
  name?: string;
  displayName?: string;
  mainText?: string;
  symbols?: string[];
};

type Session = {
  user: UserProfile | null;
  paid: boolean;
  bot: EABot;
};

const KEY = 'ub-web/session-v1';

const DEFAULT_BOT: EABot = {
  name: 'UNLIMITEDBULLV1',
  displayName: 'UNLIMITED BULL V1',
  mainText: 'UNLIMITED POWER',
  licenseKey: '',
  status: 'paused',
  symbols: ['XAUUSD'],
};

type Ctx = {
  user: UserProfile | null;
  paid: boolean;
  bot: EABot;
  isPaused: boolean;
  register: (u: UserProfile) => void;
  markPaid: () => void;
  togglePause: () => void;
  deleteBot: () => void;
  setSymbols: (s: string[]) => void;
  connectLicense: (key: string, sync?: LicenseSync) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() =>
    loadJSON(KEY, { user: null, paid: false, bot: DEFAULT_BOT }),
  );

  const persist = useCallback((next: Session) => {
    setSession(next);
    saveJSON(KEY, next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user: session.user,
      paid: session.paid,
      bot: { ...DEFAULT_BOT, ...session.bot },
      isPaused: session.bot.status === 'paused',
      register: (user) => persist({ ...session, user }),
      markPaid: () => persist({ ...session, paid: true }),
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
          bot: { ...session.bot, status: 'paused', licenseKey: '' },
        }),
      setSymbols: (symbols) =>
        persist({ ...session, bot: { ...session.bot, symbols } }),
      connectLicense: (key, sync) => {
        const displayName =
          sync?.displayName ?? sync?.name ?? session.bot.displayName;
        persist({
          ...session,
          bot: {
            ...session.bot,
            licenseKey: key.trim(),
            status: 'active',
            name: (sync?.name ?? displayName).replace(/\s+/g, '').toUpperCase(),
            displayName,
            mainText: sync?.mainText ?? session.bot.mainText,
            symbols: sync?.symbols?.length ? sync.symbols : session.bot.symbols,
          },
        });
      },
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
