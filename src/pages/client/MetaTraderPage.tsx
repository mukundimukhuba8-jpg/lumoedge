import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Eye,
  EyeOff,
  ExternalLink,
  Home,
  Loader2,
  Monitor,
  RotateCcw,
  ScanSearch,
  Search,
  Star,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
} from '../../lib/interfaceStyle';
import {
  accountSummary,
  checkConnect,
  connectEx,
  disconnectMt5,
  searchBrokers,
  type Mt5AccountSummary,
  type Mt5Company,
  type Mt5ServerResult,
} from '../../lib/mt5Api';
import { loadJSON, saveJSON } from '../../lib/storage';

type ClientMt5 = {
  broker: string;
  server: string;
  accountType: string;
  login: string;
  password: string;
  connected: boolean;
  token?: string;
  company?: string;
  site?: string;
};

const MT5_KEY = 'ub-web/client-mt5-v1';

const POPULAR = [
  { label: 'Razor Markets', query: 'Razor' },
  { label: 'IC Markets', query: 'IC Markets' },
  { label: 'Exness', query: 'Exness' },
  { label: 'FTMO', query: 'FTMO' },
] as const;

const ACCOUNT_TYPES = ['Standard Live', 'Raw Spread', 'Demo'];

const EMPTY: ClientMt5 = {
  broker: 'Razor Markets',
  server: 'RazorMarkets-Live',
  accountType: 'Standard Live',
  login: '',
  password: '',
  connected: false,
  token: '',
  company: 'Razor Markets (Pty) Ltd',
  site: 'https://razormarkets.co.za',
};

function loadMt5(email: string | undefined): ClientMt5 {
  if (!email) return { ...EMPTY };
  const all = loadJSON<Record<string, ClientMt5>>(MT5_KEY, {});
  const saved = all[email.toLowerCase()] ?? {};
  return { ...EMPTY, ...saved, password: '' };
}

function saveMt5(email: string, data: ClientMt5) {
  const all = loadJSON<Record<string, ClientMt5>>(MT5_KEY, {});
  // Never persist password
  all[email.toLowerCase()] = { ...data, password: '' };
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
  const [brokerQuery, setBrokerQuery] = useState('Razor');
  const [companies, setCompanies] = useState<Mt5Company[]>([]);
  const [servers, setServers] = useState<Mt5ServerResult[]>([
    { name: 'RazorMarkets-Live', site: 'razormarkets.co.za' },
  ]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<Mt5AccountSummary | null>(null);
  const searchTimer = useRef<number | null>(null);

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
    const saved = loadMt5(user?.email);
    setForm(saved);
    if (saved.connected && saved.token) {
      void refreshAccount(saved.token);
    }
    // Prefill Razor servers from live API
    void runSearch('Razor', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const persist = (next: ClientMt5) => {
    setForm(next);
    if (user?.email) saveMt5(user.email, next);
  };

  const runSearch = async (query: string, open = true) => {
    const q = query.trim();
    if (q.length < 2) {
      setCompanies([]);
      return;
    }
    setSearching(true);
    try {
      const list = await searchBrokers(q);
      setCompanies(list);
      if (open) setBrokerOpen(true);
      // If current broker matches first result, refresh its servers
      const flat = list.flatMap((c) =>
        (c.results || []).map((r) => ({ ...r, company: c.company })),
      );
      if (flat.length && !form.connected) {
        const match =
          flat.find((r) => r.name === form.server) ||
          flat.find((r) =>
            r.name.toLowerCase().includes(form.broker.split(' ')[0]?.toLowerCase() || ''),
          ) ||
          flat[0];
        if (match) {
          setServers(
            list.find((c) => c.company === (match as { company?: string }).company)?.results ||
              list[0].results ||
              [],
          );
        }
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Broker search failed');
    } finally {
      setSearching(false);
    }
  };

  const onBrokerQuery = (value: string) => {
    setBrokerQuery(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void runSearch(value);
    }, 350);
  };

  const pickServer = (company: string, server: Mt5ServerResult) => {
    persist({
      ...form,
      broker: company.replace(/\s*\(.*\)\s*$/, '').trim() || company,
      company,
      server: server.name,
      site: server.site
        ? server.site.startsWith('http')
          ? server.site
          : `https://${server.site}`
        : form.site,
    });
    const co = companies.find((c) => c.company === company);
    setServers(co?.results || [server]);
    setBrokerOpen(false);
    setBrokerQuery(company);
  };

  const refreshAccount = async (token: string) => {
    try {
      const ok = await checkConnect(token);
      if (!ok) {
        persist({ ...form, connected: false, token: '' });
        setSummary(null);
        setStatus('Session expired — connect again');
        return;
      }
      const s = await accountSummary(token);
      setSummary(s);
    } catch {
      // keep UI connected; summary optional
    }
  };

  const connect = async () => {
    if (!form.login.trim() || !form.password.trim()) {
      alert('Enter login and password');
      return;
    }
    if (!form.server.trim()) {
      alert('Select an MT5 server');
      return;
    }
    setConnecting(true);
    setStatus('Connecting to broker…');
    try {
      const token = await connectEx({
        user: form.login.trim(),
        password: form.password,
        server: form.server.trim(),
      });
      const next: ClientMt5 = {
        ...form,
        connected: true,
        token,
        password: '',
      };
      persist(next);
      setStatus('Connected');
      try {
        const s = await accountSummary(token);
        setSummary(s);
      } catch {
        setSummary(null);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Connection failed');
      alert(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const unlink = async () => {
    if (!form.connected) return;
    if (!confirm('Unlink this MT5 broker account?')) return;
    const token = form.token;
    if (token) {
      try {
        await disconnectMt5(token);
      } catch {
        // still clear local
      }
    }
    persist({
      ...form,
      connected: false,
      token: '',
      password: '',
    });
    setSummary(null);
    setStatus('Disconnected');
  };

  const bg = eaImage
    ? `linear-gradient(180deg, rgba(6,8,14,0.72) 0%, rgba(6,8,14,0.88) 50%, rgba(6,8,14,0.96) 100%), url(${eaImage})`
    : undefined;

  const brokerLink =
    form.site ||
    (form.broker.toLowerCase().includes('razor')
      ? 'https://razormarkets.co.za'
      : undefined);

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
            onClick={() => void unlink()}
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
                {summary ? (
                  <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                    <div>
                      Balance:{' '}
                      <span style={{ color: 'var(--electric)', fontWeight: 700 }}>
                        {summary.balance?.toFixed?.(2) ?? summary.balance}{' '}
                        {summary.currency || ''}
                      </span>
                    </div>
                    <div className="muted">
                      Equity {summary.equity?.toFixed?.(2) ?? '—'} · Profit{' '}
                      {summary.profit?.toFixed?.(2) ?? '—'} · Leverage 1:
                      {summary.leverage ?? '—'}
                    </div>
                  </div>
                ) : null}
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
                href={brokerLink || 'https://razormarkets.co.za'}
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

              <div className="mt5-popular">
                {POPULAR.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="mt5-chip"
                    onClick={() => {
                      setBrokerQuery(p.query);
                      void runSearch(p.query);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="mt5-field">
                <label>BROKER</label>
                <div className="mt5-pass-wrap">
                  <input
                    className="mt5-input"
                    style={{ paddingLeft: 40 }}
                    value={brokerQuery}
                    onChange={(e) => onBrokerQuery(e.target.value)}
                    onFocus={() => {
                      if (companies.length) setBrokerOpen(true);
                    }}
                    placeholder="Search existing brokers…"
                  />
                  <span className="mt5-search-ico">
                    {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                  </span>
                </div>
                {brokerOpen && companies.length ? (
                  <div className="mt5-dropdown mt5-broker-drop">
                    {companies.slice(0, 12).map((co) => (
                      <div key={co.company} className="mt5-co-block">
                        <div className="mt5-co-name">{co.company}</div>
                        {(co.results || []).slice(0, 8).map((r) => (
                          <button
                            key={`${co.company}-${r.name}`}
                            type="button"
                            onClick={() => pickServer(co.company, r)}
                          >
                            {r.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
                {form.company ? (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Selected: {form.broker} · {form.server}
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
                  {(servers.length
                    ? servers
                    : [{ name: form.server || 'Select server' }]
                  ).map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
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

              {status ? (
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  {status}
                </p>
              ) : null}

              <button
                type="button"
                className="mt5-connect"
                onClick={() => void connect()}
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <Loader2 size={18} className="spin" style={{ marginRight: 8 }} />
                    Connecting…
                  </>
                ) : (
                  'Connect Account'
                )}
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

      <nav className="lay-dock" aria-label="Main">
        <button type="button" className="lay-dock-item" onClick={() => navigate('/app')}>
          <span className="lay-dock-ico">
            <Home size={20} />
          </span>
          <span>Home</span>
        </button>
        <button
          type="button"
          className="lay-dock-item"
          onClick={() => navigate('/app/scanner')}
        >
          <span className="lay-dock-ico">
            <ScanSearch size={20} />
          </span>
          <span>Scanner</span>
        </button>
        <button type="button" className="lay-dock-item active">
          <span className="lay-dock-ico">
            <Monitor size={20} />
          </span>
          <span>MetaTrader</span>
        </button>
      </nav>
    </div>
  );
}
