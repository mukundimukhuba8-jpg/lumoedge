import { isValidEmail, sendResendEmail, resolveResendApiKey } from './send.mjs';
import { sendTrackedEmail } from './log.mjs';
import {
  adminManualEmail,
  licenseKeyEmail,
  mentorApprovedEmail,
  mentorReceivedEmail,
} from './messages.mjs';

export { isValidEmail, sendResendEmail, resolveResendApiKey };

export async function notifyMentorReceived(ctx, mentor) {
  const to = isValidEmail(mentor?.email);
  if (!to) return { ok: false, skipped: true, error: 'no email' };
  const msg = mentorReceivedEmail({ name: mentor?.fullName || mentor?.mentorName });
  return sendTrackedEmail({
    ...ctx,
    sendResendEmail,
    idempotencyKey: `mentor-received:${mentor.id || to}`,
    type: 'mentor_received',
    relatedId: String(mentor.id || ''),
    to,
    subject: msg.subject,
    html: msg.html,
  });
}

export async function notifyMentorApproved(ctx, mentor) {
  const to = isValidEmail(mentor?.email);
  if (!to) return { ok: false, skipped: true, error: 'no email' };
  const msg = mentorApprovedEmail({ name: mentor?.fullName || mentor?.mentorName });
  return sendTrackedEmail({
    ...ctx,
    sendResendEmail,
    idempotencyKey: `mentor-approved:${mentor.id || to}`,
    type: 'mentor_approved',
    relatedId: String(mentor.id || ''),
    to,
    subject: msg.subject,
    html: msg.html,
  });
}

export async function notifyLicenseKey(ctx, license) {
  const to = isValidEmail(license?.email || license?.clientEmail);
  const key = String(license?.key || '').trim();
  if (!to || !key) {
    return { ok: false, skipped: true, error: 'email or license key missing' };
  }
  const msg = licenseKeyEmail({
    name: license?.clientName || license?.name,
    licenseKey: key,
    eaName: license?.eaName,
  });
  const norm = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sendTrackedEmail({
    ...ctx,
    sendResendEmail,
    idempotencyKey: `license-key:${norm}`,
    type: 'license_key',
    relatedId: norm,
    to,
    subject: msg.subject,
    html: msg.html,
  });
}

export async function notifyAdminManual(ctx, input) {
  const to = isValidEmail(input?.to);
  if (!to) return { ok: false, skipped: true, error: 'invalid recipient' };
  const msg = adminManualEmail({
    subject: input.subject,
    messageHtml: input.html,
    messageText: input.text || input.message,
  });
  return sendTrackedEmail({
    ...ctx,
    sendResendEmail,
    idempotencyKey: `admin-manual:${to}:${Date.now()}`,
    type: 'admin_manual',
    relatedId: String(input.relatedId || ''),
    to,
    subject: msg.subject,
    html: msg.html,
  });
}
