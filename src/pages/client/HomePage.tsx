import { useEffect, useRef, useState } from 'react';
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
  normalizeCustomMedia,
  resolveCustomBackdrop,
  resolveProfileImage,
  isPlaceholderMentorImage,
  isGenericLumoLabel,
  type MentorMediaItem,
} from '../../lib/mentorMedia';
import { clearMt5Session } from '../../lib/mt5Session';
import { getEaImage, isStreamableMediaUrl } from '../../lib/storage';
import { OsHomeLayout } from './HomeLayouts';
import { InterfaceStyleModal } from './InterfaceStyleModal';

export function HomePage() {
  const navigate = useNavigate();
  const { bot, isPaused, togglePause, deleteBot, user, refreshBranding } = useApp();
  const { openPortal } = useAdmin();

  const [playMedia, setPlayMedia] = useState<MentorMediaItem[]>(() =>
    normalizeCustomMedia(bot.customMedia),
  );

  useEffect(() => {
    const base = normalizeCustomMedia(bot.customMedia);
    // Convert img: refs to streamable /api URLs synchronously — never await RTDB blobs
    const streamed = base.map((m) => {
      const url = String(m.url || '').trim();
      if (!url) return m;
      if (m.kind === 'video') {
        if (url.startsWith('img:')) {
          return {
            ...m,
            url: `/api/media/${encodeURIComponent(url.replace(/^img:/, ''))}`,
          };
        }
        return m;
      }
      if (url.startsWith('img:')) {
        return {
          ...m,
          url: `/api/images/${encodeURIComponent(url.replace(/^img:/, ''))}`,
        };
      }
      return m;
    });
    setPlayMedia(streamed);
  }, [bot.customMedia]);

  const profileAvatar = resolveProfileImage(bot.imageUrl, playMedia);
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
  const [styleView, setStyleView] = useState<
    'hub' | 'themes' | 'layouts' | 'colours' | 'fonts' | 'effects' | 'custom' | 'settings'
  >('hub');
  const [stylePrefs, setStylePrefs] = useState<InterfacePrefs>(() => loadInterfacePrefs());

  const openStyle = (
    view: 'hub' | 'themes' | 'layouts' | 'colours' | 'fonts' | 'effects' | 'custom' | 'settings' = 'hub',
  ) => {
    setStyleView(view);
    setStyleOpen(true);
  };
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
    playMedia,
  );
  const platformBgUrl = customResolved?.src || displayCover || eaImage || '';
  const platformBgKind = customResolved?.kind || 'image';

  useEffect(() => {
    if (!user?.email || !bot.licenseKey) return;
    let cancelled = false;
    let lastSync = 0;
    let lastSig = '';
    const sync = (force = false) => {
      const now = Date.now();
      // Cap branding sync — was every 8s and burned mobile data
      if (!force && now - lastSync < 60_000) return;
      lastSync = now;
      void import('../../lib/clientBrandingSync').then(
        async ({
          fetchClientBranding,
          resolveBrandingImageUrl,
          brandingSignature,
        }) => {
          if (cancelled) return;
          const branding = await fetchClientBranding(bot.licenseKey);
          if (!branding || cancelled) return;
          const imageUrl = branding.imageUrl
            ? await resolveBrandingImageUrl(branding.imageUrl)
            : '';
          if (cancelled) return;
          const payload = {
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
          };
          const sig = brandingSignature(payload);
          if (sig === lastSig) return;
          lastSig = sig;
          refreshBranding(payload);
        },
      );
    };
    // Defer past first paint — force sync on mount was freezing taps after re-login
    const boot = window.setTimeout(() => {
      if (!cancelled) sync(true);
    }, 1400);
    const onFocus = () => sync(false);
    const onVis = () => {
      if (document.visibilityState === 'visible') sync(false);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    let unwatch = () => {};
    let watchTimer: number | undefined;
    void import('../../lib/firebaseDb').then(({ firebaseWatchUpdates }) => {
      unwatch = firebaseWatchUpdates(() => {
        if (watchTimer) window.clearTimeout(watchTimer);
        watchTimer = window.setTimeout(() => sync(false), 4000);
      });
    });
    const id = window.setInterval(() => sync(false), 120_000);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      window.clearInterval(id);
      if (watchTimer) window.clearTimeout(watchTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
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
        onPauseToggle={() => togglePause()}
        onSymbols={openSymbols}
        onStyle={openStyle}
        onDelete={confirmDelete}
        onHomeTap={onHomeTap}
        onMetaTrader={() => navigate('/app/metatrader')}
        onScanner={() => navigate('/app/scanner')}
      />

      <InterfaceStyleModal
        open={styleOpen}
        onClose={() => {
          setStyleOpen(false);
          setStyleView('hub');
        }}
        prefs={stylePrefs}
        onChange={updateStylePrefs}
        avatarUrl={displayAvatar || ''}
        mentorBgUrl={heroImage}
        mentorMedia={playMedia}
        initialView={styleView}
        onOpenScanner={() => {
          setStyleOpen(false);
          navigate('/app/scanner');
        }}
      />
    </div>
  );
}
