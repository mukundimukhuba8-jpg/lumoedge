import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { apiUrl } from '../../lib/apiBase';

type Tab = 'compose' | 'templates' | 'setup';
type ToMode = 'pick' | 'custom' | 'all_mentors' | 'all_clients' | 'everyone';

const TEMPLATES = [
  {
    id: 'announce',
    title: 'Announcement',
    subject: 'Platform announcement from Lumo Edge',
    body: 'Important update from Lumo Edge.\n\nPlease open the app for details.',
  },
  {
    id: 'welcome',
    title: 'Welcome',
    subject: 'Welcome to Lumo Edge',
    body: 'Hi,\n\nWelcome to Lumo Edge — your premium trading platform.',
  },
  {
    id: 'license',
    title: 'License note',
    subject: 'Your Lumo Edge license',
    body: 'Your license key is ready. Open Lumo Edge to activate it.',
  },
];

export function EmailCenterPage() {
  const { admin, admins, clientRequests } = useAdmin();
  const [tab, setTab] = useState<Tab>('compose');
  const [toMode, setToMode] = useState<ToMode>('pick');
  const [picked, setPicked] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [resendKey, setResendKey] = useState('');
  const [sending, setSending] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configSource, setConfigSource] = useState<string>('');

  const mentorCount = useMemo(() => {
    const seen = new Set<string>();
    for (const a of admins || []) {
      const email = String(a.email || '')
        .trim()
        .toLowerCase();
      if (email) seen.add(email);
    }
    return seen.size;
  }, [admins]);

  const clientCount = useMemo(() => {
    const seen = new Set<string>();
    for (const c of clientRequests || []) {
      const email = String(c.email || '')
        .trim()
        .toLowerCase();
      if (email) seen.add(email);
    }
    return seen.size;
  }, [clientRequests]);

  const refreshStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/email/status'), { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        source?: string;
      };
      setConfigured(Boolean(data.configured));
      setConfigSource(String(data.source || ''));
    } catch {
      setConfigured(false);
      setConfigSource('');
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const people = useMemo(() => {
    const rows: { email: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const a of admins || []) {
      const email = String(a.email || '')
        .trim()
        .toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      rows.push({
        email,
        label: `${a.fullName || a.email} (mentor · ${a.role || 'pending'})`,
      });
    }
    for (const c of clientRequests || []) {
      const email = String(c.email || '')
        .trim()
        .toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
      rows.push({
        email,
        label: `${name || email} (client)`,
      });
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [admins, clientRequests]);

  const isBroadcast =
    toMode === 'all_mentors' || toMode === 'all_clients' || toMode === 'everyone';

  const recipient = toMode === 'custom' ? customTo.trim() : picked.trim();

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setSubject(tpl.subject);
    setMessage(tpl.body);
    setTab('compose');
  };

  const saveApiKey = async () => {
    if (savingKey) return;
    setSavingKey(true);
    setStatus('');
    setError(false);
    try {
      if (!resendKey.trim().startsWith('re_')) {
        throw new Error('Paste your Resend API key (starts with re_).');
      }
      if (!adminPassword.trim()) {
        throw new Error('Enter your Super Admin password to save the key.');
      }
      const res = await fetch(apiUrl('/api/email/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: admin?.email || '',
          adminPassword,
          apiKey: resendKey.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      setResendKey('');
      setStatus('Resend API key saved — emails are ready.');
      await refreshStatus();
    } catch (e) {
      setError(true);
      setStatus(e instanceof Error ? e.message : 'Could not save key.');
    } finally {
      setSavingKey(false);
    }
  };

  const sendEmail = async () => {
    if (sending) return;
    setSending(true);
    setStatus('');
    setError(false);
    try {
      if (!subject.trim() || !message.trim()) {
        throw new Error('Enter subject and message.');
      }
      if (!isBroadcast && !recipient) {
        throw new Error('Choose a recipient, or send to every mentor / every client.');
      }
      if (!adminPassword.trim()) {
        throw new Error('Enter your Super Admin password to send.');
      }
      const payload: Record<string, string> = {
        adminEmail: admin?.email || '',
        adminPassword,
        subject: subject.trim(),
        message: message.trim(),
      };
      if (isBroadcast) {
        payload.audience = toMode;
      } else {
        payload.to = recipient;
      }
      const res = await fetch(apiUrl('/api/email/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        total?: number;
        failed?: number;
        results?: Array<{ ok?: boolean; error?: string }>;
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
            data.results?.find((r) => !r.ok)?.error ||
            `Send failed (${res.status})`,
        );
      }
      if (isBroadcast) {
        setStatus(
          `Sent to ${data.sent ?? 0} of ${data.total ?? 0} recipients` +
            (data.failed ? ` (${data.failed} failed)` : '') +
            '.',
        );
      } else {
        setStatus(`Sent successfully to ${recipient}.`);
      }
      setAdminPassword('');
    } catch (e) {
      setError(true);
      setStatus(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="email-center">
      <header className="email-center-head glow-card cyber-card">
        <Mail size={22} color="var(--electric)" />
        <div>
          <h2 style={{ margin: 0 }}>Send Emails</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Super Admin only — branded Lumo Edge emails via secure server
          </p>
          {configured === null ? (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              Checking Resend…
            </p>
          ) : configured ? (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
              Resend connected{configSource ? ` (${configSource})` : ''}
            </p>
          ) : (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171', fontWeight: 700 }}>
              Resend API key not configured — open Setup and paste your key
            </p>
          )}
        </div>
      </header>

      <div className="email-tabs">
        <button
          type="button"
          className={`email-tab${tab === 'compose' ? ' active' : ''}`}
          onClick={() => setTab('compose')}
        >
          Compose
        </button>
        <button
          type="button"
          className={`email-tab${tab === 'setup' ? ' active' : ''}`}
          onClick={() => setTab('setup')}
        >
          Setup
        </button>
        <button
          type="button"
          className={`email-tab${tab === 'templates' ? ' active' : ''}`}
          onClick={() => setTab('templates')}
        >
          Templates
        </button>
      </div>

      {tab === 'setup' ? (
        <div className="glow-card cyber-card" style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Paste your Resend API key here if Vercel env is missing. Key is saved
            server-side to Firebase secrets (not in the browser bundle).
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            To stop spam: in Resend → Domains, verify <strong>lumoedge.com</strong>, then set
            Vercel env EMAIL_FROM to something like{' '}
            <code>Lumo Edge &lt;noreply@lumoedge.com&gt;</code> and redeploy.
          </p>
          <div className="field">
            <label>Resend API key</label>
            <input
              type="password"
              value={resendKey}
              onChange={(e) => setResendKey(e.target.value)}
              placeholder="re_..."
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Super Admin password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Confirm it is you"
              autoComplete="current-password"
            />
          </div>
          <button
            type="button"
            className="btn btn-blue"
            disabled={savingKey}
            onClick={() => void saveApiKey()}
          >
            {savingKey ? <Loader2 size={16} className="spin" /> : null}
            {savingKey ? 'Saving…' : 'Save Resend API key'}
          </button>
          {status ? (
            <p style={{ margin: 0, fontWeight: 700, color: error ? '#f87171' : 'var(--green)' }}>
              {status}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'templates' ? (
        <div className="email-template-grid">
          {TEMPLATES.map((tpl) => (
            <article key={tpl.id} className="glow-card cyber-card email-template-card">
              <h3>{tpl.title}</h3>
              <p className="muted">{tpl.subject}</p>
              <button type="button" className="btn btn-blue" onClick={() => applyTemplate(tpl)}>
                Use template
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'compose' ? (
        <div className="glow-card cyber-card email-compose" style={{ display: 'grid', gap: 14 }}>
          {!configured ? (
            <p style={{ margin: 0, color: '#f87171', fontWeight: 700 }}>
              Resend is not configured. Open the Setup tab and paste your API key first.
            </p>
          ) : null}

          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 14, fontWeight: 800 }}>Who should get this email?</label>
            <div className="email-audience-grid">
              <button
                type="button"
                className={`email-audience-card${toMode === 'all_mentors' ? ' active' : ''}`}
                onClick={() => setToMode('all_mentors')}
              >
                <strong>Every mentor</strong>
                <span>All mentors registered on Lumo Edge ({mentorCount})</span>
              </button>
              <button
                type="button"
                className={`email-audience-card${toMode === 'all_clients' ? ' active' : ''}`}
                onClick={() => setToMode('all_clients')}
              >
                <strong>Every client</strong>
                <span>All clients on the platform ({clientCount})</span>
              </button>
              <button
                type="button"
                className={`email-audience-card${toMode === 'everyone' ? ' active' : ''}`}
                onClick={() => setToMode('everyone')}
              >
                <strong>Everyone</strong>
                <span>Mentors + clients (no duplicates)</span>
              </button>
              <button
                type="button"
                className={`email-audience-card${toMode === 'pick' ? ' active' : ''}`}
                onClick={() => setToMode('pick')}
              >
                <strong>One person</strong>
                <span>Pick a mentor or client from the list</span>
              </button>
              <button
                type="button"
                className={`email-audience-card${toMode === 'custom' ? ' active' : ''}`}
                onClick={() => setToMode('custom')}
              >
                <strong>Custom email</strong>
                <span>Type any email address</span>
              </button>
            </div>
          </div>

          {toMode === 'pick' ? (
            <div className="field">
              <label>Select mentor or client</label>
              <select value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">Select mentor or client…</option>
                {people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {toMode === 'custom' ? (
            <div className="field">
              <label>Email address</label>
              <input
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="client@email.com"
                autoComplete="off"
              />
            </div>
          ) : null}
          {toMode === 'all_mentors' ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Will send to every mentor email in the live cloud roster.
            </p>
          ) : null}
          {toMode === 'all_clients' ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Will send to every client email in the live cloud roster.
            </p>
          ) : null}
          {toMode === 'everyone' ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Will send to every mentor and every client on the platform.
            </p>
          ) : null}

          <div className="field">
            <label>Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Write your message…"
              className="email-editor"
            />
          </div>
          <div className="field">
            <label>Super Admin password (required to send)</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Confirm it is you"
              autoComplete="current-password"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-blue"
              disabled={sending || configured === false}
              onClick={() => void sendEmail()}
            >
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              {sending
                ? 'Sending…'
                : toMode === 'all_mentors'
                  ? 'Send to every mentor'
                  : toMode === 'all_clients'
                    ? 'Send to every client'
                    : toMode === 'everyone'
                      ? 'Send to everyone'
                      : 'Send Email'}
            </button>
            {status ? (
              <span style={{ fontWeight: 700, color: error ? '#f87171' : 'var(--green)' }}>
                {status}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
