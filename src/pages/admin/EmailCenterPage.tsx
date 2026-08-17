import { useMemo, useState } from 'react';
import { Loader2, Mail, Send, Users } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { apiUrl } from '../../lib/apiBase';

type Tab = 'compose' | 'templates';

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
  const [toMode, setToMode] = useState<'pick' | 'custom'>('pick');
  const [picked, setPicked] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);

  const people = useMemo(() => {
    const rows: { email: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const a of admins || []) {
      const email = String(a.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      rows.push({
        email,
        label: `${a.fullName || a.email} (mentor · ${a.role || 'pending'})`,
      });
    }
    for (const c of clientRequests || []) {
      const email = String(c.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      rows.push({
        email,
        label: `${[c.firstName, c.lastName].filter(Boolean).join(' ') || email} (client)`,
      });
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }, [admins, clientRequests]);

  const recipient = toMode === 'custom' ? customTo.trim() : picked.trim();

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setSubject(tpl.subject);
    setMessage(tpl.body);
    setTab('compose');
  };

  const sendEmail = async () => {
    if (sending) return;
    setSending(true);
    setStatus('');
    setError(false);
    try {
      if (!recipient || !subject.trim() || !message.trim()) {
        throw new Error('Enter recipient, subject, and message.');
      }
      if (!adminPassword.trim()) {
        throw new Error('Enter your Super Admin password to send.');
      }
      const res = await fetch(apiUrl('/api/email/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: admin?.email || '',
          adminPassword,
          to: recipient,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        results?: Array<{ ok?: boolean; error?: string }>;
      };
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
            data.results?.find((r) => !r.ok)?.error ||
            `Send failed (${res.status})`,
        );
      }
      setStatus(`Sent successfully to ${recipient}.`);
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
          className={`email-tab${tab === 'templates' ? ' active' : ''}`}
          onClick={() => setTab('templates')}
        >
          Templates
        </button>
      </div>

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
      ) : (
        <div className="glow-card cyber-card email-compose" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label>To</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className={`btn ${toMode === 'pick' ? 'btn-blue' : 'btn-ghost'}`}
                onClick={() => setToMode('pick')}
              >
                <Users size={14} /> Select user
              </button>
              <button
                type="button"
                className={`btn ${toMode === 'custom' ? 'btn-blue' : 'btn-ghost'}`}
                onClick={() => setToMode('custom')}
              >
                Enter email
              </button>
            </div>
            {toMode === 'pick' ? (
              <select value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">Select mentor or client…</option>
                {people.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="client@email.com"
                autoComplete="off"
              />
            )}
          </div>
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
              disabled={sending}
              onClick={() => void sendEmail()}
            >
              {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              {sending ? 'Sending…' : 'Send Email'}
            </button>
            {status ? (
              <span style={{ fontWeight: 700, color: error ? '#f87171' : 'var(--green)' }}>
                {status}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
