const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : '';
}

function resolveFrom() {
  // Prefer verified domain when available; fall back to Resend onboarding sender.
  const configured = String(process.env.EMAIL_FROM || '').trim();
  if (configured) return configured;
  // lumoedge.com domain exists in Resend but may be unverified — onboarding works immediately
  return 'Lumo Edge <onboarding@resend.dev>';
}

/**
 * Send via Resend. API key must only live in server env / Functions secrets.
 * @returns {Promise<{ ok: boolean, id?: string, error?: string, skipped?: boolean }>}
 */
export async function sendResendEmail({
  to,
  subject,
  html,
  replyTo,
  tags,
}) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const recipient = isValidEmail(to);
  if (!recipient) {
    return { ok: false, skipped: true, error: 'invalid or missing recipient email' };
  }
  const from = resolveFrom();
  const payload = {
    from,
    to: [recipient],
    subject: String(subject || '').trim() || 'Lumo Edge',
    html: String(html || ''),
    reply_to: String(replyTo || process.env.EMAIL_REPLY_TO || 'lumoedge08@gmail.com').trim(),
  };
  if (Array.isArray(tags) && tags.length) {
    payload.tags = tags.map((t) =>
      typeof t === 'string' ? { name: 'type', value: t } : t,
    );
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `Resend failed (${res.status})`,
      };
    }
    return { ok: true, id: data?.id || '' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Resend request failed',
    };
  }
}
