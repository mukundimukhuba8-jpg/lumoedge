import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { EaBackdrop } from './EaBackdrop';
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
  isPlaceholderMentorImage,
  resolveCustomBackdrop,
  resolveProfileImage,
} from '../lib/mentorMedia';
import { startMt5KeepAlive } from '../lib/mt5Session';
import { findInVault } from '../lib/storage';

function assistantLines(pathname: string, eaName: string, isPaused: boolean) {
  if (pathname.startsWith('/app/scanner')) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      'Chart Scanner online.',
      'Upload an MT5 chart to analyse.',
      'AI ready.',
    ];
  }
  if (pathname.startsWith('/app/metatrader')) {
    return [
      'Connecting to Unlimited Bull...',
      'License verified.',
      'MetaTrader bridge standing by.',
      'Link your broker to send trades.',
      'AI ready.',
    ];
  }
  return [
    'Connecting to Unlimited Bull...',
    'License verified.',
    `${eaName} ${isPaused ? 'is paused' : 'is online'}.`,
    'Trading engine standing by.',
    'AI ready.',
  ];
}

/**
 * Continuous client OS chrome: fixed backdrop, fixed dock, content morphs.
 * Pages must not render their own shell / dock / ambient layers.
 */
export function ClientOsShell() {
  const { user, bot, isPaused } = useApp();
  const location = useLocation();
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  const [panelKey, setPanelKey] = useState(location.pathname);

  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);

  useEffect(() => {
    if (user?.email) startMt5KeepAlive(user.email);
  }, [user?.email]);

  useEffect(() => {
    setPanelKey(location.pathname);
  }, [location.pathname]);

  const custom = resolveCustomBackdrop(
    prefs.customBg,
    bot.imageUrl || '',
    bot.customMedia,
  );
  const profileSrc = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const mentorBackdrop =
    custom?.src ||
    (profileSrc && !isPlaceholderMentorImage(profileSrc) ? profileSrc : '') ||
    (bot.imageUrl && !isPlaceholderMentorImage(bot.imageUrl) ? bot.imageUrl : '');
  const backdropSrc = mentorBackdrop;
  const backdropKind = custom?.kind || 'image';

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

        <FloatingAiAssistant
          className="os-shell-ai"
          title="Lumo AI"
          lines={assistantLines(
            location.pathname,
            bot.displayName || bot.name || 'Lumo Edge',
            isPaused,
          )}
        />
      </div>
    </CopyTradeProvider>
  );
}
