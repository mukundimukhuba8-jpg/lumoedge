import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { EaBackdrop } from './EaBackdrop';
import { EaStatusCard, EaStatusFloat } from './EaStatusCard';
import { FloatingAiAssistant } from './FloatingAiAssistant';
import { OsDock } from './OsDock';
import { useApp } from '../context/AppContext';
import { CopyTradeProvider } from '../context/CopyTradeContext';
import { mentorIdForLicense } from '../lib/copyTrade';
import {
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from '../lib/interfaceStyle';
import {
  isGenericLumoLabel,
  isPlaceholderMentorImage,
  resolveCustomBackdrop,
  resolveProfileImage,
} from '../lib/mentorMedia';
import { getMt5Token, startMt5KeepAlive, stopMt5KeepAlive } from '../lib/mt5Session';
import { findInVault, resolveStoredMediaUrl } from '../lib/storage';

function assistantLines(pathname: string, eaName: string, isPaused: boolean) {
  if (pathname.startsWith('/app/scanner')) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      'Chart Scanner online.',
      'Forex chart analysis standing by.',
      'Ask about pairs, setups, or risk — not people.',
      'AI ready.',
    ];
  }
  if (pathname.startsWith('/app/metatrader')) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      'MetaTrader bridge standing by.',
      'Forex execution path ready.',
      'Ask about pairs or risk — not people.',
      'AI ready.',
    ];
  }
  return [
    'Connecting to Unlimited Bull...',
    'License verified.',
    `${eaName} ${isPaused ? 'is paused' : 'is online'}.`,
    'Trading engine standing by.',
    'Ask about pairs, charts, or risk — not people.',
    'AI ready.',
  ];
}

/**
 * Continuous client OS chrome: fixed backdrop, fixed dock, content morphs.
 * Pages must not render their own shell / dock / ambient layers.
 */
export function ClientOsShell() {
  const { user, bot, isPaused, togglePause } = useApp();
  const location = useLocation();
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  const [panelKey, setPanelKey] = useState(location.pathname);
  const [eaInfoOpen, setEaInfoOpen] = useState(false);
  const [placeFloatTop, setPlaceFloatTop] = useState(false);
  const wasPaused = useRef(isPaused);

  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);

  useEffect(() => {
    if (!user?.email) return;
    startMt5KeepAlive(user.email);
    return () => stopMt5KeepAlive(user.email);
  }, [user?.email]);

  useEffect(() => {
    setPanelKey(location.pathname);
  }, [location.pathname]);

  // Start → LIVE float appears at top of screen
  useEffect(() => {
    if (wasPaused.current && !isPaused) {
      setPlaceFloatTop(true);
      const t = window.setTimeout(() => setPlaceFloatTop(false), 400);
      wasPaused.current = isPaused;
      return () => window.clearTimeout(t);
    }
    wasPaused.current = isPaused;
  }, [isPaused]);

  const custom = resolveCustomBackdrop(
    prefs.customBg,
    bot.imageUrl || '',
    bot.customMedia,
  );
  const profileSrc = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const avatarUrl =
    resolveStoredMediaUrl(profileSrc) ||
    profileSrc ||
    resolveStoredMediaUrl(bot.imageUrl || '') ||
    '';
  const mentorBackdrop =
    custom?.src ||
    (profileSrc && !isPlaceholderMentorImage(profileSrc) ? profileSrc : '') ||
    (bot.imageUrl && !isPlaceholderMentorImage(bot.imageUrl) ? bot.imageUrl : '');
  const backdropSrc = mentorBackdrop;
  const backdropKind = custom?.kind || 'image';

  const eaTitle = useMemo(() => {
    return (
      (bot.displayName && !isGenericLumoLabel(bot.displayName) ? bot.displayName : '') ||
      (bot.name && !isGenericLumoLabel(bot.name) ? bot.name : '') ||
      'Lumo Edge'
    );
  }, [bot.displayName, bot.name]);

  const mt5Linked = useMemo(
    () => Boolean(getMt5Token(user?.email)),
    [user?.email, eaInfoOpen, isPaused],
  );

  const ownerAdminId = bot.licenseKey ? mentorIdForLicense(bot.licenseKey) : '';
  const clientEaId = bot.licenseKey ? findInVault(bot.licenseKey)?.eaId || '' : '';

  return (
    <CopyTradeProvider
      email={user?.email}
      licenseKey={bot.licenseKey}
      eaName={bot.displayName || bot.name || 'Lumo Edge'}
      clientEaId={clientEaId}
      isPaused={isPaused}
      ownerAdminId={ownerAdminId}
    >
      <div className="os-shell">
        {backdropSrc ? (
          <EaBackdrop src={backdropSrc} kind={backdropKind} />
        ) : (
          <div className="os-shell-fallback-bg" aria-hidden />
        )}

        <div className="os-shell-stage">
          <div className="os-shell-panel os-panel-morph" key={panelKey}>
            <Outlet />
          </div>
        </div>

        <OsDock />

        {/* LIVE float — Start puts it at top; drag anywhere; tap opens details */}
        <EaStatusFloat
          visible={!isPaused}
          eaTitle={eaTitle}
          avatarUrl={avatarUrl}
          isPaused={isPaused}
          placeAtTop={placeFloatTop}
          onOpen={() => setEaInfoOpen(true)}
        />

        <EaStatusCard
          open={eaInfoOpen}
          eaTitle={eaTitle}
          avatarUrl={avatarUrl}
          isPaused={isPaused}
          mt5Linked={mt5Linked}
          onClose={() => setEaInfoOpen(false)}
          onTogglePause={() => {
            togglePause();
            // Always close details — LIVE float appears/hides from pause state
            setEaInfoOpen(false);
          }}
        />

        <FloatingAiAssistant
          className="os-shell-ai"
          title="Lumo AI"
          eaName={eaTitle}
          isPaused={isPaused}
          lines={assistantLines(location.pathname, eaTitle, isPaused)}
        />
      </div>
    </CopyTradeProvider>
  );
}
