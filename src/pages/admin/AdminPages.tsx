import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  ALL_MEDIA_SLOTS,
  BACKGROUND_SLOTS,
  MEDIA_ACCEPT,
  PROFILE_SLOTS,
  deleteMentorMedia,
  getMediaSlot,
  isAllowedMediaFile,
  mediaKey,
  normalizeCustomMedia,
  removeMediaSlot,
  uploadMentorMedia,
  uploadMentorMediaFile,
  upsertMediaSlot,
  type MentorMediaSlotId,
} from '../../lib/mentorMedia';
import { compressImageFile } from '../../lib/storage';
import { Placeholder } from './AdminShell';

export function DashboardPage() {
  const { profile, stats, admin, eas, licenses } = useAdmin();
  const isSuper = admin?.role === 'super';
  const isEmpty = eas.length === 0 && licenses.length === 0;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Welcome, {profile.firstName || admin?.fullName} {profile.lastName}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 11 }}>MENTOR ID</span>
              <span style={{ border: '1px solid var(--electric)', borderRadius: 999, padding: '3px 10px', color: 'var(--electric)', fontWeight: 700 }}>
                {profile.mentorId || admin?.id}
              </span>
            </div>
          </div>
          <span style={{ background: isSuper ? 'var(--gold)' : 'var(--electric)', color: isSuper ? '#1a1200' : '#061018', borderRadius: 999, padding: '4px 10px', fontWeight: 700, height: 'fit-content' }}>
            {isSuper ? 'SUPER' : 'MENTOR'}
          </span>
        </div>
      </div>
      {isEmpty ? (
        <div className="glow-card" style={{ borderColor: 'rgba(59,130,246,0.45)' }}>
          <strong>Set up your own portal</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            This space is yours alone — no shared EAs or licenses. Upload your EA image in Profile Settings, create an EA, then generate license keys.
          </p>
        </div>
      ) : null}
      <div className="stat-grid">
        <Stat value={String(stats.activeLicenses)} label="Active Licenses" color="var(--green)" />
        <Stat
          value={String(stats.pendingClients)}
          label={isSuper ? 'Pending Approvals' : 'Assigned Keys'}
          color="var(--orange)"
        />
        <Stat value={String(stats.deletedLicenses)} label="Revoked Keys" color="var(--red)" />
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
      <div style={{ color, fontFamily: 'var(--font-body)', fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

export function ManageEAsPage() {
  const { eas, createEA, deleteEA, profile } = useAdmin();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [symbols, setSymbols] = useState<string[]>([]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {eas.length === 0 ? (
        <div className="glow-card" style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
          <strong style={{ color: 'var(--orange)' }}>Your portal starts empty</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Create your own EA below. Nothing is shared from other admins.
          </p>
        </div>
      ) : null}
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
            createEA({
              name: name.trim(),
              symbols,
              lotSize: 0.01,
              direction: 'both',
              imageUrl: profile.eaImage || '',
            });
            setName('');
            setSymbols([]);
          }}
        >
          Create EA
        </button>
      </div>
      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Created EAs</h3>
        {eas.length === 0 ? <p className="muted">No EAs yet — create one to generate licenses.</p> : null}
        {eas.map((ea) => (
          <div key={ea.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {ea.imageUrl ? (
                <img src={ea.imageUrl} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: 'cover' }} />
              ) : null}
              <div>
                <strong>{ea.name}</strong>
                <div className="muted">{ea.symbols.length} symbols · lot {ea.lotSize} · {ea.direction}</div>
              </div>
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
  const { eas, licenses, generateLicense, deleteLicense, profile } = useAdmin();
  const [eaId, setEaId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [duration, setDuration] = useState('1 Year');
  const [search, setSearch] = useState('');
  const [lastKey, setLastKey] = useState('');
  const effectiveEaId = eaId || eas[0]?.id || '';
  const selected = eas.find((e) => e.id === effectiveEaId) ?? eas[0];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return licenses.filter(
      (l) =>
        l.status !== 'deleted' &&
        (!q ||
          l.key.toLowerCase().includes(q) ||
          l.clientName.toLowerCase().includes(q) ||
          l.clientEmail.toLowerCase().includes(q)),
    );
  }, [licenses, search]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {eas.length === 0 ? (
        <div className="glow-card" style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
          <strong style={{ color: 'var(--orange)' }}>Create an EA first</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Your license list is empty until you create an EA under Manage EAs and upload your EA image in Profile Settings.
          </p>
        </div>
      ) : null}
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>License Details</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Short keys like <strong style={{ color: 'var(--electric)' }}>LUMO-XXXX-XXXX-XXXX</strong>.
          One live key per client email. If that email already has a key, delete it first — then generate a new one (client pays subscription and logs in with the new key).
        </p>
        <div className="field">
          <label>Select EA *</label>
          <select value={effectiveEaId} onChange={(e) => setEaId(e.target.value)} disabled={!eas.length}>
            {eas.length === 0 ? <option value="">No EAs yet</option> : null}
            {eas.map((ea) => <option key={ea.id} value={ea.id}>{ea.name}</option>)}
          </select>
        </div>
        {selected ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <img
              src={selected.imageUrl || profile.eaImage || '/lumo-logo.png'}
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: 12, objectFit: 'cover' }}
            />
            <div>
              <strong>{selected.name}</strong>
              <div className="muted">
                {(selected.imageUrl || profile.eaImage)
                  ? 'EA image will sync to the client app'
                  : 'No EA image — upload one in Profile Settings first'}
              </div>
            </div>
          </div>
        ) : null}
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
            if (!(selected?.imageUrl || profile.eaImage)) {
              const ok = confirm(
                'No EA image on your profile yet. Upload one in Profile Settings for best sync.\n\nGenerate key anyway?',
              );
              if (!ok) return;
            }
            const result = generateLicense({
              eaId: effectiveEaId,
              clientName,
              clientEmail,
              duration,
            });
            if (!result.ok) {
              alert(result.error);
              return;
            }
            const rec = result.license;
            setLastKey(rec.key);
            navigator.clipboard?.writeText(rec.key).catch(() => undefined);
            alert(
              `License key:\n${rec.key}\n\nFor: ${rec.clientEmail}\nEA: ${rec.eaName}\nImage: ${rec.eaImage ? 'synced' : 'missing — update Profile image & regenerate'}\n\nCopied to clipboard.`,
            );
            setClientName('');
            setClientEmail('');
          }}
        >
          Generate License
        </button>
        {lastKey ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(57,255,20,0.45)',
              background: 'rgba(57,255,20,0.08)',
              textAlign: 'center',
            }}
          >
            <div className="muted">Latest key</div>
            <strong style={{ color: 'var(--green)', fontSize: 15, letterSpacing: 0.5 }}>
              {lastKey}
            </strong>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => {
                navigator.clipboard?.writeText(lastKey);
                alert('Copied');
              }}
            >
              Copy key
            </button>
          </div>
        ) : null}
      </div>
      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>All Generated Licenses ({licenses.length})</h3>
        <div className="field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or key..." /></div>
        {filtered.map((lic) => (
          <div key={lic.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ letterSpacing: 0.5 }}>{lic.key}</strong>
              <button type="button" style={{ background: 'transparent', color: 'var(--electric)' }} onClick={() => navigator.clipboard.writeText(lic.key)}>
                <Copy size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {lic.eaImage ? (
                <img src={lic.eaImage} alt="" width={28} height={28} style={{ borderRadius: 8, objectFit: 'cover' }} />
              ) : null}
              <div className="muted">{lic.eaName} · {lic.duration} · {lic.clientName}</div>
            </div>
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
            {lic.status === 'active' || lic.status === 'assigned' ? (
              <button
                type="button"
                style={{ background: 'transparent', color: 'var(--red)', fontWeight: 700 }}
                onClick={() => {
                  if (confirm(`Delete key ${lic.key}? It can never be used again.`)) {
                    deleteLicense(lic.id);
                  }
                }}
              >
                Delete permanently
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
  const { admin, profile, updateProfile } = useAdmin();
  const [form, setForm] = useState(profile);
  const [imageError, setImageError] = useState('');
  const [savingImage, setSavingImage] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [savingSlot, setSavingSlot] = useState<MentorMediaSlotId | null>(null);

  useEffect(() => {
    setForm({
      ...profile,
      customMedia: normalizeCustomMedia(profile.customMedia),
    });
  }, [profile]);

  const onPickImage = async (file: File | null) => {
    setImageError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Choose an image file (PNG, JPG, WEBP).');
      return;
    }
    try {
      setSavingImage(true);
      const dataUrl = await compressImageFile(file, 512, 0.72);
      const next = { ...form, eaImage: dataUrl };
      setForm(next);
      updateProfile(next); // auto-save so Generate License can sync it
    } catch {
      setImageError('Could not process image. Try a smaller JPG/PNG.');
    } finally {
      setSavingImage(false);
    }
  };

  const onPickMedia = async (slot: MentorMediaSlotId, file: File | null) => {
    setMediaError('');
    if (!file || !admin?.id) return;
    const check = isAllowedMediaFile(file);
    if (!check.ok) {
      setMediaError(check.error);
      return;
    }
    try {
      setSavingSlot(slot);
      const key = mediaKey(admin.id, slot);
      let url = '';
      if (check.kind === 'video') {
        // Binary upload — keeps quality and enables Range streaming playback
        ({ url } = await uploadMentorMediaFile(key, file));
      } else {
        const isBg = slot.startsWith('bg-');
        // High-res for backgrounds; still light compress so sync stays fast
        const dataUrl = await compressImageFile(
          file,
          isBg ? 1920 : 1400,
          isBg ? 0.92 : 0.88,
        );
        ({ url } = await uploadMentorMedia(key, dataUrl));
      }
      const customMedia = upsertMediaSlot(form.customMedia, {
        slot,
        kind: check.kind,
        url,
      });
      const next = {
        ...form,
        customMedia,
        // Keep classic EA image in sync with first profile still image
        eaImage:
          slot === 'profile-1' && check.kind === 'image' ? url : form.eaImage,
      };
      setForm(next);
      updateProfile(next);
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : 'Could not upload media.');
    } finally {
      setSavingSlot(null);
    }
  };

  const onClearMedia = async (slot: MentorMediaSlotId) => {
    if (!admin?.id) return;
    await deleteMentorMedia(mediaKey(admin.id, slot));
    const customMedia = removeMediaSlot(form.customMedia, slot);
    const next = { ...form, customMedia };
    setForm(next);
    updateProfile(next);
  };

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
        <p className="muted" style={{ marginTop: 0 }}>
          Upload your EA image — it auto-saves and syncs to clients when you generate a license key.
        </p>
        <div className="field"><label>EA Name (Displayed on App)</label><input value={form.eaDisplayName} onChange={(e) => setForm({ ...form, eaDisplayName: e.target.value })} /></div>
        <div className="field"><label>Main Text (Top of Home Page)</label><input value={form.mainText} onChange={(e) => setForm({ ...form, mainText: e.target.value })} /></div>
        <div className="field">
          <label>EA Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
          />
        </div>
        {savingImage ? <p className="muted">Saving image…</p> : null}
        {form.eaImage ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <img
              src={form.eaImage}
              alt="EA"
              width={72}
              height={72}
              style={{ borderRadius: 16, objectFit: 'cover', border: '1px solid rgba(59,130,246,0.5)' }}
            />
            <div>
              <div style={{ color: 'var(--green)', fontWeight: 700 }}>Saved — ready to sync</div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '8px 14px', marginTop: 6 }}
                onClick={() => {
                  const next = { ...form, eaImage: '' };
                  setForm(next);
                  updateProfile(next);
                }}
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">No EA image uploaded yet.</p>
        )}
        {imageError ? <p className="error">{imageError}</p> : null}
      </div>

      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Custom Media (5 spots)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload <strong style={{ color: 'var(--text)' }}>2 profile</strong> and{' '}
          <strong style={{ color: 'var(--text)' }}>3 background</strong> pictures or
          videos. Clients see them under Interface Style → Custom — tap one to set it
          as the app background. Prefer <strong style={{ color: 'var(--text)' }}>MP4</strong>{' '}
          videos (H.264) up to 28 MB for best playback on iPhone.
        </p>

        <h4 style={{ margin: '10px 0 8px', fontSize: 14 }}>Profile picture / video</h4>
        <div className="media-slot-grid">
          {PROFILE_SLOTS.map((slot) => {
            const item = getMediaSlot(form.customMedia, slot.id);
            return (
              <MediaSlotCard
                key={slot.id}
                label={slot.label}
                item={item}
                busy={savingSlot === slot.id}
                onPick={(file) => void onPickMedia(slot.id, file)}
                onClear={() => void onClearMedia(slot.id)}
              />
            );
          })}
        </div>

        <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>Background features</h4>
        <div className="media-slot-grid">
          {BACKGROUND_SLOTS.map((slot) => {
            const item = getMediaSlot(form.customMedia, slot.id);
            return (
              <MediaSlotCard
                key={slot.id}
                label={slot.label}
                item={item}
                busy={savingSlot === slot.id}
                onPick={(file) => void onPickMedia(slot.id, file)}
                onClear={() => void onClearMedia(slot.id)}
              />
            );
          })}
        </div>
        {savingSlot ? (
          <p className="muted">Uploading {ALL_MEDIA_SLOTS.find((s) => s.id === savingSlot)?.label}…</p>
        ) : null}
        {mediaError ? <p className="error">{mediaError}</p> : null}
      </div>

      <button
        className="btn btn-blue"
        type="button"
        onClick={() => {
          updateProfile(form);
          alert('Profile updated — branding & custom media sync to licensed clients');
        }}
      >
        Update Profile
      </button>
    </div>
  );
}

function MediaSlotCard({
  label,
  item,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  item?: { url: string; kind: 'image' | 'video' };
  busy: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="media-slot-card">
      <div className="media-slot-preview">
        {item?.kind === 'video' ? (
          <video src={item.url} muted playsInline />
        ) : item?.url ? (
          <img src={item.url} alt="" />
        ) : (
          <span>Empty</span>
        )}
      </div>
      <div className="media-slot-meta">
        <strong>{label}</strong>
        <span className="muted">{item ? item.kind : 'image / video'}</span>
        <label className="btn btn-ghost media-slot-upload">
          {busy ? 'Saving…' : item ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept={MEDIA_ACCEPT}
            disabled={busy}
            hidden
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </label>
        {item ? (
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ApproveAdminsPage() {
  const { admins, approveAdmin, deleteAdmin } = useAdmin();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (a: { fullName: string; email: string; id: string; eaName?: string }) => {
    if (!query) return true;
    return [a.fullName, a.email, a.id, a.eaName || '']
      .join(' ')
      .toLowerCase()
      .includes(query);
  };
  const pending = admins.filter((a) => a.role === 'pending').filter(match);
  const approved = admins.filter((a) => a.role === 'admin').filter(match);

  const onDelete = (id: string, label: string) => {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteAdmin(id);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="title-blue" style={{ fontSize: 17, margin: 0 }}>Approve Admins</h2>
        <p className="muted">Pending requests and admins already approved. Each admin gets their own empty portal.</p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, ID…"
        />
      </div>

      <div className="stat-grid">
        <Stat value={String(pending.length)} label="Pending" color="var(--orange)" />
        <Stat value={String(approved.length)} label="Approved" color="var(--green)" />
      </div>

      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Pending</h3>
        {pending.length === 0 ? (
          <p className="muted">No pending admin requests.</p>
        ) : (
          pending.map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <strong>{a.fullName}</strong>
              <div className="muted">{a.email}</div>
              <div className="muted">ID {a.id}{a.eaName ? ` · EA ${a.eaName}` : ''}</div>
              <div style={{ color: 'var(--orange)', fontWeight: 700, marginTop: 4 }}>PENDING</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-blue" type="button" style={{ flex: 1 }} onClick={() => approveAdmin(a.id)}>
                  Approve
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ flex: 1, borderColor: 'var(--red)', color: 'var(--red)' }}
                  onClick={() => onDelete(a.id, a.email)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Approved</h3>
        {approved.length === 0 ? (
          <p className="muted">No approved admins yet.</p>
        ) : (
          approved.map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <strong>{a.fullName}</strong>
              <div className="muted">{a.email}</div>
              <div className="muted">ID {a.id}{a.eaName ? ` · EA ${a.eaName}` : ''}</div>
              <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 4 }}>APPROVED</div>
              <button
                className="btn btn-ghost"
                type="button"
                style={{ marginTop: 10, borderColor: 'var(--red)', color: 'var(--red)' }}
                onClick={() => onDelete(a.id, a.email)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SubscriptionsPage() {
  const { clientRequests, approveClient, deleteClient, stats } = useAdmin();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (c: { firstName: string; lastName: string; email: string }) => {
    if (!query) return true;
    return `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(query);
  };
  const pending = clientRequests
    .filter((c) => c.status === 'pending')
    .filter(match)
    .sort((a, b) => Number(Boolean(b.paymentClaimed)) - Number(Boolean(a.paymentClaimed)));
  const approved = clientRequests.filter((c) => c.status === 'approved').filter(match);
  const paidPending = pending.filter((c) => c.paymentClaimed).length;

  const onDelete = (id: string, email: string) => {
    if (!confirm(`Delete ${email}? This removes them from the queue.`)) return;
    deleteClient(id);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="title-blue" style={{ fontSize: 17, margin: 0 }}>Subscriptions</h2>
        <p className="muted">
          New Lumo Edge registrations land here (saved on server). Approve after you
          confirm payment proof at lumoedge08@gmail.com.
        </p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
        />
      </div>

      <div className="stat-grid">
        <Stat value={String(stats.pendingClients)} label="Awaiting approval" color="var(--orange)" />
        <Stat value={String(paidPending)} label="Marked I've Paid" color="var(--electric)" />
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
              {c.paymentClaimed ? (
                <div
                  style={{
                    marginTop: 8,
                    color: 'var(--orange)',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  PAYMENT SENT — pending your approval
                  {c.paymentClaimedAt
                    ? ` · ${new Date(c.paymentClaimedAt).toLocaleString()}`
                    : ''}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Waiting for client to pay / tap I&apos;ve Paid
                </div>
              )}
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
                  onClick={() => onDelete(c.id, c.email)}
                >
                  Delete
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
              <button
                className="btn btn-ghost"
                type="button"
                style={{ marginTop: 8, borderColor: 'var(--red)', color: 'var(--red)' }}
                onClick={() => onDelete(c.id, c.email)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ComingSoonPage({ title }: { title: string }) {
  return <Placeholder title={title}>Full tooling for this section comes next.</Placeholder>;
}
