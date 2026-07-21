import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Loader2,
  Mail,
  Send,
  Trash2,
  Users,
} from 'lucide-react';

type Tab = 'templates' | 'compose' | 'send';

type Template = {
  id: string;
  title: string;
  subject: string;
  body: string;
  tag: string;
};

const TEMPLATES: Template[] = [
  { id: 'welcome', title: 'Welcome Email', subject: 'Welcome to Lumo Edge', body: 'Hi {{name}}, welcome to your premium trading platform.', tag: 'Onboarding' },
  { id: 'license', title: 'License Activated', subject: 'Your license is active', body: 'Your license key is now active. Happy trading!', tag: 'License' },
  { id: 'expiring', title: 'License Expiring', subject: 'License expiring soon', body: 'Your license expires in {{days}} days.', tag: 'License' },
  { id: 'sub', title: 'Subscription Reminder', subject: 'Subscription renewal', body: 'Please renew your subscription to keep access.', tag: 'Billing' },
  { id: 'paid', title: 'Payment Confirmation', subject: 'Payment received', body: 'We received your payment. Thank you!', tag: 'Billing' },
  { id: 'approved', title: 'Account Approved', subject: 'Account approved', body: 'Your mentor account has been approved.', tag: 'Admin' },
  { id: 'suspended', title: 'Account Suspended', subject: 'Account suspended', body: 'Your account has been suspended. Contact support.', tag: 'Admin' },
  { id: 'trade', title: 'Trade Update', subject: 'New trade signal', body: 'Your mentor sent a new trade signal.', tag: 'Trading' },
  { id: 'weekly', title: 'Weekly Report', subject: 'Weekly performance report', body: 'Here is your weekly trading summary.', tag: 'Reports' },
  { id: 'announce', title: 'Announcement', subject: 'Platform announcement', body: 'Important update from Lumo Edge.', tag: 'News' },
];

const AUDIENCES = [
  { id: 'all', label: 'All Clients', count: 128 },
  { id: 'paid', label: 'Paid Clients', count: 94 },
  { id: 'trial', label: 'Trial Clients', count: 22 },
  { id: 'expired', label: 'Expired Clients', count: 12 },
  { id: 'admins', label: 'Admins', count: 8 },
  { id: 'mentors', label: 'Mentors', count: 14 },
  { id: 'client', label: 'Specific Client', count: 1 },
  { id: 'admin', label: 'Specific Admin', count: 1 },
  { id: 'custom', label: 'Custom Email List', count: 0 },
] as const;

export function EmailCenterPage() {
  const [tab, setTab] = useState<Tab>('templates');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const recipientCount = useMemo(
    () => AUDIENCES.find((a) => a.id === audience)?.count ?? 0,
    [audience],
  );

  const applyTemplate = (tpl: Template) => {
    setSubject(tpl.subject);
    setBody(tpl.body);
    setTab('compose');
  };

  const sendNow = async () => {
    setConfirmOpen(false);
    setSending(true);
    setSentMsg('');
    await new Promise((r) => window.setTimeout(r, 1400));
    setSending(false);
    setSentMsg(`Successfully queued for ${recipientCount} recipients.`);
  };

  return (
    <div className="email-center">
      <header className="email-center-head glow-card cyber-card">
        <Mail size={22} color="var(--electric)" />
        <div>
          <h2 style={{ margin: 0 }}>Email Center</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Premium templates, compose, and audience targeting
          </p>
        </div>
      </header>

      <div className="email-tabs">
        {([
          ['templates', 'Templates'],
          ['compose', 'Compose'],
          ['send', 'Send To'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`email-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'templates' ? (
        <div className="email-template-grid">
          {TEMPLATES.map((tpl) => (
            <article key={tpl.id} className="glow-card cyber-card email-template-card">
              <span className="email-template-tag">{tpl.tag}</span>
              <h3>{tpl.title}</h3>
              <p className="muted">{tpl.subject}</p>
              <div className="email-template-actions">
                <button type="button" className="btn btn-ghost" onClick={() => applyTemplate(tpl)}>
                  <Edit3 size={14} /> Use
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => applyTemplate(tpl)}>
                  Preview
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => applyTemplate({ ...tpl, id: `${tpl.id}-copy` })}>
                  <Copy size={14} />
                </button>
                <button type="button" className="btn btn-ghost" aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'compose' ? (
        <div className="glow-card cyber-card email-compose">
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message…"
              className="email-editor"
            />
          </div>
          <div className="email-compose-meta">
            <span className="muted">{body.length} characters</span>
            <div className="email-compose-actions">
              <button type="button" className="btn btn-ghost">Save Draft</button>
              <button type="button" className="btn btn-ghost">Send Test</button>
              <button type="button" className="btn btn-ghost">Schedule</button>
              <button
                type="button"
                className="btn btn-blue"
                disabled={!subject.trim() || sending}
                onClick={() => setConfirmOpen(true)}
              >
                {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                Send Now
              </button>
            </div>
          </div>
          <div className="email-preview glow-card">
            <strong>Preview</strong>
            <p className="muted" style={{ margin: '6px 0' }}>{subject || 'Subject line'}</p>
            <div>{body || 'Message preview…'}</div>
          </div>
        </div>
      ) : null}

      {tab === 'send' ? (
        <div className="email-audience-grid">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`email-audience-card glow-card cyber-card${audience === a.id ? ' active' : ''}`}
              onClick={() => setAudience(a.id)}
            >
              <Users size={18} />
              <strong>{a.label}</strong>
              <span className="muted">{a.count} recipients</span>
              {audience === a.id ? <Check size={16} className="email-aud-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {sentMsg ? <p className="email-sent-msg">{sentMsg}</p> : null}

      {confirmOpen ? (
        <div className="email-confirm-backdrop smooth-fade">
          <div className="glow-card cyber-card email-confirm">
            <h3 style={{ marginTop: 0 }}>Confirm send</h3>
            <p className="muted">
              Send to <strong>{AUDIENCES.find((a) => a.id === audience)?.label}</strong> ({recipientCount} recipients)?
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-blue" onClick={() => void sendNow()}>Confirm Send</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
