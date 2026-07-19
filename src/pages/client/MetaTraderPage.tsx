import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Eye,
  EyeOff,
  ExternalLink,
  Home,
  Monitor,
  RotateCcw,
  Search,
  Star,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
} from '../../lib/interfaceStyle';
import { loadJSON, saveJSON } from '../../lib/storage';

type ClientMt5 = {
  broker: string;
  server: string;
  accountType: string;
  login: string;
  password: string;
  connected: boolean;
};

const MT5_KEY = 'ub-web/client-mt5-v1';

const BROKERS = ['Razor Markets', 'IC Markets', 'Exness', 'FTMO'] as const;
const SERVERS: Record<string, string[]> = {
  'Razor Markets': ['RazorMarkets-Live', 'RazorMarkets-Demo'],
  'IC Markets': ['ICMarkets-Live', 'ICMarkets-Demo'],
  Exness: ['Exness-MT5Real', 'Exness-MT5Trial'],
  FTMO: ['FTMO-Server', 'FTMO-Demo'],
};
const ACCOUNT_TYPES = ['Standard Live', 'Raw Spread', 'Demo'];

const EMPTY: ClientMt5 = {
  broker: 'Razor Markets',
  server: 'RazorMarkets-Live',
  accountType: 'Standard Live',
  login: '',
  password: '',
  connected: false,
};

function loadMt5(email: string | undefined): ClientMt5 {
  if (!email) return { ...EMPTY };
  const all = loadJSON<Record<string, ClientMt5>>(MT5_KEY, {});
  return { ...EMPTY, ...(all[email.toLowerCase()] ?? {}) };
}

function saveMt5(email: string, data: ClientMt5) {
  const all = loadJSON<Record<string, ClientMt5>>(MT5_KEY, {});
  all[email.toLowerCase()] = data;
  saveJSON(MT5_KEY, all);
}

export function MetaTraderPage() {
  const navigate = useNavigate();
  const { bot, user } = useApp();
  const prefs = useMemo(() => loadInterfacePrefs(), []);
  const accent = accentHex(prefs.accent);
  const accentRgb = hexToRgb(accent);
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';
  const eaImage = bot.imageUrl || '/bull-avatar.jpg';

  const [form, setForm] = useState<ClientMt5>(() => loadMt5(user?.email));
  const [showPass, setShowPass] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--electric', accent);
    root.style.setProperty('--accent-rgb', accentRgb);
    return () => {
      root.style.setProperty('--electric', '#3b82f6');
      root.style.removeProperty('--accent-rgb');
    };
  }, [accent, accentRgb]);

  useEffect(() => {
    setForm(loadMt5(user?.email));
  }, [user?.email]);

  const servers = SERVERS[form.broker] || SERVERS['Razor Markets'];

  const persist = (next: ClientMt5) => {
    setForm(next);
    if (user?.email) saveMt5(user.email, next);
  };

  const connect = () => {
    if (!form.login.trim() || !form.password.trim()) {
      alert('Enter login and password');
      return;
    }
    persist({ ...form, login: form.login.trim(), connected: true });
  };

  const unlink = () => {
    if (!form.connected) return;
    if (!confirm('Unlink this MT5 broker account?')) return;
    persist({ ...form, connected: false, password: '' });
  };

  const bg = eaImage
    ? `linear-gradient(180deg, rgba(6,8,14,0.72) 0%, rgba(6,8,14,0.88) 50%, rgba(6,8,14,0.96) 100%), url(${eaImage})`
    : undefined;

  return (
    <div className="app-shell mt5-shell">
      <div
        className="mt5-page"
        style={{
          backgroundImage: bg,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <header className="mt5-header">
          <div style={{ width: 44 }} />
          <div className="mt5-titles">
            <h1 className="mt5-brand">
              <span>Meta</span>
              <span className="accent">Trader</span>
            </h1>
            <div className="mt5-ea">{eaTitle}</div>
          </div>
          <button
            type="button"
            className="mt5-unlink"
            aria-label="Unlink / reset broker"
            onClick={unlink}
            title="Unlink broker"
          >
            <RotateCcw size={18} color="#fff" />
          </button>
        </header>

        <div className="mt5-card">
          <h2 className="mt5-card-title">MT5 Connection</h2>

          {form.connected ? (
            <div className="mt5-connected">
              <div className="mt5-connected-box">
                <strong>MT5 account connected</strong>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  · {form.login} on {form.server}
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
                  Use the red button above to unlink this broker
                </div>
              </div>
              <img className="mt5-connected-avatar" src={eaImage} alt="" />
            </div>
          ) : (
            <>
              <a
                className="mt5-recommended"
                href="https://razormarkets.com"
                target="_blank"
                rel="noreferrer"
              >
                <span className="mt5-star">
                  <Star size={16} fill="currentColor" />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <div className="mt5-rec-label">RECOMMENDED BROKER</div>
                  <div className="mt5-rec-name">Razor Markets</div>
                </span>
                <ExternalLink size={16} />
              </a>

              <div className="mt5-field">
                <label>BROKER</label>
                <button
                  type="button"
                  className="mt5-input mt5-select"
                  onClick={() => setBrokerOpen((v) => !v)}
                >
                  <Search size={16} className="mt5-input-icon" />
                  <span>{form.broker}</span>
                </button>
                {brokerOpen ? (
                  <div className="mt5-dropdown">
                    {BROKERS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => {
                          const nextServers = SERVERS[b] || [];
                          persist({
                            ...form,
                            broker: b,
                            server: nextServers[0] || form.server,
                          });
                          setBrokerOpen(false);
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt5-field">
                <label>SELECT SERVER</label>
                <select
                  className="mt5-input"
                  value={form.server}
                  onChange={(e) => persist({ ...form, server: e.target.value })}
                >
                  {servers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt5-field">
                <label>ACCOUNT TYPE</label>
                <select
                  className="mt5-input"
                  value={form.accountType}
                  onChange={(e) => persist({ ...form, accountType: e.target.value })}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt5-field">
                <label>LOGIN</label>
                <input
                  className="mt5-input"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="Enter MT5 login"
                  inputMode="numeric"
                />
              </div>

              <div className="mt5-field">
                <label>PASSWORD</label>
                <div className="mt5-pass-wrap">
                  <input
                    className="mt5-input"
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    className="mt5-eye"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label="Toggle password"
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="button" className="mt5-connect" onClick={connect}>
                Connect Account
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="mt5-fab"
          aria-label="AI assistant"
          onClick={() => alert('Lumo AI assistant — coming soon.')}
        >
          <Bot size={22} color="#061018" />
        </button>
      </div>

      <div className="tabbar">
        <button type="button" onClick={() => navigate('/app')}>
          <Home size={20} /> Home
        </button>
        <button type="button" className="active">
          <Monitor size={20} /> MetaTrader
        </button>
      </div>
    </div>
  );
}
