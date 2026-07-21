import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Cog,
  ExternalLink,
  Eye,
  EyeOff,
  Home,
  Layers,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Server,
  Shield,
  Star,
  TrendingUp,
  Unplug,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isPlaceholderMentorImage, resolveProfileImage } from '../../lib/mentorMedia';
import {
  connectEx,
  disconnectMt5,
  RAZOR_MARKETS,
  searchBrokers,
  type Mt5AccountDetails,
  type Mt5AccountSummary,
  type Mt5Company,
  type Mt5OpenedOrder,
  type Mt5ServerResult,
} from '../../lib/mt5Api';
import {
  clearMt5Session,
  getMt5AccountSnapshot,
  refreshMt5AccountNow,
  saveMt5Session,
  startMt5KeepAlive,
  subscribeMt5Account,
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

const ACCOUNT_TYPES = ['100% Bonus Standard', '200%'];

const CONNECTION_STEPS = [
  'Initializing Engine',
  'Validating MT5 Credentials',
  'Detecting Broker Server',
  'Establishing Secure Connection',
  'Verifying Account',
  'Synchronizing Account Data',
  'Loading Trading Environment',
  'Connection Complete',
] as const;

const STEP_INTERVAL_MS = 1800;
const ESTIMATED_CONNECT_MS = CONNECTION_STEPS.length * STEP_INTERVAL_MS;

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
  // Not connected → RazorMarkets defaults from swagger broker list
  if (!merged.connected) {
    return {
      ...merged,
      broker: RAZOR_MARKETS.broker,
      company: RAZOR_MARKETS.company,
      site: RAZOR_MARKETS.site,
      server: RAZOR_MARKETS.server,
      accountType: RAZOR_MARKETS.accountType,
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
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';
  const profileRef = resolveProfileImage(bot.imageUrl, bot.customMedia);
  const [eaImage, setEaImage] = useState('');
  const [form, setForm] = useState<ClientMt5>(() => loadMt5(user?.email));
  const [showPass, setShowPass] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [brokerQuery, setBrokerQuery] = useState('');
  const [companies, setCompanies] = useState<Mt5Company[]>([]);
  const [servers, setServers] = useState<Mt5ServerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('');
  const [notConnecting, setNotConnecting] = useState(false);
  const [summary, setSummary] = useState<Mt5AccountSummary | null>(
    () => getMt5AccountSnapshot(user?.email).summary,
  );
  const [details, setDetails] = useState<Mt5AccountDetails | null>(
    () => getMt5AccountSnapshot(user?.email).details,
  );
  const [positions, setPositions] = useState<Mt5OpenedOrder[]>(
    () => getMt5AccountSnapshot(user?.email).positions,
  );
  const [conn, setConn] = useState<Mt5SessionInfo | null>(null);
  const [visualStep, setVisualStep] = useState(0);
  const [connectStartedAt, setConnectStartedAt] = useState<number | null>(null);
  const [, setUiTick] = useState(0);
  const searchTimer = useRef<number | null>(null);
  const bootedEmail = useRef<string | undefined>(undefined);
  const stepTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profileRef || isPlaceholderMentorImage(profileRef)) {
        if (!cancelled) setEaImage('');
        return;
      }
      const { resolveDisplayImage } = await import('../../lib/storage');
      const resolved = (await resolveDisplayImage(profileRef)) || profileRef;
      if (!cancelled && !isPlaceholderMentorImage(resolved)) setEaImage(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileRef]);

  useEffect(() => {
    if (!user?.email) return;
    if (bootedEmail.current === user.email) return;
    bootedEmail.current = user.email;
    const saved = loadMt5(user.email);
    setForm(saved);
    setBrokerQuery(saved.broker || RAZOR_MARKETS.broker);
    const cached = getMt5AccountSnapshot(user.email);
    setSummary(cached.summary);
    setDetails(cached.details);
    setPositions(cached.positions);
    if (!saved.connected) {
      void runSearch('Razor', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // Live connection status — keep-alive runs app-wide; account data stays cached
  useEffect(() => {
    if (!user?.email) return;
    const unsubStatus = subscribeMt5Status(user.email, (info) => {
      setConn(info);
      if (info.state === 'connected' && info.token) {
        setForm((prev) =>
          prev.connected && prev.token === info.token
            ? prev
            : { ...prev, connected: true, token: info.token },
        );
      }
      if (info.state === 'disconnected') {
        setForm((prev) =>
          prev.connected ? { ...prev, connected: false, token: '' } : prev,
        );
      }
    });
    const unsubAccount = subscribeMt5Account(user.email, (snap) => {
      setSummary(snap.summary);
      setDetails(snap.details);
      setPositions(snap.positions);
    });
    startMt5KeepAlive(user.email);
    return () => {
      unsubStatus();
      unsubAccount();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  // UI-only connection engine step animation (does not affect broker logic)
  useEffect(() => {
    if (stepTimer.current) window.clearInterval(stepTimer.current);
    if (!connecting) return;
    setConnectStartedAt(Date.now());
    setVisualStep(0);
    stepTimer.current = window.setInterval(() => {
      setVisualStep((s) => Math.min(s + 1, CONNECTION_STEPS.length - 2));
    }, STEP_INTERVAL_MS);
    return () => {
      if (stepTimer.current) window.clearInterval(stepTimer.current);
    };
  }, [connecting]);

  useEffect(() => {
    if (!connecting) return;
    const id = window.setInterval(() => setUiTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [connecting]);

  useEffect(() => {
    if (form.connected) {
      setVisualStep(CONNECTION_STEPS.length - 1);
      setConnectStartedAt(null);
    }
  }, [form.connected]);

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
      const flat = list.flatMap((c) =>
        (c.results || []).map((r) => ({ ...r, company: c.company })),
      );
      if (flat.length && !form.connected) {
        const razor =
          flat.find((r) => r.name === RAZOR_MARKETS.server) ||
          flat.find((r) => /razormarkets-live/i.test(r.name));
        const match =
          razor ||
          flat.find((r) => r.name === form.server) ||
          flat.find((r) =>
            r.name.toLowerCase().includes(form.broker.split(' ')[0]?.toLowerCase() || ''),
          ) ||
          flat[0];
        if (match) {
          const companyName = (match as { company?: string }).company || list[0]?.company || '';
          setServers(
            list.find((c) => c.company === companyName)?.results ||
              list[0].results ||
              [],
          );
          if (razor || !form.server) {
            persist({
              ...form,
              broker: RAZOR_MARKETS.broker,
              company: companyName,
              server: match.name,
              site: match.site
                ? match.site.startsWith('http')
                  ? match.site
                  : `https://${match.site}`
                : RAZOR_MARKETS.site,
              accountType: form.accountType || RAZOR_MARKETS.accountType,
            });
          }
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

  const refreshAccount = (_token: string) => {
    if (user?.email) refreshMt5AccountNow(user.email);
  };

  const connect = async () => {
    if (!form.login.trim() || !form.password.trim()) {
      setNotConnecting(false);
      setStatus('Enter login and password');
      return;
    }
    if (!form.server.trim()) {
      setNotConnecting(false);
      setStatus('Select an MT5 server');
      return;
    }
    setConnecting(true);
    setNotConnecting(false);
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
      setNotConnecting(false);
      setStatus('Connected');
      void refreshAccount(token);
    } catch {
      setNotConnecting(true);
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

  const progressPct = Math.round(((visualStep + 1) / CONNECTION_STEPS.length) * 100);
  const ringOffset = 283 - (283 * progressPct) / 100;
  const elapsedMs = connectStartedAt ? Date.now() - connectStartedAt : 0;
  const remainingSec = connecting
    ? Math.max(0, Math.ceil((ESTIMATED_CONNECT_MS - elapsedMs) / 1000))
    : 0;

  const bannerState = form.connected
    ? 'success'
    : notConnecting
      ? 'failed'
      : connecting
        ? visualStep >= 4
          ? 'sync'
          : visualStep >= 1
            ? 'auth'
            : 'connecting'
        : conn?.state === 'reconnecting'
          ? 'sync'
          : 'idle';

  const bannerText =
    bannerState === 'success'
      ? 'Connected Successfully'
      : bannerState === 'failed'
        ? 'Connection Failed'
        : bannerState === 'sync'
          ? 'Synchronizing…'
          : bannerState === 'auth'
            ? 'Authenticating…'
            : bannerState === 'connecting'
              ? 'Connecting…'
              : status || 'Ready to connect';

  const statusItems = [
    { icon: Building2, label: 'Broker', value: form.broker || RAZOR_MARKETS.broker },
    { icon: Server, label: 'Server', value: form.server || '—' },
    { icon: User, label: 'Account Number', value: String(details?.login ?? (form.login || '—')) },
    { icon: Layers, label: 'Account Type', value: form.accountType || '—' },
    {
      icon: Shield,
      label: 'Leverage',
      value: summary?.leverage ? `1:${summary.leverage}` : '—',
    },
    {
      icon: Wallet,
      label: 'Balance',
      value: summary
        ? `${summary.balance?.toFixed?.(2) ?? summary.balance} ${summary.currency || ''}`
        : '—',
    },
    {
      icon: TrendingUp,
      label: 'Equity',
      value: summary?.equity != null ? summary.equity.toFixed(2) : '—',
    },
    {
      icon: BarChart3,
      label: 'Margin',
      value: summary?.margin != null ? summary.margin.toFixed(2) : '—',
    },
    { icon: Activity, label: 'Connection Status', value: connLabel, accent: connColor },
  ];

  return (
    <div className="app-shell mt5-shell mt5-cyber">
      <div className="mt5-cyber-bg" aria-hidden>
        <div className="mt5-cyber-grid" />
        <div className="mt5-cyber-glow mt5-cyber-glow-a" />
        <div className="mt5-cyber-glow mt5-cyber-glow-b" />
        <div className="mt5-cyber-particles">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="mt5-particle" />
          ))}
        </div>
        <div className="mt5-cyber-lines" />
      </div>

      <div className="mt5-page">
        <header className="mt5-cyber-header">
          <div className="mt5-engine-badge" aria-hidden>
            <Cog size={22} className="mt5-engine-icon" />
          </div>
          <div className="mt5-cyber-titles">
            <h1 className="mt5-cyber-title">MT5 Engine</h1>
            <p className="mt5-cyber-sub">Secure Broker Connection</p>
            <span className="mt5-cyber-ea">{eaTitle}</span>
          </div>
          <div
            className={`mt5-live-pill${form.connected || connecting ? ' live' : ''}`}
            style={{ '--live-color': connColor } as CSSProperties}
          >
            <span className="mt5-live-dot" aria-hidden />
            <span>{connLabel}</span>
          </div>
        </header>

        <div className={`mt5-banner mt5-banner-${bannerState}`} role="status">
          <Zap size={16} aria-hidden />
          <span>{bannerText}</span>
          {status && bannerState === 'idle' && status !== bannerText ? (
            <span className="mt5-banner-sub">{status}</span>
          ) : null}
          {notConnecting ? <span className="mt5-banner-sub">Not connecting</span> : null}
        </div>

        {connecting ? (
          <section className="mt5-glass mt5-engine-panel">
            <div className="mt5-engine-head">
              <h2>Connection Engine</h2>
              <span className="mt5-engine-tag">Live sequence</span>
            </div>
            <div className="mt5-progress-row">
              <div className="mt5-ring-wrap" aria-hidden>
                <svg viewBox="0 0 100 100" className="mt5-ring">
                  <circle className="mt5-ring-track" cx="50" cy="50" r="45" />
                  <circle
                    className="mt5-ring-fill"
                    cx="50"
                    cy="50"
                    r="45"
                    style={{ strokeDashoffset: ringOffset }}
                  />
                </svg>
                <div className="mt5-ring-label">
                  <strong>{progressPct}%</strong>
                  <small>Complete</small>
                </div>
              </div>
              <div className="mt5-progress-meta">
                <div className="mt5-est">
                  <span>Estimated remaining</span>
                  <strong>{remainingSec}s</strong>
                </div>
                <div className="mt5-load-bar">
                  <span className="mt5-load-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="mt5-flow-line">
                  <span className="mt5-flow-pulse" />
                  Streaming encrypted broker handshake…
                </p>
              </div>
            </div>
            <ol className="mt5-steps">
              {CONNECTION_STEPS.map((label, i) => {
                const done = i < visualStep || (form.connected && i <= visualStep);
                const active = i === visualStep && connecting;
                const dim = i > visualStep && !form.connected;
                return (
                  <li
                    key={label}
                    className={`mt5-step${done ? ' done' : ''}${active ? ' active' : ''}${dim ? ' dim' : ''}`}
                  >
                    <span className="mt5-step-ico" aria-hidden>
                      {done ? <Check size={14} /> : active ? <Loader2 size={14} className="spin" /> : i + 1}
                    </span>
                    <span className="mt5-step-text">{label}</span>
                    {active ? <span className="mt5-step-line" aria-hidden /> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {form.connected ? (
          <>
            <section className={`mt5-glass mt5-status-grid${form.connected ? ' mt5-success-pop' : ''}`}>
              <div className="mt5-panel-head">
                <h2>Broker Status</h2>
                <div className="mt5-panel-actions">
                  <button
                    type="button"
                    className="mt5-btn mt5-btn-ghost"
                    onClick={() => refreshAccount(form.token || conn?.token || '')}
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                  <button type="button" className="mt5-btn mt5-btn-danger" onClick={() => void unlink()}>
                    <Unplug size={16} />
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="mt5-stat-grid">
                {statusItems.map(({ icon: Icon, label, value, accent }) => (
                  <div key={label} className="mt5-stat-card">
                    <span className="mt5-stat-icon" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <div>
                      <span className="mt5-stat-label">{label}</span>
                      <strong style={accent ? { color: accent } : undefined}>{value}</strong>
                    </div>
                  </div>
                ))}
              </div>
              {details?.userName ? (
                <p className="mt5-account-name">{String(details.userName)}</p>
              ) : null}
              {conn?.lastError ? <p className="mt5-warn">{conn.lastError}</p> : null}
              <p className="mt5-hint">Auto-reconnect is on — use Disconnect to unlink</p>
              {eaImage ? (
                <img className="mt5-profile-float" src={eaImage} alt="" />
              ) : (
                <div className="mt5-profile-float mt5-avatar-empty" aria-hidden />
              )}
            </section>
          </>
        ) : (
          <section className="mt5-glass mt5-form-panel">
            <a
              className="mt5-recommended mt5-rec-cyber"
              href="https://razormarkets.co.za"
              target="_blank"
              rel="noreferrer"
            >
              <span className="mt5-star">
                <Star size={16} fill="currentColor" />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <div className="mt5-rec-label">RECOMMENDED BROKER</div>
                <div className="mt5-rec-name">{RAZOR_MARKETS.broker}</div>
              </span>
              <ExternalLink size={16} />
            </a>

            <div className="mt5-field">
              <label>BROKER</label>
              <div className="mt5-pass-wrap">
                <input
                  className="mt5-input mt5-input-cyber"
                  style={{ paddingLeft: 40, paddingRight: 40 }}
                  value={brokerQuery}
                  onChange={(e) => onBrokerQuery(e.target.value)}
                  onFocus={() => setBrokerOpen(true)}
                  placeholder="Search Broker"
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
                  className="mt5-input mt5-input-cyber"
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
                  {form.server && !servers.some((s) => s.name === form.server) ? (
                    <option value={form.server}>{form.server}</option>
                  ) : null}
                </select>
                <span className="mt5-chevron" aria-hidden>
                  <ChevronDown size={16} />
                </span>
              </div>
            </div>

            <div className="mt5-field">
              <label>ACCOUNT TYPE</label>
              <div className="mt5-pass-wrap">
                <select
                  className="mt5-input mt5-input-cyber"
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
                className="mt5-input mt5-input-cyber"
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
                  className="mt5-input mt5-input-cyber"
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

            <div className="mt5-btn-row">
              <button
                type="button"
                className="mt5-btn mt5-btn-primary"
                onClick={() => void connect()}
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Connect Broker
                  </>
                )}
              </button>
              {notConnecting ? (
                <button
                  type="button"
                  className="mt5-btn mt5-btn-secondary"
                  onClick={() => void connect()}
                  disabled={connecting}
                >
                  <RefreshCw size={16} />
                  Retry Connection
                </button>
              ) : null}
            </div>
          </section>
        )}

        {form.connected && positions.length ? (
          <section className="mt5-glass mt5-positions-panel">
            <h2 className="mt5-panel-title">
              Open Positions <span>({positions.length})</span>
            </h2>
            <div className="mt5-pos-list">
              {positions.slice(0, 10).map((p, i) => {
                const profit = Number(p.profit ?? 0);
                const side = String(p.orderType || p.type || '').toUpperCase();
                return (
                  <div key={String(p.ticket ?? i)} className="mt5-pos-row">
                    <div>
                      <strong>{String(p.symbol || '—')}</strong>{' '}
                      <span className={side.includes('SELL') ? 'sell' : 'buy'}>{side || '—'}</span>
                      <div className="mt5-pos-meta">
                        #{String(p.ticket ?? '—')} · {Number(p.lots ?? p.volume ?? 0)} lots
                      </div>
                    </div>
                    <div className={profit >= 0 ? 'profit-up' : 'profit-down'}>
                      {profit >= 0 ? '+' : ''}
                      {profit.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <nav className="lay-dock" aria-label="Main">
        <button type="button" className="lay-dock-item" onClick={() => navigate('/app')}>
          <span className="lay-dock-ico">
            <Home size={20} />
          </span>
          <span>Home</span>
        </button>
        <button type="button" className="lay-dock-item" onClick={() => navigate('/app/scanner')}>
          <span className="lay-dock-ico">
            <Search size={20} />
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
