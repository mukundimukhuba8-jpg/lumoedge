import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Monitor, Pause, Play, Settings, Signal, Trash2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { useApp } from '../../context/AppContext';
import { normalizeLicenseKey } from '../../lib/storage';

const ALL_SYMBOLS = [
  'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'XAGUSD', 'NAS100', 'US30', 'BTCUSD',
];

export function HomePage() {
  const navigate = useNavigate();
  const { bot, isPaused, togglePause, deleteBot, setSymbols, user, activateWithLicense } = useApp();
  const { openPortal, claimLicense } = useAdmin();
  const eaImage = bot.imageUrl || '';
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [localSymbols, setLocalSymbols] = useState(bot.symbols);
  const [licenseKey, setLicenseKey] = useState(bot.licenseKey);
  const taps = useRef(0);
  const timer = useRef<number | null>(null);
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';

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

  return (
    <div className="app-shell">
      <div className="page" style={{ paddingBottom: 8 }}>
        <h2
          style={{
            textAlign: 'center',
            color: 'var(--electric)',
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            letterSpacing: 1,
            marginTop: 8,
          }}
        >
          {bot.mainText}
        </h2>

        <div
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            border: '1px solid rgba(59,130,246,0.4)',
            position: 'relative',
            marginTop: 12,
          }}
        >
          <img
            src={eaImage || '/bull-hero.jpg'}
            alt={bot.displayName}
            style={{ width: '100%', display: 'block', maxHeight: 360, objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: 16,
              textAlign: 'center',
              background: 'linear-gradient(transparent, rgba(10,10,10,0.95))',
            }}
          >
            <div style={{ color: 'var(--electric)', fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 700 }}>
              {eaTitle}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <img
            src={eaImage || '/bull-avatar.jpg'}
            alt=""
            width={54}
            height={54}
            style={{ borderRadius: '50%', border: '2px solid var(--electric)', margin: '0 0 10px', objectFit: 'cover' }}
          />
          <div
            style={{
              color: 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              letterSpacing: 0.5,
            }}
          >
            powered by LUMOEDGE
          </div>
        </div>

        <div className="neon-action">
          <button type="button" onClick={() => deleteBot()}>
            <span className="circle-btn"><Trash2 size={22} /></span>
            DELETE
          </button>
          <button type="button" onClick={togglePause}>
            <span className="circle-btn">{isPaused ? <Play size={22} /> : <Pause size={22} />}</span>
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalSymbols(bot.symbols);
              setSymbolsOpen(true);
            }}
          >
            <span className="circle-btn"><Signal size={22} /></span>
            SYMBOLS
          </button>
        </div>

        <div className="pill" style={{ marginBottom: 14 }}>
          <img src={eaImage || '/bull-avatar.jpg'} width={36} height={36} style={{ borderRadius: '50%', objectFit: 'cover' }} alt="" />
          <div>
            <div style={{ fontWeight: 700, letterSpacing: 1.2 }}>{bot.name}</div>
            <div style={{ color: 'var(--electric)', fontWeight: 600 }}>
              {isPaused ? 'PAUSED' : 'ACTIVE'}
            </div>
          </div>
        </div>

        <button type="button" className="pill" onClick={() => setLicenseOpen(true)}>
          <span className="circle-btn" style={{ width: 44, height: 44 }}>+</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Connect EA</div>
            <div className="muted" style={{ fontSize: 12 }}>Connect New License Key</div>
          </div>
          <Settings size={20} color="var(--electric)" />
        </button>

        <p style={{ textAlign: 'center', color: 'var(--electric)', marginTop: 12, fontWeight: 600 }}>
          Trading: {bot.symbols.join(' · ')}
        </p>
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          {bot.licenseKey ? `License: ${bot.licenseKey}` : 'No license connected'}
        </p>
      </div>

      <div className="tabbar">
        <button type="button" className="active" onClick={onHomeTap}>
          <Home size={20} /> Home
        </button>
        <button type="button" onClick={() => navigate('/app/metatrader')}>
          <Monitor size={20} /> MetaTrader
        </button>
      </div>

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
            onClick={() => {
              if (!user) return;
              const result = claimLicense(licenseKey, user.email);
              if (!result.ok) {
                alert(result.error);
                return;
              }
              const lic = result.license;
              activateWithLicense(lic.key, {
                name: lic.eaName,
                displayName: lic.eaName,
                mainText: lic.mainText,
                imageUrl: lic.eaImage,
                symbols: lic.symbols,
              });
              setLicenseOpen(false);
            }}
          >
            Connect License
          </button>
        </Modal>
      ) : null}
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
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        alignItems: 'end',
        zIndex: 50,
      }}
    >
      <div
        className="glow-card"
        style={{
          borderRadius: '24px 24px 0 0',
          maxHeight: '78vh',
          overflow: 'auto',
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: 'var(--muted)' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
