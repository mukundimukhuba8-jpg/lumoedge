/**
 * Firebase Cloud Functions for Lumo Edge transactional email.
 * Resend API key: set with `firebase functions:secrets:set RESEND_API_KEY`
 *
 * RTDB triggers cover mentor signup / approval / license writes.
 * HTTPS sendAdminEmail is Super-Admin gated (password hash check).
 *
 * Note: Live Vercel API also sends the same emails so production works
 * even before Functions are deployed. Idempotency keys prevent duplicates.
 */

const { onValueWritten } = require('firebase-functions/v2/database');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { createHash } = require('crypto');

initializeApp();

const resendApiKey = defineSecret('RESEND_API_KEY');

const SUPER_EMAIL = 'mukundimukhuba8@gmail.com';
const SUPER_SHA =
  '18026064be7ec28f428f49e9c93cc0c1f86d3883f11189805f592298467663c9';
const LOGO_URL = 'https://lumoedge.com/lumo-logo.png';
const APP_ORIGIN = 'https://lumoedge.com';
const SUPPORT_EMAIL = 'lumoedge08@gmail.com';

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmail({ title, preheader, bodyHtml, ctaLabel, ctaUrl }) {
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td align="center" style="padding:8px 0 28px;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;padding:14px 28px;border-radius:999px;">${esc(ctaLabel)}</a></td></tr>`
      : '';
  return `<!DOCTYPE html><html><body style="margin:0;background:#070b14;color:#e8eefc;"><div style="display:none;max-height:0;overflow:hidden;">${esc(preheader || '')}</div><table width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:24px 12px;"><tr><td align="center"><table width="100%" style="max-width:560px;background:#0c1220;border:1px solid rgba(59,130,246,.28);border-radius:18px;"><tr><td align="center" style="padding:28px 24px 12px;"><img src="${LOGO_URL}" width="72" height="72" alt="Lumo Edge" style="border-radius:16px;"/><div style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:.06em;color:#fff;margin-top:14px;">LUMO EDGE</div></td></tr><tr><td style="padding:8px 28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#d7e0f5;">${bodyHtml}</td></tr>${cta}<tr><td style="padding:18px 28px 28px;border-top:1px solid rgba(148,163,184,.18);font-family:Arial,sans-serif;font-size:12px;color:#8b9bb8;text-align:center;"><strong style="color:#c7d2ea;">Lumo Edge</strong><br/>Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#60a5fa;text-decoration:none;">${SUPPORT_EMAIL}</a></td></tr></table></td></tr></table></body></html>`;
}

function p(text) {
  return `<p style="margin:0 0 14px;">${esc(text)}</p>`;
}

async function alreadySent(key) {
  const snap = await getDatabase().ref('lumo/emailLogs').orderByChild('idempotencyKey').equalTo(key).limitToFirst(5).get();
  if (!snap.exists()) return false;
  const val = snap.val() || {};
  return Object.values(val).some((r) => r && r.status === 'sent');
}

async function logEmail(entry) {
  const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await getDatabase().ref(`lumo/emailLogs/${id}`).set({
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

async function sendResend({ apiKey, to, subject, html, type, idempotencyKey, relatedId }) {
  if (await alreadySent(idempotencyKey)) {
    return { ok: true, skipped: true };
  }
  const from = process.env.EMAIL_FROM || 'Lumo Edge <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      reply_to: process.env.EMAIL_REPLY_TO || SUPPORT_EMAIL,
    }),
  });
  const data = await res.json().catch(() => ({}));
  const ok = res.ok;
  await logEmail({
    to,
    type,
    subject,
    status: ok ? 'sent' : 'failed',
    idempotencyKey,
    relatedId: relatedId || '',
    error: ok ? '' : data.message || `status ${res.status}`,
    resendId: data.id || '',
  });
  return { ok, id: data.id, error: data.message };
}

exports.onMentorAdminWrite = onValueWritten(
  { ref: '/lumo/auth/admins', secrets: [resendApiKey] },
  async (event) => {
    // admins is an array in this app — detect pending creates / pending→admin via whole list diff
    const before = event.data.before.val() || [];
    const after = event.data.after.val() || [];
    const beforeArr = Array.isArray(before) ? before : Object.values(before || {});
    const afterArr = Array.isArray(after) ? after : Object.values(after || {});
    const beforeById = new Map(beforeArr.map((a) => [String(a?.id || a?.email || ''), a]));
    const apiKey = resendApiKey.value();

    for (const mentor of afterArr) {
      if (!mentor?.email) continue;
      const id = String(mentor.id || mentor.email);
      const prev = beforeById.get(id) || beforeById.get(String(mentor.email || ''));
      const role = String(mentor.role || '').toLowerCase();
      const prevRole = String(prev?.role || '').toLowerCase();
      const email = String(mentor.email).trim().toLowerCase();

      if (!prev && role === 'pending') {
        const html = renderEmail({
          title: 'Application received',
          preheader: 'Your mentor application is under review.',
          bodyHtml: [
            p(`Hi ${mentor.fullName || ''},`.trim()),
            p('Thank you for registering as a mentor with Lumo Edge.'),
            p('Your mentor account is currently awaiting approval from our team.'),
            p('You will receive another email as soon as your account has been approved.'),
            p('Please do not create another account while your application is being reviewed.'),
          ].join(''),
        });
        await sendResend({
          apiKey,
          to: email,
          subject: 'Your Lumo Edge Mentor Application Has Been Received',
          html,
          type: 'mentor_received',
          idempotencyKey: `mentor-received:${id}`,
          relatedId: id,
        });
      }

      if (prevRole === 'pending' && role === 'admin') {
        const html = renderEmail({
          title: 'Mentor approved',
          preheader: 'Your mentor account is approved.',
          bodyHtml: [
            p(`Congratulations ${mentor.fullName || ''}!`.trim()),
            p('Your Lumo Edge mentor account has been approved.'),
            p('You can now log in to your mentor dashboard and start using your account.'),
            p('Welcome to Lumo Edge.'),
          ].join(''),
          ctaLabel: 'LOGIN TO YOUR DASHBOARD',
          ctaUrl: `${APP_ORIGIN}/admin/login`,
        });
        await sendResend({
          apiKey,
          to: email,
          subject: 'Welcome to Lumo Edge — Your Mentor Account Has Been Approved',
          html,
          type: 'mentor_approved',
          idempotencyKey: `mentor-approved:${id}`,
          relatedId: id,
        });
      }
    }
  },
);

exports.onVaultWrite = onValueWritten(
  { ref: '/lumo/vault', secrets: [resendApiKey] },
  async (event) => {
    const before = event.data.before.val() || [];
    const after = event.data.after.val() || [];
    const beforeArr = Array.isArray(before) ? before : Object.values(before || {});
    const afterArr = Array.isArray(after) ? after : Object.values(after || {});
    const beforeKeys = new Set(
      beforeArr.map((v) =>
        String(v?.key || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, ''),
      ),
    );
    const apiKey = resendApiKey.value();
    for (const lic of afterArr) {
      const norm = String(lic?.key || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (!norm || beforeKeys.has(norm)) continue;
      const to = String(lic.email || lic.clientEmail || '')
        .trim()
        .toLowerCase();
      if (!to || !to.includes('@')) continue;
      const key = String(lic.key || '').trim();
      const html = renderEmail({
        title: 'License key',
        preheader: 'Your Lumo Edge license key is ready.',
        bodyHtml: [
          p(`Hi ${lic.clientName || ''},`.trim()),
          p('Your Lumo Edge license key is ready.'),
          `<div style="margin:18px 0;padding:16px;border-radius:12px;background:#08101f;border:1px dashed rgba(56,189,248,.55);text-align:center;"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;margin-bottom:8px;">Your License Key</div><div style="font-family:Consolas,monospace;font-size:18px;font-weight:700;color:#fff;">${esc(key)}</div></div>`,
          p('Open Lumo Edge, go to Activate / License, paste this key, and confirm.'),
          p(`Need help? Email ${SUPPORT_EMAIL}.`),
        ].join(''),
        ctaLabel: 'OPEN LUMO EDGE',
        ctaUrl: APP_ORIGIN,
      });
      await sendResend({
        apiKey,
        to,
        subject: 'Your Lumo Edge License Key',
        html,
        type: 'license_key',
        idempotencyKey: `license-key:${norm}`,
        relatedId: norm,
      });
    }
  },
);

exports.sendAdminEmail = onRequest(
  { secrets: [resendApiKey], cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'POST only' });
      return;
    }
    const body = req.body || {};
    const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
    const adminPassword = String(body.adminPassword || '');
    const hash = createHash('sha256').update(adminPassword).digest('hex');
    if (!(adminEmail === SUPER_EMAIL && hash === SUPER_SHA)) {
      res.status(403).json({ ok: false, error: 'Super Admin only' });
      return;
    }
    const to = String(body.to || '').trim().toLowerCase();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || body.text || '').trim();
    if (!to || !subject || !message) {
      res.status(400).json({ ok: false, error: 'to, subject, message required' });
      return;
    }
    const html = renderEmail({
      title: subject,
      preheader: message.slice(0, 120),
      bodyHtml: message
        .split(/\n+/)
        .map((line) => p(line))
        .join(''),
      ctaLabel: 'OPEN LUMO EDGE',
      ctaUrl: APP_ORIGIN,
    });
    const result = await sendResend({
      apiKey: resendApiKey.value(),
      to,
      subject,
      html,
      type: 'admin_manual',
      idempotencyKey: `admin-manual:${to}:${Date.now()}`,
    });
    res.status(result.ok ? 200 : 502).json(result);
  },
);
