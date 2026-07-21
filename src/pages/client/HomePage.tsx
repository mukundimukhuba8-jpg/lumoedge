import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Home, Monitor, Pause, Play, ScanSearch, Settings, Signal, Trash2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { executeCopyOrder, mentorIdForLicense, seedProcessedOrders, type CopyOrderPayload } from '../../lib/copyTrade';
import { firebaseWatchMentorOrders } from '../../lib/firebaseDb';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
  saveInterfacePrefs,
  type InterfacePrefs,
} from '../../lib/interfaceStyle';
import { resolveCustomBackdrop, resolveProfileImage, isPlaceholderMentorImage } from '../../lib/mentorMedia';
import { clearMt5Session, getMt5Token } from '../../lib/mt5Session';
import { loadJSON, normalizeLicenseKey, saveJSON } from '../../lib/storage';
import { FocusLayout, TerminalLayout, VortexLayout } from './HomeLayouts';
import { InterfaceStyleModal } from './InterfaceStyleModal';
import { CopyTradeStatus } from '../../components/CopyTradeStatus';

const ALL_SYMBOLS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'XAGUSD', 'NAS100', 'US30', 'BTCUSD',
];

const FLOAT_KEY = 'ub-web/float-avatar-pos';

type FloatPos = { x: number; y: number };

export function HomePage() {
  const navigate = useNavigate();
  const {
    bot,
    isPaused,
    togglePause,
    deleteBot,
    setSymbols,
    user,
    activateWithLicense,
    refreshBranding,
  } = useApp();
  const { openPortal, claimLicense } = useAdmin();
  // Profile circles vs hero cover — both use mentor branding when available
  const profileAvatar = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const coverImage = (() => {
    const raw = String(bot.imageUrl || '').trim();
    if (raw && !isPlaceholderMentorImage(raw) && !raw.startsWith('blob:')) return raw;
    return profileAvatar || '';
  })();
  const [displayCover, setDisplayCover] = useState('');
  const [displayAvatar, setDisplayAvatar] = useState('');
  const eaImage = coverImage;
  const heroImage = displayCover;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { resolveDisplayImage } = await import('../../lib/storage');
      const cover = coverImage
        ? (await resolveDisplayImage(coverImage)) || coverImage
        : '';
      const avatar = profileAvatar
        ? (await resolveDisplayImage(profileAvatar)) || profileAvatar
        : '';
      if (cancelled) return;
      setDisplayCover(cover);
      setDisplayAvatar(avatar);
    })();
    return () => {
      cancelled = true;
    };
  }, [coverImage, profileAvatar]);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [stylePrefs, setStylePrefs] = useState<InterfacePrefs>(() => loadInterfacePrefs());
  const [localSymbols, setLocalSymbols] = useState(bot.symbols);
  const [licenseKey, setLicenseKey] = useState(bot.licenseKey);
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
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';
  const accent = accentHex(stylePrefs.accent);
  const accentRgb = hexToRgb(accent);
  const customResolved = resolveCustomBackdrop(
    stylePrefs.customBg,
    eaImage,
    bot.customMedia,
  );
  /** Active platform background from Custom tab (or EA image fallback) */
  const platformBgUrl = customResolved?.src || eaImage || '';
  const platformBgKind = customResolved?.kind || 'image';
  const customBg =
    customResolved && customResolved.kind === 'image' ? customResolved.src : '';

  const [copyStatus, setCopyStatus] = useState('');

  // Listen for mentor copy trades and mirror them on this client's MT5
  useEffect(() => {
    if (!user?.email || !bot.licenseKey || isPaused) return;
    const mentorId = mentorIdForLicense(bot.licenseKey);
    if (!mentorId) return;

    let seeded = false;
    const handleOrders = (orders: Array<Record<string, unknown>>) => {
      if (!seeded) {
        seedProcessedOrders(
          mentorId,
          orders.map((o) => String(o.id || '')).filter(Boolean),
        );
        seeded = true;
        return;
      }
      const latest = orders[0];
      if (!latest?.id) return;
      const order: CopyOrderPayload = {
        id: String(latest.id),
        symbol: String(latest.symbol || 'XAUUSD'),
        side: String(latest.side || 'buy') === 'sell' ? 'sell' : 'buy',
        volume: Number(latest.volume) || 0.01,
        stopLoss: Number(latest.stopLoss) || 0,
        takeProfit: Number(latest.takeProfit) || 0,
        comment: String(latest.comment || ''),
        trades: Number(latest.trades) || 1,
      };
      void executeCopyOrder({
        email: user.email,
        eaName: bot.displayName || bot.name || 'Lumo Edge',
        order,
        mentorId,
      }).then((result) => {
        if (result.ok && result.message !== 'Already copied') {
          setCopyStatus(result.message);
        }
      });
    };

    const unsub = firebaseWatchMentorOrders(mentorId, handleOrders);
    return () => unsub();
  }, [user?.email, bot.licenseKey, bot.displayName, bot.name, isPaused]);

  // Pull latest mentor branding / profile picture / symbols — image sync only
  useEffect(() => {
    if (!user?.email || !bot.licenseKey) return;
    const sync = () => {
      void import('../../lib/clientBrandingSync').then(
        async ({ fetchClientBranding, resolveBrandingImageUrl }) => {
          const branding = await fetchClientBranding(bot.licenseKey);
          if (!branding) return;
          const imageUrl = await resolveBrandingImageUrl(branding.imageUrl || '');
          refreshBranding({
            ...branding,
            imageUrl,
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
    const id = window.setInterval(sync, 15000);
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

  const openSymbols = () => {
    setLocalSymbols(bot.symbols);
    setSymbolsOpen(true);
  };

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
    onConnect: () => setLicenseOpen(true),
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
      {copyStatus ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(10,14,24,0.92)',
            border: '1px solid rgba(59,130,246,0.45)',
            color: '#93c5fd',
            fontSize: 12,
            fontWeight: 600,
            maxWidth: '90vw',
          }}
        >
          {copyStatus}
        </div>
      ) : null}

      {/* Floating profile avatar — only when mentor uploaded a real photo */}
      {stylePrefs.layout !== 'vortex' && displayAvatar ? (
        <button
          type="button"
          ref={floatRef}
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
            overflow: 'hidden',
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
            <h2 className="home-main-text">{bot.mainText}</h2>

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

            <CopyTradeStatus
              email={user?.email}
              mentorName={eaTitle}
              copyStatus={copyStatus}
            />

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
              <button
                type="button"
                onClick={() => setLicenseOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flex: 1,
                  background: 'transparent',
                  color: 'var(--text)',
                  textAlign: 'left',
                  padding: 0,
                }}
              >
                <span className="circle-btn" style={{ width: 44, height: 44 }}>+</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Connect EA</div>
                  <div className="muted" style={{ fontSize: 12 }}>Connect New License Key</div>
                </div>
              </button>
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

      {symbolsOpen ? (
        <Modal title="Select Symbols" onClose={() => setSymbolsOpen(false)}>
          {ALL_SYMBOLS.map((s) => {
            const on = localSymbols.includes(s);
            return (
              <button
                key={s}
                type="button"
                className="pill"
                style={{
                  marginBottom: 8,
                  borderColor: on ? 'rgba(59,130,246,0.65)' : 'rgba(255,255,255,0.08)',
                  justifyContent: 'space-between',
                }}
                onClick={() =>
                  setLocalSymbols((prev) =>
                    on ? prev.filter((x) => x !== s) : [...prev, s],
                  )
                }
              >
                <span>{s}</span>
                <span style={{ color: on ? 'var(--electric)' : 'var(--muted)' }}>{on ? '✓' : ''}</span>
              </button>
            );
          })}
          <button
            className="btn btn-blue"
            type="button"
            onClick={() => {
              if (!localSymbols.length) return;
              setSymbols(localSymbols);
              setSymbolsOpen(false);
            }}
          >
            Save {localSymbols.length} symbols
          </button>
        </Modal>
      ) : null}

      {licenseOpen ? (
        <Modal title="Connect EA" onClose={() => setLicenseOpen(false)}>
          <p className="muted">Connect New License Key</p>
          <div className="field">
            <label>License Key</label>
            <input
              value={licenseKey}
              onChange={(e) => setLicenseKey(normalizeLicenseKey(e.target.value))}
              placeholder="LUMO-XXXX-XXXX-XXXX"
              style={{ letterSpacing: 1, fontWeight: 700 }}
            />
          </div>
          <button
            className="btn btn-blue"
            type="button"
            onClick={async () => {
              if (!user) return;
              const result = await claimLicense(licenseKey, user.email);
              if (!result.ok) {
                alert(result.error);
                return;
              }
              const lic = result.license;
              activateWithLicense(lic.key, {
                name: lic.eaName,
                displayName: lic.eaName,
                mainText: lic.mainText,
                imageUrl:
                  resolveProfileImage(lic.eaImage, lic.customMedia) ||
                  lic.eaImage ||
                  '',
                symbols: lic.symbols,
                customMedia: lic.customMedia,
              });
              setLicenseOpen(false);
            }}
          >
            Connect License
          </button>
        </Modal>
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
            <div className="ea-status-avatar-ring">
              {displayAvatar ? (
                <img src={displayAvatar} alt="" />
              ) : (
                <span className="ea-status-avatar-empty" aria-hidden />
              )}
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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="sheet-backdrop smooth-fade" onClick={onClose}>
      <div
        className="glow-card sheet-panel smooth-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: 'var(--muted)' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
