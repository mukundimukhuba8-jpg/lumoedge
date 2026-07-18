import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { Placeholder } from './AdminShell';

export function DashboardPage() {
  const { profile, stats, admin } = useAdmin();
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Welcome, {profile.firstName} {profile.lastName}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 11 }}>MENTOR ID</span>
              <span style={{ border: '1px solid var(--electric)', borderRadius: 999, padding: '3px 10px', color: 'var(--electric)', fontWeight: 700 }}>
                {profile.mentorId}
              </span>
            </div>
          </div>
          <span style={{ background: 'var(--electric)', color: '#061018', borderRadius: 999, padding: '4px 10px', fontWeight: 700, height: 'fit-content' }}>
            {admin?.role === 'super' ? 'SUPER' : 'ADMIN'}
          </span>
        </div>
      </div>
      <div className="stat-grid">
        <Stat value={String(stats.activeLicenses)} label="Active Licenses" color="var(--green)" />
        <Stat value={String(stats.pendingClients)} label="Pending Approvals" color="var(--orange)" />
        <Stat value={String(stats.deletedLicenses)} label="Deleted Licenses" color="var(--red)" />
        <Stat value={String(stats.totalClients)} label="Total Clients" color="var(--electric)" />
      </div>
      <div className="glow-card">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong className="muted">LICENSE USAGE</strong>
          <span style={{ color: 'var(--electric)' }}>{stats.activeLicenses} active / ∞ max</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: '#1b2438', margin: '10px 0' }}>
          <div style={{ width: '100%', height: '100%', background: 'var(--electric)', borderRadius: 999 }} />
        </div>
        <div style={{ color: 'var(--green)', fontWeight: 600 }}>Unlimited clients — no cap on your account.</div>
      </div>
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="stat-card">
      <div style={{ color, fontFamily: 'var(--font-display)', fontSize: 28 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

export function ManageEAsPage() {
  const { eas, createEA, deleteEA } = useAdmin();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [symbols, setSymbols] = useState<string[]>([]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Create New EA</h3>
        <div className="field"><label>EA Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter EA name" /></div>
        <div className="field">
          <label>Symbols / Pairs</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type symbol (e.g. XAUUSD)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const s = draft.trim().toUpperCase();
                  if (s && !symbols.includes(s)) setSymbols((p) => [...p, s]);
                  setDraft('');
                }
              }}
            />
            <button
              type="button"
              className="btn btn-blue"
              style={{ width: 48 }}
              onClick={() => {
                const s = draft.trim().toUpperCase();
                if (s && !symbols.includes(s)) setSymbols((p) => [...p, s]);
                setDraft('');
              }}
            >
              <Plus size={18} />
            </button>
          </div>
          <div>{symbols.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => setSymbols((p) => p.filter((x) => x !== s))}>{s} ×</button>
          ))}</div>
        </div>
        <button
          className="btn btn-blue"
          type="button"
          onClick={() => {
            if (!name.trim() || !symbols.length) return alert('EA name and symbols required');
            createEA({ name: name.trim(), symbols, lotSize: 0.01, direction: 'both' });
            setName('');
            setSymbols([]);
          }}
        >
          Create EA
        </button>
      </div>
      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Created EAs</h3>
        {eas.map((ea) => (
          <div key={ea.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <strong>{ea.name}</strong>
              <div className="muted">{ea.symbols.length} symbols · lot {ea.lotSize} · {ea.direction}</div>
            </div>
            <button type="button" onClick={() => deleteEA(ea.id)} style={{ background: 'var(--red)', borderRadius: 17, width: 34, height: 34, color: '#fff' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GenerateLicensePage() {
  const { eas, licenses, generateLicense, deleteLicense } = useAdmin();
  const [eaId, setEaId] = useState(eas[0]?.id ?? '');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [duration, setDuration] = useState('1 Year');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return licenses.filter((l) =>
      !q || l.key.toLowerCase().includes(q) || l.clientName.toLowerCase().includes(q) || l.clientEmail.toLowerCase().includes(q),
    );
  }, [licenses, search]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>License Details</h3>
        <div className="field">
          <label>Select EA *</label>
          <select value={eaId} onChange={(e) => setEaId(e.target.value)}>
            {eas.map((ea) => <option key={ea.id} value={ea.id}>{ea.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Client Name</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Enter client's full name" /></div>
        <div className="field"><label>Client Email</label><input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Enter client's email" /></div>
        <div className="field">
          <label>License Duration</label>
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {['1 Month', '3 Months', '6 Months', '1 Year', 'Lifetime'].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <button
          className="btn btn-blue"
          type="button"
          onClick={() => {
            const rec = generateLicense({ eaId, clientName, clientEmail, duration });
            if (!rec) return alert('Select EA and fill client details');
            alert(`License generated:\n${rec.key}`);
            setClientName('');
            setClientEmail('');
          }}
        >
          Generate License
        </button>
      </div>
      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>All Generated Licenses ({licenses.length})</h3>
        <div className="field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or key..." /></div>
        {filtered.map((lic) => (
          <div key={lic.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{lic.key}</strong>
              <button type="button" style={{ background: 'transparent', color: 'var(--electric)' }} onClick={() => navigator.clipboard.writeText(lic.key)}>
                <Copy size={14} />
              </button>
            </div>
            <div className="muted">{lic.eaName} · {lic.duration} · {lic.clientName}</div>
            <div className="muted">{lic.clientEmail}</div>
            <div
              style={{
                color:
                  lic.status === 'assigned'
                    ? 'var(--electric)'
                    : lic.status === 'active'
                      ? 'var(--green)'
                      : 'var(--red)',
                fontWeight: 700,
              }}
            >
              {lic.status.toUpperCase()}
              {lic.assignedEmail ? ` · ${lic.assignedEmail}` : ''}
            </div>
            {lic.status === 'active' ? (
              <button type="button" style={{ background: 'transparent', color: 'var(--red)', fontWeight: 700 }} onClick={() => deleteLicense(lic.id)}>
                Delete
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConnectEAPage() {
  const { mt5, profile, saveMt5 } = useAdmin();
  const [form, setForm] = useState({ ...mt5, eaName: mt5.eaName || profile.eaDisplayName });

  return (
    <div className="glow-card">
      <h3 style={{ marginTop: 0, color: 'var(--electric)' }}>MT5 Connection</h3>
      {mt5.connected ? (
        <p style={{ color: 'var(--green)', fontWeight: 700 }}>LIVE · {mt5.broker} · #{mt5.login}</p>
      ) : null}
      <div className="field"><label>Broker</label>
        <select value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })}>
          {['Razor Markets', 'IC Markets', 'Exness', 'FTMO'].map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="field"><label>Select Server</label>
        <select value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })}>
          {['RazorMarkets-Live', 'RazorMarkets-Demo', 'ICMarkets-Live'].map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="field"><label>Account Type</label>
        <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
          {['Standard Live', 'Raw Spread', 'Demo'].map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="field"><label>Login</label><input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
      <div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" /></div>
      <div className="field"><label>EA Name</label><input value={form.eaName} onChange={(e) => setForm({ ...form, eaName: e.target.value })} /></div>
      <button
        className="btn btn-blue"
        type="button"
        onClick={() => {
          if (!form.login || !form.password) return alert('Enter login and password');
          saveMt5({ ...form, connected: true });
          alert('Connected');
        }}
      >
        Connect EA
      </button>
    </div>
  );
}

export function OpenOrdersPage() {
  const { mt5, profile, licenses, executeOrder, eas, orders } = useAdmin();
  const [symbol, setSymbol] = useState('XAUUSD');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [volume, setVolume] = useState('0.01');
  const [stopLoss, setStopLoss] = useState('0.00');
  const [takeProfit, setTakeProfit] = useState('0.00');
  const [comment, setComment] = useState(profile.eaDisplayName);
  const [trades, setTrades] = useState('1');
  const active = licenses.filter((l) => l.status === 'active').length;
  const symbols = [...new Set(eas.flatMap((e) => e.symbols))];

  const run = (copy: boolean) => {
    if (!mt5.connected) return alert('Connect EA first');
    const order = executeOrder({
      symbol: symbol.toUpperCase(),
      side,
      volume: Number(volume) || 0.01,
      stopLoss: Number(stopLoss) || 0,
      takeProfit: Number(takeProfit) || 0,
      comment,
      trades: Math.min(50, Math.max(1, Number(trades) || 1)),
    });
    alert(`${copy ? 'Copied' : 'Executed'} ${order.side.toUpperCase()} ${order.symbol} → ${copy ? active : 0} clients`);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card" style={{ borderColor: mt5.connected ? 'rgba(57,255,20,0.45)' : undefined }}>
        <strong>{mt5.connected ? `${mt5.broker} · ${mt5.accountType}` : 'No broker connected'}</strong>
        <div className="muted">{mt5.connected ? `#${mt5.login} · ${mt5.server}` : 'Connect EA to send live trades'}</div>
      </div>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Order Details</h3>
        <div className="field"><label>Symbol *</label><input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></div>
        <div>{symbols.slice(0, 6).map((s) => <button key={s} type="button" className="chip" onClick={() => setSymbol(s)}>{s}</button>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '10px 0' }}>
          <button type="button" className="btn" style={{ border: `1.5px solid ${side === 'buy' ? 'var(--green)' : '#333'}`, background: side === 'buy' ? 'rgba(57,255,20,0.08)' : '#0e1220', color: side === 'buy' ? 'var(--green)' : 'var(--muted)' }} onClick={() => setSide('buy')}>BUY</button>
          <button type="button" className="btn" style={{ border: `1.5px solid ${side === 'sell' ? 'var(--red)' : '#333'}`, background: side === 'sell' ? 'rgba(225,29,46,0.1)' : '#0e1220', color: side === 'sell' ? 'var(--red)' : 'var(--muted)' }} onClick={() => setSide('sell')}>SELL</button>
        </div>
        <div className="field"><label>Volume (Lots)</label><input value={volume} onChange={(e) => setVolume(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>Stop Loss</label><input value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} /></div>
          <div className="field"><label>Take Profit</label><input value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} /></div>
        </div>
        <div className="field"><label>EA Comment</label><input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        <div className="field"><label>Number of Trades (1-50)</label><input value={trades} onChange={(e) => setTrades(e.target.value)} /></div>
        <button className="btn btn-green" type="button" onClick={() => run(false)}>EXECUTE {side.toUpperCase()}</button>
        <div style={{ textAlign: 'center', margin: '12px 0' }} className="muted">OR</div>
        <button className="btn btn-ghost" type="button" onClick={() => run(true)}>COPY TRADE TO ALL CLIENTS ({active})</button>
      </div>
      {orders[0] ? <div className="muted">Last: {orders[0].side.toUpperCase()} {orders[0].symbol} · copied {orders[0].copiedTo}</div> : null}
    </div>
  );
}

export function ProfilePage() {
  const { profile, updateProfile } = useAdmin();
  const [form, setForm] = useState(profile);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Personal Information</h3>
        <div className="field"><label>First Name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div className="field"><label>Last Name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
        <div className="field"><label>Email Address</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="field"><label>Phone Number</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="field"><label>Mentor Name</label><input value={form.mentorName} onChange={(e) => setForm({ ...form, mentorName: e.target.value })} /></div>
      </div>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Branding & Assets</h3>
        <div className="field"><label>EA Name (Displayed on App)</label><input value={form.eaDisplayName} onChange={(e) => setForm({ ...form, eaDisplayName: e.target.value })} /></div>
        <div className="field"><label>Main Text (Top of Home Page)</label><input value={form.mainText} onChange={(e) => setForm({ ...form, mainText: e.target.value })} /></div>
      </div>
      <button className="btn btn-blue" type="button" onClick={() => { updateProfile(form); alert('Profile updated — branding syncs to client licenses'); }}>
        Update Profile
      </button>
    </div>
  );
}

export function ApproveAdminsPage() {
  const { pendingAdmins, approveAdmin } = useAdmin();
  const list = pendingAdmins.filter((a) => a.role === 'pending');
  return (
    <div>
      <h2 className="title-blue" style={{ fontSize: 24 }}>Approve Admins</h2>
      {list.length === 0 ? <p className="muted">No pending admin requests.</p> : list.map((a) => (
        <div key={a.id} className="glow-card" style={{ marginBottom: 10 }}>
          <strong>{a.fullName}</strong>
          <div className="muted">{a.email}</div>
          <div className="muted">ID {a.id}</div>
          <button className="btn btn-blue" type="button" style={{ marginTop: 10 }} onClick={() => approveAdmin(a.id)}>Approve</button>
        </div>
      ))}
    </div>
  );
}

export function SubscriptionsPage() {
  const { clientRequests, approveClient, rejectClient, stats } = useAdmin();
  const pending = clientRequests.filter((c) => c.status === 'pending');
  const approved = clientRequests.filter((c) => c.status === 'approved');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="title-blue" style={{ fontSize: 24, margin: 0 }}>Subscriptions</h2>
        <p className="muted">
          New Lumo Edge registrations land here. Approve to unlock payment.
        </p>
      </div>

      <div className="stat-grid">
        <Stat value={String(stats.pendingClients)} label="Awaiting approval" color="var(--orange)" />
        <Stat value={String(approved.length)} label="Approved clients" color="var(--green)" />
      </div>

      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Pending client registrations</h3>
        {pending.length === 0 ? (
          <p className="muted">No pending registrations.</p>
        ) : (
          pending.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '12px 0',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <strong>
                {c.firstName} {c.lastName}
              </strong>
              <div className="muted">{c.email}</div>
              <div className="muted">
                Registered {new Date(c.createdAt).toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn-blue"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => approveClient(c.id)}
                >
                  Approve
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ flex: 1, borderColor: 'var(--red)', color: 'var(--red)' }}
                  onClick={() => rejectClient(c.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Approved — ready for payment / license</h3>
        {approved.length === 0 ? (
          <p className="muted">No approved clients yet.</p>
        ) : (
          approved.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <strong>
                {c.firstName} {c.lastName}
              </strong>
              <div className="muted">{c.email}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MetaTraderPage() {
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <h2 className="title-blue">MetaTrader</h2>
      <p className="muted">Pair MT4 / MT5 terminals and sync live EA status.</p>
    </div>
  );
}

export function ComingSoonPage({ title }: { title: string }) {
  return <Placeholder title={title}>Full tooling for this section comes next.</Placeholder>;
}
