import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
  saveInterfacePrefs,
  type InterfacePrefs,
} from '../../lib/interfaceStyle';
import {
  resolveCustomBackdrop,
  resolveProfileImage,
  isPlaceholderMentorImage,
  isGenericLumoLabel,
} from '../../lib/mentorMedia';
import { clearMt5Session, getMt5Token } from '../../lib/mt5Session';
import { getEaImage, isStreamableMediaUrl } from '../../lib/storage';
import { OsHomeLayout } from './HomeLayouts';
import { InterfaceStyleModal } from './InterfaceStyleModal';

export function HomePage() {
  const navigate = useNavigate();
  const { bot, isPaused, togglePause, deleteBot, user, refreshBranding } = useApp();
  const { openPortal } = useAdmin();

  const profileAvatar = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const coverImage = (() => {
    const raw = String(bot.imageUrl || '').trim();
    if (raw && !isPlaceholderMentorImage(raw) && !raw.startsWith('blob:')) return raw;
    return profileAvatar || '';
  })();

  const instantMediaUrl = (raw: string) => {
    const v = String(raw || '').trim();
    if (!v || isPlaceholderMentorImage(v)) return '';
    if (v.startsWith('data:') || isStreamableMediaUrl(v)) return v;
    const key = v.replace(/^img:/, '');
    return (
      getEaImage(key) ||
      getEaImage(v) ||
      (v.startsWith('img:') ? `/api/images/${encodeURIComponent(key)}` : '')
    );
  };

  const [displayCover, setDisplayCover] = useState(() => instantMediaUrl(coverImage));
  const [displayAvatar, setDisplayAvatar] = useState(
    () => instantMediaUrl(profileAvatar) || instantMediaUrl(coverImage),
  );
  const eaImage = displayCover || coverImage;
  const heroImage = displayCover;

  useEffect(() => {
    let cancelled = false;
    const immediate = instantMediaUrl(coverImage);
    const immediateAvatar = instantMediaUrl(profileAvatar) || immediate;
    if (immediate) setDisplayCover(immediate);
    if (immediateAvatar) setDisplayAvatar(immediateAvatar);

    if (
      coverImage &&
      (isStreamableMediaUrl(coverImage) || coverImage.startsWith('data:')) &&
      profileAvatar &&
      (isStreamableMediaUrl(profileAvatar) || profileAvatar.startsWith('data:'))
    ) {
      return;
    }

    void (async () => {
      const { resolveDisplayImage } = await import('../../lib/storage');
      const cover = coverImage
        ? (await resolveDisplayImage(coverImage)) || instantMediaUrl(coverImage)
        : '';
      const avatar = profileAvatar
        ? (await resolveDisplayImage(profileAvatar)) || instantMediaUrl(profileAvatar)
        : '';
      if (cancelled) return;
      if (cover) setDisplayCover(cover);
      if (avatar) setDisplayAvatar(avatar);
    })();
    return () => {
      cancelled = true;
    };
  }, [coverImage, profileAvatar]);

  const [styleOpen, setStyleOpen] = useState(false);
  const [stylePrefs, setStylePrefs] = useState<InterfacePrefs>(() => loadInterfacePrefs());
  const [eaInfoOpen, setEaInfoOpen] = useState(false);
  const mt5Linked = useMemo(() => {
    if (!eaInfoOpen) return false;
    return Boolean(getMt5Token(user?.email));
  }, [eaInfoOpen, user?.email]);
  const taps = useRef(0);
  const timer = useRef<number | null>(null);
  const eaTitle =
    (bot.displayName && !isGenericLumoLabel(bot.displayName) ? bot.displayName : '') ||
    (bot.name && !isGenericLumoLabel(bot.name) ? bot.name : '') ||
    'Lumo Edge';
  const accent = accentHex(stylePrefs.accent);
  const accentRgb = hexToRgb(accent);
  const customResolved = resolveCustomBackdrop(
    stylePrefs.customBg,
    eaImage,
    bot.customMedia,
  );
  const platformBgUrl = customResolved?.src || displayCover || eaImage || '';
  const platformBgKind = customResolved?.kind || 'image';

  useEffect(() => {
    if (!user?.email || !bot.licenseKey) return;
    const sync = () => {
      void import('../../lib/clientBrandingSync').then(
        async ({ fetchClientBranding, resolveBrandingImageUrl }) => {
          const branding = await fetchClientBranding(bot.licenseKey);
          if (!branding) return;
          const imageUrl = branding.imageUrl
            ? await resolveBrandingImageUrl(branding.imageUrl)
            : '';
          refreshBranding({
            ...branding,
            displayName:
              branding.displayName && !isGenericLumoLabel(branding.displayName)
                ? branding.displayName
                : undefined,
            mainText:
              branding.mainText && !isGenericLumoLabel(branding.mainText)
                ? branding.mainText
                : undefined,
            ...(imageUrl ? { imageUrl } : {}),
          });
        },
      );
    };
    sync();
    let unwatch = () => {};
    void import('../../lib/firebaseDb').then(({ firebaseWatchUpdates }) => {
      unwatch = firebaseWatchUpdates(sync);
    });
    const id = window.setInterval(sync, 8000);
    return () => {
      window.clearInterval(id);
      unwatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, bot.licenseKey]);

  const updateStylePrefs = (next: InterfacePrefs) => {
    setStylePrefs(next);
    saveInterfacePrefs(next);
  };

  const onHomeTap = () => {
    taps.current += 1;
    if (timer.current) window.clearTimeout(timer.current);
    if (taps.current >= 3) {
      taps.current = 0;
      openPortal();
      navigate('/admin/login');
      return;
    }
    timer.current = window.setTimeout(() => {
      taps.current = 0;
    }, 900);
  };

  const fxClass =
    stylePrefs.effect === 'profit-matrix'
      ? 'iface-fx-matrix'
      : stylePrefs.effect === 'star-field'
        ? 'iface-fx-stars'
        : stylePrefs.effect === 'fire-mode'
          ? 'iface-fx-fire'
          : stylePrefs.effect === 'trader-night'
            ? 'iface-fx-night'
            : '';

  const openSymbols = () => navigate('/app/symbols');

  const confirmDelete = () => {
    if (
      !confirm(
        'Remove this license from your device? You will be logged out and must pay your subscription again before activating a new key.',
      )
    ) {
      return;
    }
    void deleteBot().then(() => {
      if (user?.email) clearMt5Session(user.email);
      navigate('/waiting', { replace: true });
    });
  };

  return (
    <div className={`os-panel home-layout-${stylePrefs.layout} os-home-shell`}>
      {fxClass ? <div className={`iface-fx ${fxClass}`} aria-hidden /> : null}

      <OsHomeLayout
        layout={stylePrefs.layout}
        eaTitle={eaTitle}
        eaImage={displayAvatar || eaImage}
        backdropUrl={platformBgUrl}
        backdropKind={platformBgKind}
        mainText={bot.mainText || eaTitle}
        isPaused={isPaused}
        accentRgb={accentRgb}
        onPauseToggle={() => setEaInfoOpen(true)}
        onSymbols={openSymbols}
        onStyle={() => setStyleOpen(true)}
        onDelete={confirmDelete}
        onHomeTap={onHomeTap}
        onMetaTrader={() => navigate('/app/metatrader')}
        onScanner={() => navigate('/app/scanner')}
        onAvatarTap={() => setEaInfoOpen(true)}
      />

      {eaInfoOpen ? (
        <div
          className="ea-status-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="EA status"
          onClick={() => setEaInfoOpen(false)}
        >
          <div className="ea-status-card pop-in" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ea-status-x"
              aria-label="Close"
              onClick={() => setEaInfoOpen(false)}
            >
              ×
            </button>
            <div className="ea-status-avatar-wrap">
              {!isPaused ? <span className="ea-status-live-ring" aria-hidden /> : null}
              <div className="ea-status-avatar-ring">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" />
                ) : (
                  <span className="ea-status-avatar-empty" aria-hidden />
                )}
              </div>
            </div>
            <span className={`ea-status-pill${isPaused ? ' off' : ''}`}>
              <span className="ea-status-dot" />
              {isPaused ? 'STOPPED' : 'ACTIVATED'}
            </span>
            <h2 className="ea-status-name">{eaTitle}</h2>
            <button
              type="button"
              className={`ea-status-toggle${isPaused ? ' start' : ''}`}
              onClick={togglePause}
            >
              {isPaused ? 'START EA' : 'STOP EA'}
            </button>
            <div className="ea-status-terminal">
              {mt5Linked ? (
                isPaused ? (
                  <>
                    <div>&gt; {eaTitle} is stopped</div>
                    <div>&gt; Press START EA to resume taking trades</div>
                  </>
                ) : (
                  <>
                    <div>&gt; {eaTitle} is connected and ready to take trades</div>
                    <div>&gt; Trades will be sent to your MetaTrader account</div>
                  </>
                )
              ) : (
                <>
                  <div>&gt; MetaTrader is not connected</div>
                  <div>&gt; Open the MetaTrader tab and link your broker account</div>
                  <div>&gt; {eaTitle} will take trades once connected</div>
                </>
              )}
              <div>&gt;</div>
              <div>&gt;</div>
            </div>
          </div>
        </div>
      ) : null}

      <InterfaceStyleModal
        open={styleOpen}
        onClose={() => setStyleOpen(false)}
        prefs={stylePrefs}
        onChange={updateStylePrefs}
        avatarUrl={displayAvatar || ''}
        mentorBgUrl={heroImage}
        mentorMedia={bot.customMedia}
        onOpenScanner={() => {
          setStyleOpen(false);
          navigate('/app/scanner');
        }}
      />
    </div>
  );
}
