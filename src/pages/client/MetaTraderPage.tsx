import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Home,
  Loader2,
  Monitor,
  RotateCcw,
  Search,
  Star,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isPlaceholderMentorImage } from '../../lib/mentorMedia';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from '../../lib/interfaceStyle';
import { getTerminalUrl } from '../../lib/brokerTerminals';
import {
  accountDetails,
  accountSummary,
  connectEx,
  disconnectMt5,
  listKnownBrokers,
  openedOrders,
  searchBrokers,
  type Mt5AccountDetails,
  type Mt5AccountSummary,
  type Mt5Company,
  type Mt5OpenedOrder,
  type Mt5ServerResult,
} from '../../lib/mt5Api';
import {
  clearMt5Session,
  saveMt5Session,
  startMt5KeepAlive,
  stopMt5KeepAlive,
  subscribeMt5Status,
  type Mt5SessionInfo,
} from '../../lib/mt5Session';
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

const ACCOUNT_TYPES = ['Standard Live', 'Raw Spread', 'Demo'];

const EMPTY: ClientMt5 = {
  broker: '',
  server: '',
  accountType: '',
  login: '',
  password: '',
  connected: false,
  token: '',
  company: '',
  site: '',
};

function loadMt5(email: string | undefined): ClientMt5 {
  if (!email) return { ...EMPTY };
  const all = loadJSON<Record<string, ClientMt5>>(MT5_KEY, {});
  const saved = all[email.toLowerCase()] ?? {};
  const merged = { ...EMPTY, ...saved, password: '' };
  // Not connected → clean slate: the user picks their own broker every time
  if (!merged.connected) {
    return {
      ...merged,
      broker: '',
      company: '',
      site: '',
      server: '',
      accountType: '',
    };
  }
  return merged;
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
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);
  const accent = accentHex(prefs.accent);
  const accentRgb = hexToRgb(accent);
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';
  const eaImage =
    bot.imageUrl && !isPlaceholderMentorImage(bot.imageUrl) ? bot.imageUrl : '';

  const [form, setForm] = useState<ClientMt5>(() => loadMt5(user?.email));
  const [showPass, setShowPass] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [brokerQuery, setBrokerQuery] = useState('');
  const [companies, setCompanies] = useState<Mt5Company[]>([]);
  const [servers, setServers] = useState<Mt5ServerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<Mt5AccountSummary | null>(null);
  const [details, setDetails] = useState<Mt5AccountDetails | null>(null);
  const [positions, setPositions] = useState<Mt5OpenedOrder[]>([]);
  const [conn, setConn] = useState<Mt5SessionInfo | null>(null);
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
    setBrokerQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Live connection status — keep-alive pings + auto-reconnect in mt5Session
  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeMt5Status(user.email, (info) => {
      setConn(info);
      if (info.state === 'connected' && info.token) {
        setForm((prev) =>
          prev.connected && prev.token === info.token
            ? prev
            : { ...prev, connected: true, token: info.token },
        );
        void refreshAccount(info.token);
      }
      if (info.state === 'disconnected') {
        setSummary(null);
        setPositions([]);
        setForm((prev) =>
          prev.connected ? { ...prev, connected: false, token: '' } : prev,
        );
      }
    });
    startMt5KeepAlive(user.email);
    return () => {
      unsub();
      stopMt5KeepAlive(user.email);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Refresh balance/equity/positions every 20s while connected
  useEffect(() => {
    if (conn?.state !== 'connected' || !conn.token) return;
    const id = window.setInterval(() => {
      void refreshAccount(conn.token);
    }, 20_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.state, conn?.token]);

  const persist = (next: ClientMt5) => {
    setForm(next);
    if (user?.email) saveMt5(user.email, next);
  };

  const runSearch = (query: string, open = true) => {
    const q = query.trim();
    if (q.length < 2) {
      setCompanies([]);
      return;
    }
    setSearching(true);
    try {
      const list = searchBrokers(q);
      setCompanies(list);
      if (open) setBrokerOpen(true);
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
    } finally {
      setSearching(false);
    }
  };

  const onBrokerQuery = (value: string) => {
    setBrokerQuery(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      runSearch(value);
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
      const [s, d, p] = await Promise.allSettled([
        accountSummary(token),
        accountDetails(token),
        openedOrders(token),
      ]);
      if (s.status === 'fulfilled') setSummary(s.value);
      if (d.status === 'fulfilled') setDetails(d.value);
      if (p.status === 'fulfilled') setPositions(p.value);
    } catch {
      // keep-alive loop handles dead sessions
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
      // Save encrypted credentials so keep-alive can auto-reconnect
      if (user?.email) {
        await saveMt5Session(user.email, {
          server: form.server.trim(),
          login: form.login.trim(),
          token,
          password: form.password,
        });
        startMt5KeepAlive(user.email);
      }
      setStatus('Connected');
      void refreshAccount(token);
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
    if (user?.email) clearMt5Session(user.email);
    persist({
      ...form,
      connected: false,
      token: '',
      password: '',
    });
    setSummary(null);
    setPositions([]);
    setDetails(null);
    setStatus('Disconnected');
  };

  const connLabel =
    conn?.state === 'connected'
      ? 'Connected'
      : conn?.state === 'reconnecting'
        ? 'Reconnecting…'
        : conn?.state === 'connecting'
          ? 'Checking…'
          : 'Disconnected';
  const connColor =
    conn?.state === 'connected'
      ? '#34d399'
      : conn?.state === 'reconnecting' || conn?.state === 'connecting'
        ? '#fbbf24'
        : '#f87171';

  const terminalUrl =
    servers.find((s) => s.name === form.server)?.terminalUrl ||
    getTerminalUrl(form.server);

  return (
    <div className="app-shell mt5-shell">
      <div className="mt5-page">
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: connColor,
                      boxShadow: `0 0 8px ${connColor}`,
                      display: 'inline-block',
                    }}
                  />
                  <strong style={{ color: connColor }}>{connLabel}</strong>
                </div>
                <strong>MT5 account connected</strong>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  Account {details?.login ?? form.login} · {form.server}
                </div>
                {details?.userName ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {String(details.userName)}
                  </div>
                ) : null}
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
                      {summary.profit?.toFixed?.(2) ?? '—'} · Free margin{' '}
                      {summary.freeMargin?.toFixed?.(2) ?? '—'} · Leverage 1:
                      {summary.leverage ?? '—'}
                    </div>
                  </div>
                ) : null}
                {conn?.lastError ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#fbbf24' }}>
                    {conn.lastError}
                  </div>
                ) : null}
                <div className="muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4 }}>
                  Auto-reconnect is on — use the red button above to unlink
                </div>
              </div>
              {eaImage ? (
                <img className="mt5-connected-avatar" src={eaImage} alt="" />
              ) : (
                <div className="mt5-connected-avatar mt5-avatar-empty" aria-hidden />
              )}
            </div>
          ) : (
            <>
              <a
                className="mt5-recommended"
                href="https://razormarkets.co.za"
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
                <div className="mt5-pass-wrap">
                  <input
                    className="mt5-input"
                    style={{ paddingLeft: 40, paddingRight: 40 }}
                    value={brokerQuery}
                    onChange={(e) => onBrokerQuery(e.target.value)}
                    onFocus={() => {
                      if (!companies.length) setCompanies(listKnownBrokers());
                      setBrokerOpen(true);
                    }}
                    placeholder="Search supported brokers"
                  />
                  <span className="mt5-search-ico">
                    {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                  </span>
                  <span className="mt5-chevron" aria-hidden>
                    <ChevronDown size={16} />
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
              </div>

              <div className="mt5-field">
                <label>SELECT SERVER</label>
                <div className="mt5-pass-wrap">
                  <select
                    className="mt5-input"
                    style={{
                      paddingRight: 40,
                      color: form.server ? undefined : 'var(--muted)',
                    }}
                    value={form.server}
                    onChange={(e) => persist({ ...form, server: e.target.value })}
                  >
                    <option value="" disabled hidden>
                      Select broker server
                    </option>
                    {servers.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt5-chevron" aria-hidden>
                    <ChevronDown size={16} />
                  </span>
                </div>
                {terminalUrl ? (
                  <a
                    className="btn btn-ghost"
                    href={terminalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      width: '100%',
                      marginTop: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <ExternalLink size={16} />
                    Open web terminal
                  </a>
                ) : null}
              </div>

              <div className="mt5-field">
                <label>ACCOUNT TYPE</label>
                <div className="mt5-pass-wrap">
                  <select
                    className="mt5-input"
                    style={{
                      paddingRight: 40,
                      color: form.accountType ? undefined : 'var(--muted)',
                    }}
                    value={form.accountType}
                    onChange={(e) => persist({ ...form, accountType: e.target.value })}
                  >
                    <option value="" disabled hidden>
                      Select account type
                    </option>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="mt5-chevron" aria-hidden>
                    <ChevronDown size={16} />
                  </span>
                </div>
              </div>

              <div className="mt5-field">
                <label>LOGIN</label>
                <input
                  className="mt5-input"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="Enter your MT5 login"
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
                    placeholder="Enter your password"
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

        {form.connected && positions.length ? (
          <div className="mt5-card" style={{ marginTop: 12 }}>
            <h2 className="mt5-card-title">Open Positions ({positions.length})</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {positions.slice(0, 10).map((p, i) => {
                const profit = Number(p.profit ?? 0);
                const side = String(p.orderType || p.type || '').toUpperCase();
                return (
                  <div
                    key={String(p.ticket ?? i)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'rgba(10,14,24,0.55)',
                      border: '1px solid rgba(59,130,246,0.25)',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong>{String(p.symbol || '—')}</strong>{' '}
                      <span
                        style={{
                          color: side.includes('SELL') ? '#f87171' : '#34d399',
                          fontWeight: 700,
                        }}
                      >
                        {side || '—'}
                      </span>
                      <div className="muted" style={{ fontSize: 11 }}>
                        #{String(p.ticket ?? '—')} · {Number(p.lots ?? p.volume ?? 0)} lots
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: profit >= 0 ? '#34d399' : '#f87171',
                      }}
                    >
                      {profit >= 0 ? '+' : ''}
                      {profit.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

      </div>

      <nav className="lay-dock" aria-label="Main">
        <button type="button" className="lay-dock-item" onClick={() => navigate('/app')}>
          <span className="lay-dock-ico">
            <Home size={20} />
          </span>
          <span>Home</span>
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
