import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  emptyCustomMedia,
  isGenericLumoLabel,
  isPlaceholderMentorImage,
  normalizeCustomMedia,
  type MentorMediaItem,
} from '../lib/mentorMedia';
import { fetchDb, fetchSession, pushSession } from '../lib/remote';
import { dbList } from '../lib/firebaseDb';
import { findInVault, loadJSON, keysMatch, normalizeLicenseKey, purgePlaceholderEaImages, saveJSON } from '../lib/storage';

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
  customMedia: MentorMediaItem[];
};

export type LicenseSync = {
  name?: string;
  displayName?: string;
  mainText?: string;
  symbols?: string[];
  imageUrl?: string;
  customMedia?: MentorMediaItem[];
};

type Session = {
  user: UserProfile | null;
  accessStatus: AccessStatus;
  requiresRepayment?: boolean;
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
  customMedia: emptyCustomMedia(),
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
  requiresRepayment: boolean;
  bot: EABot;
  isPaused: boolean;
  setAccessStatus: (status: AccessStatus) => void;
  registerLocal: (u: UserProfile) => Promise<Session>;
  markPaid: () => void;
  activateWithLicense: (key: string, sync?: LicenseSync) => void;
  /** Update branding/media from mentor without changing pause/access */
  refreshBranding: (sync: LicenseSync) => void;
  togglePause: () => void;
  deleteBot: () => Promise<void>;
  setSymbols: (s: string[]) => void;
};

const AppContext = createContext<Ctx | null>(null);

function sanitizeBotImage(url: string | undefined): string {
  const v = String(url || '').trim();
  return v && !isPlaceholderMentorImage(v) ? v : '';
}

function pickBrandingField(localVal: string, remoteVal: string): string {
  const remote = String(remoteVal || '').trim();
  const local = String(localVal || '').trim();
  if (remote && !isGenericLumoLabel(remote)) return remoteVal;
  if (local && !isGenericLumoLabel(local)) return localVal;
  return remote || local;
}

function mergeBotBranding(local: EABot, remote: EABot): EABot {
  const remoteImg = sanitizeBotImage(remote.imageUrl);
  const localImg = sanitizeBotImage(local.imageUrl);
  const remoteMedia = normalizeCustomMedia(remote.customMedia);
  const localMedia = normalizeCustomMedia(local.customMedia);
  // Union slots so mentor background uploads are not dropped when one side
  // only has profile photos.
  const mediaMap = new Map(
    [...localMedia, ...remoteMedia].map((m) => [m.slot, m] as const),
  );
  for (const m of remoteMedia) mediaMap.set(m.slot, m);
  return {
    ...local,
    ...remote,
    displayName: pickBrandingField(local.displayName, remote.displayName),
    mainText: pickBrandingField(local.mainText, remote.mainText),
    name: pickBrandingField(local.name, remote.name),
    imageUrl: remoteImg || localImg || '',
    customMedia: [...mediaMap.values()],
  };
}

/** Once a license key exists, stay licensed — never bounce back to payment */
function normalizeSession(session: Session): Session {
  const bot = {
    ...DEFAULT_BOT,
    ...(session.bot ?? {}),
    customMedia: normalizeCustomMedia(session.bot?.customMedia),
    licenseKey: String(session.bot?.licenseKey || '').trim(),
    imageUrl: sanitizeBotImage(session.bot?.imageUrl),
  };
  let accessStatus = session.accessStatus ?? 'none';
  if (bot.licenseKey) {
    accessStatus = 'licensed';
    if (bot.status !== 'active' && bot.status !== 'paused') {
      bot.status = 'active';
    }
  }
  return {
    user: session.user ?? null,
    accessStatus,
    requiresRepayment: Boolean(session.requiresRepayment),
    bot,
  };
}

function migrateSession(): Session {
  const v2 = loadJSON<Session | null>(KEY, null as unknown as Session);
  if (v2 && typeof v2 === 'object' && 'accessStatus' in (v2 as object)) {
    return normalizeSession({
      user: v2.user ?? null,
      accessStatus: v2.accessStatus ?? 'none',
      requiresRepayment: Boolean((v2 as Session).requiresRepayment),
      bot: {
        ...DEFAULT_BOT,
        ...(v2.bot ?? {}),
        customMedia: normalizeCustomMedia(v2.bot?.customMedia),
      },
    });
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
  return normalizeSession({
    user: v1.user,
    accessStatus,
    bot: { ...DEFAULT_BOT, ...(v1.bot ?? {}) },
  });
}

function mergeSessions(local: Session, remote: Session | null): Session {
  if (!remote?.user) return normalizeSession(local);
  const localN = normalizeSession(local);
  const remoteN = normalizeSession(remote);
  const licenseKey = remoteN.bot.licenseKey || localN.bot.licenseKey || '';
  let status =
    RANK[remoteN.accessStatus] >= RANK[localN.accessStatus]
      ? remoteN.accessStatus
      : localN.accessStatus;
  // Hard rule: any saved license key means licensed forever (until deleteBot)
  if (licenseKey) status = 'licensed';
  const requiresRepayment = Boolean(localN.requiresRepayment || remoteN.requiresRepayment);
  if (requiresRepayment && !licenseKey) status = 'pending';
  const mergedBot = mergeBotBranding(
    { ...DEFAULT_BOT, ...localN.bot, licenseKey: localN.bot.licenseKey || licenseKey },
    { ...DEFAULT_BOT, ...remoteN.bot, licenseKey: remoteN.bot.licenseKey || licenseKey },
  );
  return normalizeSession({
    user: remoteN.user || localN.user,
    accessStatus: status,
    requiresRepayment: requiresRepayment && !licenseKey,
    bot: {
      ...mergedBot,
      licenseKey,
      status: licenseKey
        ? remoteN.bot.status === 'paused' && localN.bot.status === 'paused'
          ? 'paused'
          : remoteN.bot.status === 'active' || localN.bot.status === 'active'
            ? 'active'
            : remoteN.bot.status || localN.bot.status || 'active'
        : remoteN.bot.status || localN.bot.status,
    },
  });
}

/** Look up a vault / workspace license for this email (server may have lost session). */
async function restoreLicenseFromVault(
  email: string,
  licenseKey?: string,
): Promise<{
  licenseKey: string;
  imageUrl: string;
  displayName: string;
  mainText: string;
  symbols: string[];
  customMedia: MentorMediaItem[];
} | null> {
  try {
    const db = await fetchDb();
    if (!db) return null;
    type VaultHit = {
      key?: string;
      assignedEmail?: string;
      status?: string;
      eaImage?: string;
      eaName?: string;
      mainText?: string;
      symbols?: string[];
      assignedAt?: string;
    };
    const vault = dbList<VaultHit>(db.vault);
    const normalizedEmail = email.toLowerCase();
    const normalizedKey = licenseKey ? normalizeLicenseKey(licenseKey) : '';

    const pickBest = (hits: VaultHit[]) => {
      if (!hits.length) return null;
      if (normalizedKey) {
        const byKey = hits.find((v) => keysMatch(String(v.key || ''), normalizedKey));
        if (byKey) return byKey;
      }
      return hits.sort(
        (a, b) =>
          Date.parse(String(b.assignedAt || '')) - Date.parse(String(a.assignedAt || '')),
      )[0];
    };

    const vaultHit = pickBest(
      vault.filter(
        (v) =>
          String(v.assignedEmail || '').toLowerCase() === normalizedEmail &&
          v.status === 'assigned' &&
          v.key,
      ),
    );
    let licenseKeyOut = vaultHit?.key || '';
    let imageUrl = vaultHit?.eaImage || '';
    let displayName = vaultHit?.eaName || '';
    let mainText = vaultHit?.mainText || '';
    let symbols = vaultHit?.symbols || [];
    if (!licenseKeyOut && db.store?.workspaces) {
      const workspaceHits: VaultHit[] = [];
      for (const ws of Object.values(
        db.store.workspaces as Record<
          string,
          {
            licenses?: Array<{
              key: string;
              clientEmail: string;
              assignedEmail?: string;
              status: string;
              eaImage?: string;
              eaName?: string;
              mainText?: string;
              symbols?: string[];
              assignedAt?: string;
            }>;
          }
        >,
      )) {
        for (const l of ws.licenses || []) {
          if (
            String(l.assignedEmail || '').toLowerCase() === normalizedEmail &&
            l.status === 'assigned' &&
            l.key
          ) {
            workspaceHits.push(l);
          }
        }
      }
      const hit = pickBest(workspaceHits);
      if (hit) {
        licenseKeyOut = hit.key || '';
        imageUrl = hit.eaImage || imageUrl;
        displayName = hit.eaName || displayName;
        mainText = hit.mainText || mainText;
        symbols = hit.symbols || symbols;
      }
    }
    if (!licenseKeyOut) return null;
    const vaultEntry = findInVault(licenseKeyOut);
    return {
      licenseKey: licenseKeyOut,
      imageUrl,
      displayName,
      mainText,
      symbols,
      customMedia: normalizeCustomMedia(vaultEntry?.customMedia),
    };
  } catch {
    return null;
  }
}

function applyVaultLicense(
  session: Session,
  vault: NonNullable<Awaited<ReturnType<typeof restoreLicenseFromVault>>>,
): Session {
  return normalizeSession({
    ...session,
    accessStatus: 'licensed',
    bot: {
      ...session.bot,
      licenseKey: vault.licenseKey,
      status: session.bot.status === 'paused' ? 'paused' : 'active',
      imageUrl: sanitizeBotImage(vault.imageUrl) || session.bot.imageUrl,
      displayName: pickBrandingField(session.bot.displayName, vault.displayName),
      mainText: pickBrandingField(session.bot.mainText, vault.mainText),
      symbols: vault.symbols.length ? vault.symbols : session.bot.symbols,
      customMedia: vault.customMedia.some((m) => m.url)
        ? vault.customMedia
        : session.bot.customMedia,
    },
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => {
    purgePlaceholderEaImages();
    return migrateSession();
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const persist = useCallback((next: Session) => {
    const normalized = normalizeSession(next);
    setSession(normalized);
    saveJSON(KEY, normalized);
    if (normalized.user?.email) {
      void pushSession(normalized.user.email, normalized);
    }
  }, []);

  // Restore progress from server when opening / refreshing — never demote a licensed local session
  useEffect(() => {
    const email = session.user?.email;
    if (!email) return;
    let cancelled = false;
    (async () => {
      const remote = await fetchSession<Session>(email);
      if (cancelled) return;

      const latest = sessionRef.current;
      let merged = mergeSessions(latest, remote);

      if (!merged.bot.licenseKey) {
        const vault = await restoreLicenseFromVault(email, latest.bot.licenseKey);
        if (cancelled) return;
        if (vault) merged = applyVaultLicense(merged, vault);
      }

      // Never overwrite a newer local licensed session with a stale demoted fetch
      const current = sessionRef.current;
      if (current.bot.licenseKey && !merged.bot.licenseKey) {
        merged = normalizeSession({
          ...merged,
          accessStatus: 'licensed',
          bot: { ...merged.bot, ...current.bot, licenseKey: current.bot.licenseKey },
        });
      }
      if (current.bot.licenseKey) {
        merged = normalizeSession({
          ...merged,
          accessStatus: 'licensed',
          bot: {
            ...merged.bot,
            licenseKey: current.bot.licenseKey || merged.bot.licenseKey,
          },
        });
      }

      if (
        merged.accessStatus !== current.accessStatus ||
        merged.bot.licenseKey !== current.bot.licenseKey ||
        merged.bot.imageUrl !== current.bot.imageUrl ||
        JSON.stringify(merged.bot.customMedia) !==
          JSON.stringify(current.bot.customMedia)
      ) {
        setSession(merged);
        saveJSON(KEY, merged);
        if (merged.bot.licenseKey) {
          void pushSession(email, merged);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.email]);

  const value = useMemo<Ctx>(
    () => ({
      user: session.user,
      accessStatus: session.accessStatus,
      requiresRepayment: Boolean(session.requiresRepayment),
      bot: { ...DEFAULT_BOT, ...session.bot },
      isPaused: session.bot.status === 'paused',
      setAccessStatus: (accessStatus) => {
        // Never demote a licensed account back to payment/waiting
        if (session.bot.licenseKey && accessStatus !== 'licensed') {
          persist({ ...session, accessStatus: 'licensed' });
          return;
        }
        persist({ ...session, accessStatus });
      },
      registerLocal: async (user) => {
        const existing =
          session.user?.email?.toLowerCase() === user.email.toLowerCase()
            ? session
            : migrateSession();
        const sameEmail =
          existing.user?.email?.toLowerCase() === user.email.toLowerCase();
        const remote = await fetchSession<Session>(user.email);
        const base: Session = normalizeSession({
          user,
          accessStatus:
            sameEmail &&
            (existing.bot.licenseKey || existing.accessStatus === 'licensed')
              ? 'licensed'
              : sameEmail &&
                  (existing.accessStatus === 'paid' ||
                    existing.accessStatus === 'approved')
                ? existing.accessStatus
                : 'pending',
          bot: sameEmail
            ? { ...DEFAULT_BOT, ...existing.bot }
            : { ...DEFAULT_BOT, licenseKey: '', imageUrl: '' },
        });
        let merged = mergeSessions(base, remote);
        if (!merged.bot.licenseKey) {
          const vault = await restoreLicenseFromVault(user.email);
          if (vault) merged = applyVaultLicense(merged, vault);
        }
        persist(merged);
        return merged;
      },
      markPaid: () => {
        if (session.bot.licenseKey) {
          persist({ ...session, accessStatus: 'licensed' });
          return;
        }
        persist({ ...session, accessStatus: 'paid', requiresRepayment: false });
      },
      activateWithLicense: (key, sync) => {
        const displayName =
          sync?.displayName ?? sync?.name ?? session.bot.displayName;
        const normalizedKey = normalizeLicenseKey(key);
        void import('../lib/copyTrade').then(({ rememberLicenseOwner, mentorIdForLicense }) => {
          const owner = mentorIdForLicense(normalizedKey);
          if (owner) rememberLicenseOwner(normalizedKey, owner);
        });
        persist({
          ...session,
          accessStatus: 'licensed',
          requiresRepayment: false,
          bot: {
            ...session.bot,
            licenseKey: normalizedKey,
            status: 'active',
            name: (sync?.name ?? displayName).replace(/\s+/g, '').toUpperCase(),
            displayName,
            mainText: sync?.mainText ?? session.bot.mainText,
            symbols: sync?.symbols?.length ? sync.symbols : session.bot.symbols,
            imageUrl: sync?.imageUrl || session.bot.imageUrl || '',
            customMedia: normalizeCustomMedia(
              sync?.customMedia !== undefined
                ? sync.customMedia
                : session.bot.customMedia,
            ),
          },
        });
      },
      refreshBranding: (sync) => {
        persist({
          ...session,
          accessStatus: session.bot.licenseKey ? 'licensed' : session.accessStatus,
          bot: {
            ...session.bot,
            name: sync.name
              ? sync.name.replace(/\s+/g, '').toUpperCase()
              : session.bot.name,
            displayName: sync.displayName ?? sync.name ?? session.bot.displayName,
            mainText: sync.mainText ?? session.bot.mainText,
            // Mentor portal symbols always win when provided
            symbols:
              sync.symbols !== undefined
                ? sync.symbols.length
                  ? sync.symbols
                  : session.bot.symbols
                : session.bot.symbols,
            // Mentor portal image wins when provided — never wipe on failed sync
            imageUrl:
              sync.imageUrl !== undefined
                ? sync.imageUrl || session.bot.imageUrl || ''
                : session.bot.imageUrl || '',
            customMedia: normalizeCustomMedia(
              sync.customMedia !== undefined
                ? sync.customMedia
                : session.bot.customMedia,
            ),
          },
        });
      },
      togglePause: () =>
        persist({
          ...session,
          accessStatus: session.bot.licenseKey ? 'licensed' : session.accessStatus,
          bot: {
            ...session.bot,
            status: session.bot.status === 'active' ? 'paused' : 'active',
          },
        }),
      deleteBot: async () => {
        const email = session.user?.email?.trim().toLowerCase();
        const key = session.bot.licenseKey?.trim();
        if (email && key) {
          try {
            await fetch('/api/licenses/release', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, email }),
            });
          } catch {
            // still clear locally
          }
        }
        persist({
          ...session,
          accessStatus: 'pending',
          requiresRepayment: true,
          bot: {
            ...session.bot,
            status: 'paused',
            licenseKey: '',
            imageUrl: '',
            customMedia: emptyCustomMedia(),
          },
        });
      },
      setSymbols: (symbols) =>
        persist({
          ...session,
          accessStatus: session.bot.licenseKey ? 'licensed' : session.accessStatus,
          bot: { ...session.bot, symbols },
        }),
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
