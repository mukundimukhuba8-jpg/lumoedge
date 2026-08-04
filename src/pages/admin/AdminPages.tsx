import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Loader2, MoreVertical, Plus, Trash2, Ban, Clock, CreditCard, KeyRound, ShieldCheck, Users, UserCheck, Cpu } from 'lucide-react';
import { BackgroundManager } from '../../components/BackgroundManager';
import { normalizeAdminRole } from '../../lib/adminQueue';
import { normalizeClientStatus } from '../../lib/clientQueue';
import { MENTOR_AUTH_MSG } from '../../lib/mentorAuthUi';
import { isRegistrationEmail } from '../../lib/registrationEmail';
import { useAdmin, type ClientRequest } from '../../context/AdminContext';
import { loadDashStats } from '../../lib/adminDashCache';
import { resolveProfileImage, isPlaceholderMentorImage, normalizeCustomMedia } from '../../lib/mentorMedia';
import { compressImageFile, blobUrlToDataUrl, resolveStoredMediaUrl } from '../../lib/storage';
import { pushScanAdminReset } from '../../lib/chartScan';
import { Placeholder } from './AdminShell';

function isRealImage(url?: string): boolean {
  const u = String(url || '').trim();
  if (!u || isPlaceholderMentorImage(u)) return false;
  if (u.startsWith('blob:')) return false;
  if (u.startsWith('img:')) return true;
  return u.startsWith('data:') || u.startsWith('http') || u.startsWith('/');
}

function displayImageSrc(url?: string): string {
  const u = String(url || '').trim();
  if (!u || isPlaceholderMentorImage(u) || u.startsWith('blob:')) return '';
  return resolveStoredMediaUrl(u) || u;
}

function ClientEmailMenu({
  client,
  onMarkPaid,
  onDelete,
}: {
  client: ClientRequest;
  onMarkPaid: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label={`Options for ${client.email}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          background: 'transparent',
          color: 'var(--muted)',
          padding: 6,
          borderRadius: 8,
        }}
      >
        <MoreVertical size={18} />
      </button>
      {open ? (
        <div
          className="mt5-dropdown"
          style={{ left: 'auto', right: 0, minWidth: 168, top: 'calc(100% + 2px)' }}
        >
          {!client.paymentClaimed ? (
            <button
              type="button"
              onClick={() => {
                onMarkPaid();
                setOpen(false);
              }}
            >
              Mark as paid
            </button>
          ) : (
            <button type="button" disabled style={{ opacity: 0.55, cursor: 'default' }}>
              Already marked paid
            </button>
          )}
          <button
            type="button"
            style={{ color: 'var(--red)' }}
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ScanAdminTools({ approvedEmails }: { approvedEmails: string[] }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const run = async (
    label: string,
    action: () => Promise<void>,
  ) => {
    setBusy(label);
    try {
      await action();
      alert(`${label} — synced to all devices.`);
    } catch {
      alert(`Could not complete: ${label}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="glow-card admin-tools-card">
      <div className="admin-tools-head">
        <strong className="muted admin-tools-label">CHART SCANNER</strong>
        <span className="admin-tools-badge">ADMIN TOOLS</span>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Client email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@email.com"
          list="scan-client-emails"
        />
        <datalist id="scan-client-emails">
          {approvedEmails.map((addr) => (
            <option key={addr} value={addr} />
          ))}
        </datalist>
      </div>
      <div className="admin-scan-btn-grid">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!email.trim() || Boolean(busy)}
          onClick={() =>
            void run('User scan count reset', () =>
              pushScanAdminReset({ email: email.trim() }),
            )
          }
        >
          Reset user scans
        </button>
        <button
          type="button"
          className="btn btn-blue"
          disabled={Boolean(busy)}
          onClick={() =>
            void run('All scan counts reset', () => pushScanAdminReset({ allUsers: true }))
          }
        >
          Reset all scans
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!email.trim() || Boolean(busy)}
          onClick={() =>
            void run('User history cleared', () =>
              pushScanAdminReset({ email: email.trim(), clearHistory: true }),
            )
          }
        >
          Clear user history
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
          disabled={Boolean(busy)}
          onClick={() =>
            void run('All history cleared', () =>
              pushScanAdminReset({ clearHistoryAll: true }),
            )
          }
        >
          Clear all history
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 0, marginTop: 10, fontSize: 12 }}>
        Resets apply immediately on every device — no logout required. Daily auto-reset runs at
        00:00 South African time.
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { profile, stats, admin, eas, licenses, clientRequests, clientsLoading } = useAdmin();
  const isSuper = admin?.role === 'super';
  const cached = admin?.id ? loadDashStats(admin.id) : null;
  const isEmpty = eas.length === 0 && licenses.length === 0;
  // Offline-first: cached stats paint immediately; live values take over after hydrate
  const useLive =
    !clientsLoading ||
    licenses.length > 0 ||
    eas.length > 0 ||
    stats.totalClients > 0 ||
    stats.activeLicenses > 0;
  const activeLicenses = useLive
    ? stats.activeLicenses
    : (cached?.activeLicenses ?? stats.activeLicenses);
  const totalClients = useLive
    ? stats.totalClients
    : (cached?.totalClients ?? stats.totalClients);
  const pendingClients = useLive
    ? stats.pendingClients
    : (cached?.pendingClients ?? stats.pendingClients);
  const deletedLicenses = useLive
    ? stats.deletedLicenses
    : (cached?.deletedLicenses ?? stats.deletedLicenses);
  const firstName =
    profile.firstName ||
    cached?.firstName ||
    admin?.fullName?.split(' ')[0] ||
    'Admin';
  const mentorId = profile.mentorId || cached?.mentorId || admin?.id;
  const showSkeleton =
    clientsLoading && !cached && totalClients === 0 && activeLicenses === 0;

  return (
    <div className="admin-dashboard">
      <div className="glow-card admin-welcome-card">
        <div className="admin-welcome-row">
          <div>
            <h2 className="admin-welcome-title">Welcome, {firstName}</h2>
            <div className="admin-welcome-meta">
              <span className="muted admin-welcome-label">MENTOR ID</span>
              <span className="admin-id-pill">{mentorId}</span>
            </div>
          </div>
          <span className={`admin-role-chip${isSuper ? ' admin-role-chip-super' : ''}`}>
            {isSuper ? 'SUPER ADMIN' : 'MENTOR'}
          </span>
        </div>
      </div>
      {isEmpty ? (
        <div className="glow-card admin-empty-card">
          <strong>Set up your own portal</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            This space is yours alone — no shared EAs or licenses. Upload your EA image in Profile Settings, create an EA, then generate license keys.
          </p>
        </div>
      ) : null}
      <div className="stat-grid admin-stat-grid">
        {showSkeleton ? (
          <>
            <div className="stat-card admin-stat-card admin-stat-skeleton" aria-hidden />
            <div className="stat-card admin-stat-card admin-stat-skeleton" aria-hidden />
            {isSuper ? (
              <div className="stat-card admin-stat-card admin-stat-skeleton" aria-hidden />
            ) : null}
            <div className="stat-card admin-stat-card admin-stat-skeleton" aria-hidden />
          </>
        ) : (
          <>
            <Stat value={String(activeLicenses)} label="Active Licenses" tone="cyan" />
            <Stat value={String(totalClients)} label="Total Clients" tone="blue" />
            {isSuper ? (
              <Stat value={String(pendingClients)} label="Pending Approvals" tone="purple" />
            ) : null}
            <Stat value={String(deletedLicenses)} label="Revoked Keys" tone="pink" />
          </>
        )}
      </div>
      {isSuper ? (
        <ScanAdminTools
          approvedEmails={clientRequests
            .filter((c) => c.status === 'approved')
            .map((c) => c.email)}
        />
      ) : null}
    </div>
  );
}

function Stat({
  value,
  label,
  tone = 'cyan',
}: {
  value: string;
  label: string;
  tone?: 'cyan' | 'blue' | 'purple' | 'pink' | 'green' | 'orange';
}) {
  const Icon =
    label.toLowerCase().includes('revoked') || label.toLowerCase().includes('deleted')
      ? Ban
      : label.toLowerCase().includes('pending') || label.toLowerCase().includes('awaiting')
        ? Clock
        : label.toLowerCase().includes('paid')
          ? CreditCard
          : label.toLowerCase().includes('approved')
            ? UserCheck
            : label.toLowerCase().includes('client')
              ? Users
              : label.toLowerCase().includes('license')
                ? KeyRound
                : ShieldCheck;

  return (
    <div className={`stat-card admin-stat-card admin-stat-${tone}`}>
      <div className="admin-stat-icon-wrap">
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

export function ManageEAsPage() {
  const { eas, createEA, updateEA, deleteEA, profile } = useAdmin();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [symbols, setSymbols] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSymbols, setEditSymbols] = useState<string[]>([]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        className="glow-card"
        style={{
          borderColor: 'rgba(59,130,246,0.45)',
          background: 'rgba(59,130,246,0.08)',
          padding: '14px 16px',
        }}
      >
        <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
          MENTOR ID
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <code style={{ color: 'var(--electric)', fontWeight: 800, fontSize: 15 }}>
            {profile.mentorId || '—'}
          </code>
          {profile.mentorId ? (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}
              onClick={() => void navigator.clipboard.writeText(profile.mentorId)}
            >
              Copy
            </button>
          ) : null}
        </div>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5 }}>
          All students under your EAs use this Mentor ID in LumoEdgeCopy.mq5 — no license key in MT5.
        </p>
      </div>
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
              imageUrl: '',
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
        <p className="muted" style={{ marginTop: 0 }}>
          Edit symbols here — they sync to every license key and licensed client for that EA.
        </p>
        {eas.length === 0 ? (
          <p className="muted">No EAs yet — create one to generate licenses.</p>
        ) : null}
        {eas.map((ea) => {
          const src = displayImageSrc(ea.imageUrl);
          const isEditing = editingId === ea.id;
          return (
            <div key={ea.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
                  {src ? (
                    <img src={src} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: 'cover' }} />
                  ) : null}
                  <div style={{ flex: 1 }}>
                    <strong>{ea.name}</strong>
                    <div className="muted">{ea.symbols.length} symbols · lot {ea.lotSize} · {ea.direction}</div>
                    <div
                      className="muted"
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <span>
                        EA ID: <code style={{ color: 'var(--electric)', fontWeight: 700 }}>{ea.id}</code>
                        <button
                          type="button"
                          aria-label="Copy EA ID"
                          onClick={() => void navigator.clipboard.writeText(ea.id)}
                          style={{
                            marginLeft: 8,
                            background: 'rgba(59,130,246,0.12)',
                            border: '1px solid rgba(59,130,246,0.35)',
                            borderRadius: 6,
                            padding: '2px 6px',
                            color: 'var(--electric)',
                            fontSize: 10,
                          }}
                        >
                          Copy
                        </button>
                      </span>
                      <span>
                        Mentor ID:{' '}
                        <code style={{ color: 'var(--electric)', fontWeight: 700 }}>
                          {profile.mentorId || '—'}
                        </code>
                      </span>
                      <span>Licenses under this EA receive copy trades automatically.</span>
                    </div>
                    {!isEditing ? (
                      <div style={{ marginTop: 6 }}>
                        {ea.symbols.map((s) => (
                          <span key={s} className="chip" style={{ cursor: 'default' }}>{s}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '8px 10px' }}
                    onClick={() => {
                      if (isEditing) {
                        setEditingId(null);
                        return;
                      }
                      setEditingId(ea.id);
                      setEditSymbols([...ea.symbols]);
                      setEditDraft('');
                    }}
                  >
                    {isEditing ? 'Close' : 'Symbols'}
                  </button>
                  <button type="button" onClick={() => deleteEA(ea.id)} style={{ background: 'var(--red)', borderRadius: 17, width: 34, height: 34, color: '#fff' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {isEditing ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      placeholder="Add symbol (e.g. EURUSD)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const s = editDraft.trim().toUpperCase();
                          if (s && !editSymbols.includes(s)) setEditSymbols((p) => [...p, s]);
                          setEditDraft('');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-blue"
                      style={{ width: 48 }}
                      onClick={() => {
                        const s = editDraft.trim().toUpperCase();
                        if (s && !editSymbols.includes(s)) setEditSymbols((p) => [...p, s]);
                        setEditDraft('');
                      }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {editSymbols.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip"
                        onClick={() => setEditSymbols((p) => p.filter((x) => x !== s))}
                      >
                        {s} ×
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-blue"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      if (!editSymbols.length) return alert('Add at least one symbol');
                      updateEA(ea.id, { symbols: editSymbols });
                      setEditingId(null);
                      alert('Symbols saved — syncing to license keys and clients');
                    }}
                  >
                    Save & sync to licenses
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GenerateLicensePage() {
  const {
    eas,
    licenses,
    generateLicense,
    deleteLicense,
    profile,
    refreshClientQueue,
  } = useAdmin();
  const [eaId, setEaId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [duration, setDuration] = useState('1 Year');
  const [search, setSearch] = useState('');
  const [lastKey, setLastKey] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<{
    type: 'error' | 'success';
    title: string;
    detail?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const effectiveEaId = eaId || eas[0]?.id || '';
  const selected = eas.find((e) => e.id === effectiveEaId) ?? eas[0];

  // Light refresh only — full restore runs in background on admin boot
  useEffect(() => {
    void refreshClientQueue();
  }, [refreshClientQueue]);

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
      <div className="glow-card" style={{ position: 'relative', overflow: 'hidden' }}>
        {generating ? (
          <div className="license-generating-overlay" aria-live="polite">
            <Loader2 size={34} className="spin" style={{ color: 'var(--electric)' }} />
            <strong style={{ color: 'var(--electric)', marginTop: 12 }}>Generating license key…</strong>
            <span className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Saving key to cloud so clients can activate…
            </span>
          </div>
        ) : null}
        <h3 style={{ marginTop: 0 }}>License Details</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Short keys like <strong style={{ color: 'var(--electric)' }}>LUMO-XXXX-XXXX-XXXX</strong>.
          Keys save to the cloud — you copy and send them to the client yourself. The client enters the key manually; it is never auto-applied to their device.
          One live key per client email.
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
            {isRealImage(selected.imageUrl) || isRealImage(profile.eaImage) ? (
              <img
                src={
                  displayImageSrc(selected.imageUrl) ||
                  displayImageSrc(profile.eaImage) ||
                  ''
                }
                alt=""
                width={48}
                height={48}
                style={{ borderRadius: 12, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              />
            )}
            <div>
              <strong>{selected.name}</strong>
              <div className="muted">
                {isRealImage(selected.imageUrl) || isRealImage(profile.eaImage)
                  ? 'EA image will sync to the client app'
                  : 'No picture uploaded — clients will not show a profile photo'}
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
          disabled={generating}
          onClick={async () => {
            if (generating) return;
            setStatus(null);
            const trimmedName = clientName.trim();
            const trimmedEmail = clientEmail.trim().toLowerCase();
            if (!trimmedName || !trimmedEmail) {
              setStatus({
                type: 'error',
                title: 'Missing details',
                detail: 'Enter the client name and email before generating.',
              });
              return;
            }
            if (!isRegistrationEmail(trimmedEmail)) {
              setStatus({
                type: 'error',
                title: 'Invalid email',
                detail: 'Enter a valid client email address.',
              });
              return;
            }
            if (trimmedName.toLowerCase() === trimmedEmail) {
              setStatus({
                type: 'error',
                title: 'Use a real name',
                detail: 'Client Name should be the person\'s name — not their email address.',
              });
              return;
            }
            setGenerating(true);
            try {
              const result = await generateLicense({
                eaId: effectiveEaId,
                clientName: trimmedName,
                clientEmail: trimmedEmail,
                duration,
              });
              if (!result.ok) {
                setStatus({
                  type: 'error',
                  title: 'Could not generate license',
                  detail: result.error,
                });
                return;
              }
              const rec = result.license;
              setLastKey(rec.key);
              setCopied(false);
              navigator.clipboard?.writeText(rec.key).catch(() => undefined);
              setStatus({
                type: 'success',
                title: 'License key ready',
                detail:
                  `Key: ${rec.key}\n\n` +
                  `⚠️ Client must log in as: ${rec.clientEmail}\n` +
                  `(The key only works for that exact email.)\n\n` +
                  `Copied to clipboard — send the key to your client.`,
              });
              setClientName('');
              setClientEmail('');
            } finally {
              setGenerating(false);
            }
          }}
        >
          {generating ? (
            <>
              <Loader2 size={16} className="spin" style={{ marginRight: 8, verticalAlign: -3 }} />
              Generating…
            </>
          ) : (
            'Generate License'
          )}
        </button>
        {status ? (
          <div className={`license-status-banner license-status-${status.type}`} role="alert">
            <strong>{status.title}</strong>
            {status.detail ? <p>{status.detail}</p> : null}
          </div>
        ) : null}
        {lastKey ? (
          <div className="license-key-success">
            <div className="muted">Latest key</div>
            <strong>{lastKey}</strong>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => {
                navigator.clipboard?.writeText(lastKey);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied!' : 'Copy key'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="glow-card" style={{ boxShadow: 'none', borderColor: 'rgba(255,255,255,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>All Generated Licenses ({filtered.length})</h3>
        <div className="field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or key..." /></div>
        {filtered.length === 0 ? (
          <p className="muted">No license keys yet — generate one above.</p>
        ) : null}
        {filtered.map((lic) => (
          <div key={lic.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong style={{ letterSpacing: 0.5 }}>{lic.key}</strong>
              <button type="button" style={{ background: 'transparent', color: 'var(--electric)' }} onClick={() => navigator.clipboard.writeText(lic.key)}>
                <Copy size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {displayImageSrc(lic.eaImage) ? (
                <img src={displayImageSrc(lic.eaImage)} alt="" width={28} height={28} style={{ borderRadius: 8, objectFit: 'cover' }} />
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
          {['100% Bonus Standard', '200%'].map((b) => <option key={b}>{b}</option>)}
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
  const [selectedEaId, setSelectedEaId] = useState(() => eas[0]?.id || '');
  const activeForEa = licenses.filter(
    (l) =>
      (l.status === 'active' || l.status === 'assigned') &&
      String(l.eaId || '') === selectedEaId,
  ).length;
  const symbols = [...new Set(eas.flatMap((e) => e.symbols))];
  const connected = mt5.connected;
  const selectedEa = eas.find((ea) => ea.id === selectedEaId);

  useEffect(() => {
    if (!selectedEaId && eas[0]?.id) setSelectedEaId(eas[0].id);
  }, [eas, selectedEaId]);

  const run = (copy: boolean) => {
    if (!copy && !connected) return;
    if (copy && !selectedEaId) return alert('Select an EA first on Manage EAs.');
    const order = executeOrder({
      eaId: selectedEaId,
      symbol: symbol.toUpperCase(),
      side,
      volume: Number(volume) || 0.01,
      stopLoss: Number(stopLoss) || 0,
      takeProfit: Number(takeProfit) || 0,
      comment,
      trades: Math.min(50, Math.max(1, Number(trades) || 1)),
    });
    alert(
      copy
        ? `Copy trade queued for ${order.copiedTo} client${order.copiedTo === 1 ? '' : 's'} under ${selectedEa?.name || 'this EA'}. Works from phone or laptop — students need LumoEdgeCopy.mq5 with your EA ID + Mentor ID.`
        : `Order saved: ${order.side.toUpperCase()} ${order.symbol}`,
    );
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className={`glow-card cyber-card orders-conn${connected ? ' live' : ''}`}>
        <div className="orders-conn-head">
          <strong>{connected ? 'Broker Connected' : 'Broker Not Connected'}</strong>
          <span className={`orders-health${connected ? ' ok' : ' off'}`}>
            {connected ? '● Healthy' : '● Offline'}
          </span>
        </div>
        {connected ? (
          <div className="orders-conn-grid">
            <div><span>Broker</span><strong>{mt5.broker}</strong></div>
            <div><span>Account</span><strong>#{mt5.login}</strong></div>
            <div><span>Server</span><strong>{mt5.server}</strong></div>
            <div><span>Status</span><strong>Connected</strong></div>
            <div><span>Last Sync</span><strong>Just now</strong></div>
            <div><span>Health</span><strong>Good</strong></div>
          </div>
        ) : (
          <p className="orders-conn-warn">
            Connect your broker through Connect EA before sending trades.
          </p>
        )}
      </div>
      <div className="glow-card cyber-card">
        <h3 style={{ marginTop: 0 }}>Order Details</h3>
        <div className="field">
          <label>Copy to EA *</label>
          <select value={selectedEaId} onChange={(e) => setSelectedEaId(e.target.value)}>
            {eas.length === 0 ? <option value="">Create an EA first</option> : null}
            {eas.map((ea) => (
              <option key={ea.id} value={ea.id}>
                {ea.name} ({ea.id})
              </option>
            ))}
          </select>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          Mentor ID: <strong style={{ color: 'var(--electric)' }}>{profile.mentorId || '—'}</strong>
          {' · '}
          {activeForEa} licensed client{activeForEa === 1 ? '' : 's'} on this EA
        </p>
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
        <button className="btn btn-green" type="button" disabled={!connected} onClick={() => run(false)}>
          EXECUTE {side.toUpperCase()}
        </button>
        {!connected ? (
          <p className="orders-conn-warn" style={{ marginTop: 10 }}>
            Connect your broker through Connect EA before sending trades.
          </p>
        ) : null}
        <div style={{ textAlign: 'center', margin: '12px 0' }} className="muted">OR</div>
        <button className="btn btn-ghost" type="button" disabled={!selectedEaId} onClick={() => run(true)}>
          COPY TRADE TO EA CLIENTS ({activeForEa})
        </button>
        {!selectedEaId ? (
          <p className="orders-conn-warn" style={{ marginTop: 10 }}>
            Create an EA on Manage EAs, generate licenses for it, then copy trade here from phone or laptop.
          </p>
        ) : null}
      </div>
      {orders[0] ? <div className="muted">Last: {orders[0].side.toUpperCase()} {orders[0].symbol} · copied {orders[0].copiedTo}</div> : null}
    </div>
  );
}

export function ProfilePage() {
  const { admin, profile, updateProfile } = useAdmin();
  const [form, setForm] = useState(profile);
  const [customMedia, setCustomMedia] = useState(() => profile.customMedia);
  const [imageError, setImageError] = useState('');
  const [savingImage, setSavingImage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [imageSavedMsg, setImageSavedMsg] = useState('');
  const [appLogoMsg, setAppLogoMsg] = useState('');
  const isSuper = admin?.role === 'super';

  const onPickAppLogo = async (file: File | null) => {
    setAppLogoMsg('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAppLogoMsg('Choose an image file (PNG, JPG, WEBP).');
      return;
    }
    try {
      const { fileToRawDataUrl, saveAppLogo } = await import('../../lib/appLogo');
      // Byte-exact: no resizing, no compression — used exactly as uploaded
      const raw = await fileToRawDataUrl(file);
      await saveAppLogo(raw);
      setAppLogoMsg('App logo saved — shown exactly as uploaded.');
    } catch {
      setAppLogoMsg('Could not save the logo. Try a smaller file.');
    }
  };

  // Only reset the form when the SAVED profile content actually changes.
  // The context rebuilds `profile` every few seconds (background refresh),
  // and resetting on identity erased whatever the user was typing.
  const lastProfileJson = useRef('');
  useEffect(() => {
    const snapshot = JSON.stringify(profile);
    if (snapshot === lastProfileJson.current) return;
    lastProfileJson.current = snapshot;

    const raw = resolveProfileImage(profile.eaImage) || profile.eaImage;
    const resolved =
      displayImageSrc(raw) ||
      (isRealImage(raw) && !String(raw).startsWith('img:') ? String(raw) : '');
    setForm((prev) => {
      // Keep local preview while remote store only has img: / empty ref
      const keepPreview =
        prev.eaImage &&
        (prev.eaImage.startsWith('data:') || prev.eaImage.startsWith('blob:')) &&
        (!resolved || resolved.startsWith('img:'));
      return {
        ...profile,
        eaImage: keepPreview ? prev.eaImage : resolved || prev.eaImage || '',
      };
    });
    setCustomMedia((prev) => {
      const incoming = normalizeCustomMedia(profile.customMedia);
      const prevFilled = prev.filter((m) => m.url).length;
      const incomingFilled = incoming.filter((m) => m.url).length;
      if (prevFilled > incomingFilled) return prev;
      return incoming;
    });
  }, [profile]);

  const onPickImage = async (file: File | null) => {
    setImageError('');
    setImageSavedMsg('');
    if (!file || !admin?.id) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Choose an image file (PNG, JPG, WEBP).');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setForm((prev) => ({ ...prev, eaImage: previewUrl }));
    try {
      setSavingImage(true);
      // Animated GIFs keep their animation — canvas compression would
      // flatten them to a single frame (looked like "nothing changed")
      const isGif = file.type === 'image/gif';
      if (isGif && file.size > 6 * 1024 * 1024) {
        throw new Error('GIF too large — keep it under 6 MB.');
      }
      const dataUrl = isGif
        ? await (await import('../../lib/appLogo')).fileToRawDataUrl(file)
        : await compressImageFile(file, 480, 0.72);
      // Show the image immediately so upload never looks like it "vanished"
      setForm((prev) => ({ ...prev, eaImage: dataUrl }));
      // Pass data URL into updateProfile so Firebase + every existing license get the bytes
      await updateProfile({
        ...form,
        eaImage: dataUrl,
      });
      setForm((prev) => ({ ...prev, eaImage: dataUrl }));
      setImageSavedMsg(
        'Saved — synced to all your license keys and licensed clients.',
      );
    } catch (err) {
      setImageError(
        err instanceof Error
          ? err.message
          : 'Could not save image. Try a smaller JPG/PNG.',
      );
      setForm((prev) => ({
        ...prev,
        eaImage: isRealImage(profile.eaImage)
          ? displayImageSrc(profile.eaImage) || profile.eaImage
          : '',
      }));
    } finally {
      URL.revokeObjectURL(previewUrl);
      setSavingImage(false);
    }
  };

  const saveProfile = async () => {
    if (savingProfile || savingImage) return;
    setImageError('');
    setImageSavedMsg('');
    setSavingProfile(true);
    try {
      let payload = { ...form, customMedia };
      if (payload.eaImage?.startsWith('blob:')) {
        payload = {
          ...payload,
          eaImage: await blobUrlToDataUrl(payload.eaImage),
        };
        setForm((prev) => ({ ...prev, eaImage: payload.eaImage }));
      }
      await updateProfile(payload);
      const hasPicture = Boolean(
        payload.eaImage &&
          !payload.eaImage.startsWith('blob:') &&
          String(payload.eaImage).trim(),
      );
      const hasBackgrounds = customMedia.some((m) => Boolean(m.url));
      setImageSavedMsg(
        hasPicture && hasBackgrounds
          ? 'Profile updated — picture and backgrounds saved. Syncing to clients…'
          : hasBackgrounds
            ? 'Profile updated — backgrounds saved. Syncing to clients…'
            : hasPicture
              ? 'Profile updated — picture saved and synced to clients.'
              : 'Profile updated — branding synced to license keys & clients.',
      );
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Could not save profile. Try again.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Portal shortcuts</h3>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Your live portal — license keys, subscribers, and EAs stay in these sections (saved to cloud).
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Link to="/admin/licenses" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
            <KeyRound size={16} /> License keys
          </Link>
          {isSuper ? (
            <Link to="/admin/subscriptions" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              <CreditCard size={16} /> Subscriptions / people
            </Link>
          ) : null}
          <Link to="/admin/eas" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
            <Cpu size={16} /> Manage EAs
          </Link>
          {isSuper ? (
            <Link to="/admin/approve" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
              <UserCheck size={16} /> Approve mentors
            </Link>
          ) : null}
        </div>
      </div>

      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Personal Information</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Saved to your live account — tap Update Profile after editing names.
        </p>
        <div className="field"><label>First Name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" /></div>
        <div className="field"><label>Last Name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" /></div>
        <div className="field"><label>Email Address</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></div>
        <div className="field"><label>Phone Number</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></div>
        <div className="field"><label>Mentor Name</label><input value={form.mentorName} onChange={(e) => setForm({ ...form, mentorName: e.target.value })} /></div>
      </div>
      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Branding</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload once — it syncs to every license key and client home (no need to regenerate keys). Names and backgrounds are saved to the live cloud, not a demo.
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
        {savingImage ? <p className="muted">Saving & syncing to licenses…</p> : null}
        {savingProfile ? <p className="muted">Updating profile…</p> : null}
        {imageSavedMsg ? (
          <p style={{ color: 'var(--green)', fontWeight: 700, margin: '6px 0' }}>
            {imageSavedMsg}
          </p>
        ) : null}
        {form.eaImage && (isRealImage(form.eaImage) || displayImageSrc(form.eaImage)) ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <img
              key={form.eaImage}
              src={displayImageSrc(form.eaImage) || form.eaImage}
              alt="EA"
              width={88}
              height={88}
              style={{
                borderRadius: 16,
                objectFit: 'cover',
                border: '1px solid rgba(59,130,246,0.5)',
                background: '#0e1220',
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ color: 'var(--green)', fontWeight: 700 }}>
                {imageSavedMsg ? 'Synced' : 'Ready'}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '8px 14px', marginTop: 6 }}
                onClick={() => {
                  const next = { ...form, eaImage: '' };
                  setForm(next);
                  setImageSavedMsg('');
                  void updateProfile(next);
                }}
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">No picture uploaded yet.</p>
        )}
        {imageError ? <p className="error">{imageError}</p> : null}
      </div>

      <BackgroundManager
        adminId={admin?.id || ''}
        customMedia={customMedia}
        onMediaChange={setCustomMedia}
        onSync={async (nextMedia) => {
          setCustomMedia(nextMedia);
          // Only patch media — spreading the whole form re-uploads the profile
          // picture and freezes the portal on every background save.
          await updateProfile({ customMedia: nextMedia });
        }}
      />

      {isSuper ? (
        <div className="glow-card">
          <h3 style={{ marginTop: 0 }}>App Logo</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Shown on the sign-up screen and portal login. Used exactly as
            uploaded — no cropping or edits.
          </p>
          <div className="field">
            <label>Logo Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void onPickAppLogo(e.target.files?.[0] ?? null)}
            />
          </div>
          {appLogoMsg ? (
            <p
              style={{
                color: appLogoMsg.startsWith('App logo saved')
                  ? 'var(--green)'
                  : '#f87171',
                fontWeight: 700,
                margin: '6px 0 0',
              }}
            >
              {appLogoMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        className="btn btn-blue"
        type="button"
        disabled={savingProfile || savingImage}
        onClick={() => void saveProfile()}
      >
        {savingProfile ? 'Updating…' : 'Update Profile'}
      </button>
    </div>
  );
}

export function ApproveAdminsPage() {
  const { admins, approveAdmin, approveAdmins, deleteAdmin, refreshAdminQueue } = useAdmin();
  const [q, setQ] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveMsg, setApproveMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const query = q.trim().toLowerCase();
  const match = (a: { fullName: string; email: string; id: string; eaName?: string }) => {
    if (!query) return true;
    return [a.fullName, a.email, a.id, a.eaName || '']
      .join(' ')
      .toLowerCase()
      .includes(query);
  };
  const pending = admins
    .filter((a) => normalizeAdminRole(a.role) === 'pending')
    .filter(match);
  const approved = admins
    .filter((a) => normalizeAdminRole(a.role) === 'admin')
    .filter(match);

  const onDelete = (id: string, label: string) => {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteAdmin(id);
  };

  const onApprove = async (id: string) => {
    if (approvingId) return;
    setApproveMsg('');
    setApprovingId(id);
    try {
      await approveAdmin(id);
      setApproveMsg(MENTOR_AUTH_MSG.approveSuccess);
    } catch (err) {
      console.error('[mentor-auth] Approve failed', err);
      setApproveMsg(MENTOR_AUTH_MSG.approveFailed);
    } finally {
      setApprovingId(null);
    }
  };

  const onApproveAll = async () => {
    if (approvingId || !pending.length) return;
    setApproveMsg('');
    setApprovingId('all');
    try {
      await approveAdmins(pending.map((a) => a.id));
      setApproveMsg(MENTOR_AUTH_MSG.approveAllSuccess);
    } catch (err) {
      console.error('[mentor-auth] Approve all failed', err);
      setApproveMsg(MENTOR_AUTH_MSG.approveFailed);
    } finally {
      setApprovingId(null);
    }
  };

  const onRefreshQueue = async () => {
    if (refreshing) return;
    setRefreshMsg('');
    setRefreshing(true);
    try {
      const result = await refreshAdminQueue();
      if (result.ok) {
        setRefreshMsg(MENTOR_AUTH_MSG.refreshSuccess);
      } else {
        console.warn('[mentor-auth] Refresh failed', result.error);
        setRefreshMsg(MENTOR_AUTH_MSG.refreshFailed);
      }
    } catch (err) {
      console.error('[mentor-auth] Refresh failed', err);
      setRefreshMsg(MENTOR_AUTH_MSG.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="title-blue" style={{ fontSize: 17, margin: 0 }}>Approve Admins</h2>
        <p className="muted">
          Pending requests and admins already approved. Each admin gets their own empty portal.
          Your mentor list is saved on this device — tap Restore from cloud only if someone is missing.
        </p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, ID…"
        />
      </div>

      <div className="stat-grid admin-stat-grid">
        <Stat value={String(pending.length)} label="Pending" tone="orange" />
        <Stat value={String(approved.length)} label="Approved" tone="green" />
      </div>

      {approveMsg ? (
        <p
          style={{
            margin: 0,
            color: approveMsg === MENTOR_AUTH_MSG.approveFailed ? '#f87171' : 'var(--green)',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {approveMsg}
        </p>
      ) : null}

      {refreshMsg ? (
        <p
          style={{
            margin: 0,
            color: refreshMsg === MENTOR_AUTH_MSG.refreshFailed ? '#f87171' : 'var(--green)',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {refreshMsg}
        </p>
      ) : null}

      <button
        className="btn btn-ghost"
        type="button"
        disabled={refreshing || Boolean(approvingId)}
        onClick={() => void onRefreshQueue()}
      >
        {refreshing ? 'Restoring…' : 'Restore from cloud'}
      </button>

      <div className="glow-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Pending</h3>
          {pending.length > 1 ? (
            <button
              className="btn btn-blue"
              type="button"
              disabled={Boolean(approvingId)}
              onClick={() => void onApproveAll()}
            >
              {approvingId === 'all' ? 'Approving…' : `Approve all (${pending.length})`}
            </button>
          ) : null}
        </div>
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
                <button
                  className="btn btn-blue"
                  type="button"
                  style={{ flex: 1 }}
                  disabled={Boolean(approvingId)}
                  onClick={() => void onApprove(a.id)}
                >
                  {approvingId === a.id ? 'Approving…' : 'Approve'}
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
  const {
    clientRequests,
    approveClient,
    addApprovedSubscriber,
    refreshClientQueue,
    markClientPaid,
    deleteClient,
    stats,
    clientsLoading,
  } = useAdmin();
  const [q, setQ] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [manualTone, setManualTone] = useState<'ok' | 'err'>('ok');
  const [manualSaving, setManualSaving] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveMsg, setApproveMsg] = useState('');
  const query = q.trim().toLowerCase();
  const match = (c: { firstName: string; lastName: string; email: string }) => {
    if (!query) return true;
    return `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(query);
  };
  const pending = clientRequests
    .filter((c) => normalizeClientStatus(c.status) === 'pending')
    .filter(match)
    .sort((a, b) => Number(Boolean(b.paymentClaimed)) - Number(Boolean(a.paymentClaimed)));
  const approved = clientRequests
    .filter((c) => normalizeClientStatus(c.status) === 'approved')
    .filter(match);
  const paidPending = pending.filter((c) => c.paymentClaimed).length;

  useEffect(() => {
    // Queue only — full license restore is background on boot (keeps taps smooth)
    void (async () => {
      setRefreshing(true);
      try {
        const result = await refreshClientQueue();
        if (result.ok) {
          setRefreshMsg(
            `${result.pending ?? 0} pending · ${result.approved ?? 0} approved`,
          );
        }
      } finally {
        setRefreshing(false);
      }
    })();
  }, [refreshClientQueue]);

  const onAddManual = async () => {
    if (manualSaving) return;
    setManualMsg('');
    setManualSaving(true);
    try {
      const result = await addApprovedSubscriber({
        email: manualEmail,
        firstName: manualFirst,
        lastName: manualLast,
      });
      if (result.ok) {
        setManualTone('ok');
        setManualMsg(
          `${result.client.firstName} ${result.client.lastName} (${result.client.email}) saved as approved — ready for license key.`,
        );
        setManualEmail('');
        setManualFirst('');
        setManualLast('');
      } else {
        setManualTone('err');
        setManualMsg(result.error);
      }
    } catch {
      setManualTone('err');
      setManualMsg('Could not add subscriber. Try again.');
    } finally {
      setManualSaving(false);
    }
  };

  const onDelete = (id: string, email: string) => {
    if (!confirm(`Delete ${email}? This removes them from the queue.`)) return;
    deleteClient(id);
  };

  const onApprove = async (id: string, label: string) => {
    if (approvingId) return;
    setApproveMsg('');
    setApprovingId(id);
    try {
      await approveClient(id);
      setApproveMsg(`${label} approved and saved to Firebase.`);
    } catch (err) {
      setApproveMsg(
        err instanceof Error ? err.message : 'Could not approve — check console logs and try again.',
      );
    } finally {
      setApprovingId(null);
    }
  };

  const onRefreshQueue = async () => {
    if (refreshing) return;
    setRefreshMsg('');
    setRefreshing(true);
    try {
      const result = await refreshClientQueue();
      if (result.ok) {
        setRefreshMsg(
          `Restored from cloud — ${result.pending ?? 0} awaiting approval, ${result.approved ?? 0} approved (${result.total ?? 0} total).`,
        );
      } else {
        setRefreshMsg(result.error || 'Could not refresh subscriber list.');
      }
    } catch {
      setRefreshMsg('Could not refresh subscriber list. Check your connection.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="title-blue" style={{ fontSize: 17, margin: 0 }}>Subscriptions</h2>
        <p className="muted">
          New Lumo Edge registrations land here (saved on server). Approve after you
          confirm payment proof at lumoedge08@gmail.com. If someone does not show up,
          add them manually below — they go straight to approved.
        </p>
      </div>

      <div className="glow-card">
        <h3 style={{ marginTop: 0 }}>Add subscriber manually</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Use when a client paid but is missing from the list. They are saved as{' '}
          <strong style={{ color: 'var(--green)' }}>approved</strong> immediately.
        </p>
        <div className="field">
          <label>Email</label>
          <input
            type="text"
            inputMode="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            placeholder="client@email.com"
            autoComplete="email"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>First name</label>
            <input
              value={manualFirst}
              onChange={(e) => setManualFirst(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="field">
            <label>Last name</label>
            <input
              value={manualLast}
              onChange={(e) => setManualLast(e.target.value)}
              placeholder="Last name"
            />
          </div>
        </div>
        <button
          className="btn btn-blue"
          type="button"
          disabled={manualSaving || !manualEmail.trim()}
          onClick={() => void onAddManual()}
        >
          {manualSaving ? 'Saving…' : 'Save as approved'}
        </button>
        {manualMsg ? (
          <p
            style={{
              margin: '10px 0 0',
              color: manualTone === 'ok' ? 'var(--green)' : '#f87171',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {manualMsg}
          </p>
        ) : null}
      </div>

      {approveMsg ? (
        <p
          style={{
            margin: 0,
            color: approveMsg.startsWith('Could') ? '#f87171' : 'var(--green)',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {approveMsg}
        </p>
      ) : null}

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
        />
      </div>

      <div className="stat-grid admin-stat-grid">
        <Stat value={String(stats.pendingClients)} label="Awaiting approval" tone="orange" />
        <Stat value={String(paidPending)} label="Marked I've Paid" tone="blue" />
        <Stat value={String(stats.approvedClients)} label="Approved clients" tone="green" />
      </div>
      {clientsLoading ? (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Syncing latest registrations in the background…
        </p>
      ) : null}

      <div className="glow-card" style={{ display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Missing subscribers?</h3>
          <p className="muted" style={{ margin: 0 }}>
            Your subscriber list is saved on this device and updates quietly in the background.
            Tap refresh only if someone paid and still does not appear.
          </p>
        </div>
        <button
          className="btn btn-blue"
          type="button"
          disabled={refreshing}
          onClick={() => void onRefreshQueue()}
        >
          {refreshing ? 'Refreshing…' : 'Refresh from cloud'}
        </button>
        {refreshMsg ? (
          <p
            style={{
              margin: 0,
              color: refreshMsg.startsWith('Restored') ? 'var(--green)' : '#f87171',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {refreshMsg}
          </p>
        ) : null}
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
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {c.firstName} {c.lastName}
                  </strong>
                  <div className="muted">{c.email}</div>
                </div>
                <ClientEmailMenu
                  client={c}
                  onMarkPaid={() => markClientPaid(c.id)}
                  onDelete={() => onDelete(c.id, c.email)}
                />
              </div>
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
                  disabled={approvingId === c.id}
                  onClick={() =>
                    void onApprove(c.id, `${c.firstName} ${c.lastName}`.trim() || c.email)
                  }
                >
                  {approvingId === c.id ? 'Saving…' : 'Approve'}
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
        <h3 style={{ marginTop: 0 }}>Approved — paid / ready for license</h3>
        {approved.length === 0 ? (
          <p className="muted">No approved clients yet.</p>
        ) : (
          approved.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {c.firstName} {c.lastName}
                  </strong>
                  <div className="muted">{c.email}</div>
                </div>
                <ClientEmailMenu
                  client={c}
                  onMarkPaid={() => markClientPaid(c.id)}
                  onDelete={() => onDelete(c.id, c.email)}
                />
              </div>
              {c.paymentClaimed ? (
                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 12, marginTop: 4 }}>
                  PAID
                </div>
              ) : null}
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
