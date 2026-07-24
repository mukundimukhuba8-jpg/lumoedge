import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Monitor, Pause, Play, ScanSearch, Settings, Signal, Trash2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
  saveInterfacePrefs,
  type InterfacePrefs,
} from '../../lib/interfaceStyle';
import { resolveCustomBackdrop, resolveProfileImage, isPlaceholderMentorImage, isGenericLumoLabel } from '../../lib/mentorMedia';
import { clearMt5Session, getMt5Token } from '../../lib/mt5Session';
import { getEaImage, isStreamableMediaUrl, loadJSON, saveJSON } from '../../lib/storage';
import { FocusLayout, TerminalLayout, VortexLayout } from './HomeLayouts';
import { InterfaceStyleModal } from './InterfaceStyleModal';

const FLOAT_KEY = 'ub-web/float-avatar-pos';

type FloatPos = { x: number; y: number };

export function HomePage() {
  const navigate = useNavigate();
  const {
    bot,
    isPaused,
    togglePause,
    deleteBot,
    user,
    refreshBranding,
  } = useApp();
  const { openPortal } = useAdmin();
  // Profile circles vs hero cover — both use mentor branding when available
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
    return getEaImage(key) || getEaImage(v) || (v.startsWith('img:') ? `/api/images/${encodeURIComponent(key)}` : '');
  };

  const [displayCover, setDisplayCover] = useState(() => instantMediaUrl(coverImage));
  const [displayAvatar, setDisplayAvatar] = useState(() => instantMediaUrl(profileAvatar) || instantMediaUrl(coverImage));
  const eaImage = displayCover || coverImage;
  const heroImage = displayCover;

  useEffect(() => {
    let cancelled = false;
    const immediate = instantMediaUrl(coverImage);
    const immediateAvatar = instantMediaUrl(profileAvatar) || immediate;
    if (immediate) setDisplayCover(immediate);
    if (immediateAvatar) setDisplayAvatar(immediateAvatar);

    if (
      (coverImage && (isStreamableMediaUrl(coverImage) || coverImage.startsWith('data:'))) &&
      (profileAvatar && (isStreamableMediaUrl(profileAvatar) || profileAvatar.startsWith('data:')))
    ) {
      return;
    }

    (async () => {
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
  const [floatPos, setFloatPos] = useState<FloatPos>(() =>
    loadJSON<FloatPos>(FLOAT_KEY, { x: 0, y: 0 }),
  );
  const [dragging, setDragging] = useState(false);
  const [eaInfoOpen, setEaInfoOpen] = useState(false);
  // Live MT5 link status for the EA popup terminal message
  const mt5Linked = useMemo(() => {
    if (!eaInfoOpen) return false;
    return Boolean(getMt5Token(user?.email));
  }, [eaInfoOpen, user?.email]);
  const taps = useRef(0);
  const timer = useRef<number | null>(null);
  const drag = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const floatRef = useRef<HTMLButtonElement | null>(null);
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
  /** Active platform background from Custom tab (or EA image fallback) */
  const platformBgUrl = customResolved?.src || displayCover || eaImage || '';
  const platformBgKind = customResolved?.kind || 'image';
  const customBg =
    customResolved && customResolved.kind === 'image' ? customResolved.src : '';

  // Pull latest mentor branding / profile picture / symbols — image sync only
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
    // Real-time: refresh instantly when any mentor portal pushes an update
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

  // Default float near center of cover once measured
  useEffect(() => {
    if (floatPos.x || floatPos.y) return;
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    const width = shell?.clientWidth || window.innerWidth;
    setFloatPos({ x: Math.max(12, width / 2 - 28), y: 200 });
  }, [floatPos.x, floatPos.y]);

  const clampPos = (x: number, y: number): FloatPos => {
    const el = floatRef.current;
    const w = el?.offsetWidth ?? 56;
    const h = el?.offsetHeight ?? 56;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y)),
    };
  };

  const onFloatPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: floatPos.x,
      originY: floatPos.y,
    };
    setDragging(true);
  };

  const onFloatPointerMove = (e: React.PointerEvent) => {
    if (!drag.current?.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
    const next = clampPos(drag.current.originX + dx, drag.current.originY + dy);
    setFloatPos(next);
  };

  const onFloatPointerUp = (e: React.PointerEvent) => {
    if (!drag.current?.active) return;
    const moved = drag.current.moved;
    drag.current.active = false;
    setDragging(false);
    saveJSON(FLOAT_KEY, floatPos);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Tap without drag → show EA name + trades soon
    if (!moved) setEaInfoOpen(true);
    drag.current = null;
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

  const layoutActions = {
    eaTitle,
    eaImage: displayAvatar || eaImage,
    backdropUrl: platformBgUrl,
    backdropKind: platformBgKind,
    mainText: bot.mainText || eaTitle,
    isPaused,
    accentRgb,
    onPauseToggle: togglePause,
    onSymbols: openSymbols,
    onStyle: () => setStyleOpen(true),
    onDelete: confirmDelete,
    onHomeTap,
    onMetaTrader: () => navigate('/app/metatrader'),
    onScanner: () => navigate('/app/scanner'),
    onAvatarTap: () => setEaInfoOpen(true),
  };

  const specialLayout =
    stylePrefs.layout === 'focus' ||
    stylePrefs.layout === 'terminal' ||
    stylePrefs.layout === 'vortex';

  return (
    <div className={`app-shell home-layout-${stylePrefs.layout}`}>
      {fxClass ? <div className={`iface-fx ${fxClass}`} aria-hidden /> : null}
      {/* Floating profile avatar — visible only while EA is running */}
      {stylePrefs.layout !== 'vortex' && displayAvatar && !isPaused ? (
        <button
          type="button"
          ref={floatRef}
          className="ea-float-avatar ea-float-live"
          aria-label="EA profile"
          onPointerDown={onFloatPointerDown}
          onPointerMove={onFloatPointerMove}
          onPointerUp={onFloatPointerUp}
          onPointerCancel={onFloatPointerUp}
          style={{
            position: 'fixed',
            left: floatPos.x,
            top: floatPos.y,
            zIndex: 30,
            touchAction: 'none',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            padding: 0,
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '2px solid var(--electric)',
            background: '#0e1220',
            boxShadow: `0 4px 18px rgba(${accentRgb},0.45)`,
            overflow: 'visible',
          }}
        >
          <img
            src={displayAvatar}
            alt=""
            width={56}
            height={56}
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
              display: 'block',
              borderRadius: '50%',
            }}
          />
        </button>
      ) : null}

      {stylePrefs.layout === 'focus' ? (
        <FocusLayout {...layoutActions} />
      ) : null}
      {stylePrefs.layout === 'terminal' ? (
        <TerminalLayout {...layoutActions} />
      ) : null}
      {stylePrefs.layout === 'vortex' ? (
        <VortexLayout {...layoutActions} />
      ) : null}

      {!specialLayout ? (
        <div className="home-shell">
          <div
            className="page home-page-fill cyber-page"
            style={{
              backgroundImage: customBg
                ? `linear-gradient(rgba(10,10,16,0.35), rgba(10,10,16,0.55)), url(${customBg})`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <h2 className="home-main-text">
              {bot.mainText && !isGenericLumoLabel(bot.mainText) ? bot.mainText : eaTitle}
            </h2>

            <div
              className="home-hero-box"
              style={{
                borderColor: `rgba(${accentRgb},0.55)`,
                boxShadow: `0 0 0 1px rgba(${accentRgb},0.12), 0 12px 36px rgba(0,0,0,0.45), 0 0 28px rgba(${accentRgb},0.22)`,
              }}
            >
              <div className="home-hero-media">
                {heroImage ? (
                  <img
                    className="home-hero"
                    src={heroImage}
                    alt={bot.displayName}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="home-hero home-hero-empty" aria-hidden />
                )}
                <div className="home-hero-shade" />
                <div className="home-hero-caption">
                  <div className="home-hero-ea">{eaTitle}</div>
                </div>
              </div>
            </div>

            <p className="home-powered">powered by LUMOEDGE</p>

            <div className="neon-action home-actions">
              <button type="button" onClick={confirmDelete}>
                <span className="circle-btn"><Trash2 size={22} /></span>
                DELETE
              </button>
              <button type="button" onClick={togglePause}>
                <span className="circle-btn">{isPaused ? <Play size={22} /> : <Pause size={22} />}</span>
                {isPaused ? 'RESUME' : 'PAUSE'}
              </button>
              <button type="button" onClick={openSymbols}>
                <span className="circle-btn"><Signal size={22} /></span>
                SYMBOLS
              </button>
            </div>

            <div className="pill home-status-pill">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  width={36}
                  height={36}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span
                  className="circle-btn"
                  style={{
                    width: 36,
                    height: 36,
                    fontSize: 14,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {(eaTitle || 'L').slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <div style={{ fontWeight: 700, letterSpacing: 1.2 }}>{eaTitle}</div>
                <div style={{ color: 'var(--electric)', fontWeight: 600 }}>
                  {isPaused ? 'PAUSED' : 'ACTIVE'}
                </div>
              </div>
            </div>

            <div className="pill home-connect-pill">
              <div
                className="home-connect-display"
                aria-hidden="true"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flex: 1,
                  color: 'var(--text)',
                  textAlign: 'left',
                }}
              >
                <span className="circle-btn" style={{ width: 44, height: 44 }}>+</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Connect EA</div>
                  <div className="muted" style={{ fontSize: 12 }}>Connect New License Key</div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Interface Style"
                onClick={() => setStyleOpen(true)}
                style={{
                  background: 'transparent',
                  color: 'var(--electric)',
                  padding: 8,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Settings size={22} />
              </button>
            </div>
          </div>

          <nav className="lay-dock" aria-label="Main">
            <button type="button" className="lay-dock-item active" onClick={onHomeTap}>
              <span className="lay-dock-ico"><Home size={20} /></span>
              <span>Home</span>
            </button>
            <button
              type="button"
              className="lay-dock-item"
              onClick={() => navigate('/app/scanner')}
            >
              <span className="lay-dock-ico"><ScanSearch size={20} /></span>
              <span>Scanner</span>
            </button>
            <button
              type="button"
              className="lay-dock-item"
              onClick={() => navigate('/app/metatrader')}
            >
              <span className="lay-dock-ico"><Monitor size={20} /></span>
              <span>MetaTrader</span>
            </button>
          </nav>
        </div>
      ) : null}

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
