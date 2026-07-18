import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchSession, pushSession } from '../lib/remote';
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

const RANK: Record<AccessStatus, number> = {
  none: 0,
  pending: 1,
  approved: 2,
  paid: 3,
  licensed: 4,
};

type Ctx = {
  user: UserProfile | null;
  accessStatus: AccessStatus;
  bot: EABot;
  isPaused: boolean;
  setAccessStatus: (status: AccessStatus) => void;
  registerLocal: (u: UserProfile) => Promise<void>;
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

function mergeSessions(local: Session, remote: Session | null): Session {
  if (!remote?.user) return local;
  const status =
    RANK[remote.accessStatus] >= RANK[local.accessStatus]
      ? remote.accessStatus
      : local.accessStatus;
  return {
    user: remote.user || local.user,
    accessStatus: status,
    bot: {
      ...DEFAULT_BOT,
      ...local.bot,
      ...remote.bot,
      imageUrl: remote.bot?.imageUrl || local.bot.imageUrl || '',
      licenseKey: remote.bot?.licenseKey || local.bot.licenseKey || '',
    },
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => migrateSession());

  const persist = useCallback((next: Session) => {
    setSession(next);
    saveJSON(KEY, next);
    if (next.user?.email) {
      void pushSession(next.user.email, next);
    }
  }, []);

  // Restore progress from server when opening a new preview link
  useEffect(() => {
    const email = session.user?.email;
    if (!email) return;
    void fetchSession<Session>(email).then((remote) => {
      if (!remote) return;
      const merged = mergeSessions(session, remote);
      if (
        merged.accessStatus !== session.accessStatus ||
        merged.bot.licenseKey !== session.bot.licenseKey ||
        merged.bot.imageUrl !== session.bot.imageUrl
      ) {
        setSession(merged);
        saveJSON(KEY, merged);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.email]);

  const value = useMemo<Ctx>(
    () => ({
      user: session.user,
      accessStatus: session.accessStatus,
      bot: { ...DEFAULT_BOT, ...session.bot },
      isPaused: session.bot.status === 'paused',
      setAccessStatus: (accessStatus) => persist({ ...session, accessStatus }),
      registerLocal: async (user) => {
        const remote = await fetchSession<Session>(user.email);
        if (remote?.user) {
          persist(
            mergeSessions(
              { user, accessStatus: 'pending', bot: { ...DEFAULT_BOT, ...session.bot } },
              remote,
            ),
          );
          return;
        }
        persist({
          user,
          accessStatus: 'pending',
          bot: { ...DEFAULT_BOT, ...session.bot, licenseKey: '', imageUrl: '' },
        });
      },
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
            imageUrl: sync?.imageUrl || session.bot.imageUrl || '',
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
          bot: { ...session.bot, status: 'paused', licenseKey: '', imageUrl: '' },
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
