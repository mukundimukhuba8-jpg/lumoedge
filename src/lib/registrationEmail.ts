/** Permissive email check for worldwide registration — no country or TLD rules. */

const MAX_EMAIL_LEN = 254;

export function normalizeRegistrationEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/** Accept any reasonable email shape; do not reject short or long addresses. */
export function isRegistrationEmail(raw: string): boolean {
  const email = normalizeRegistrationEmail(raw);
  if (!email || email.length > MAX_EMAIL_LEN) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (/\s/.test(email)) return false;
  return true;
}

export function registrationEmailError(raw: string): string | null {
  if (!String(raw || '').trim()) return 'Enter your email address.';
  if (!isRegistrationEmail(raw)) return 'Enter a valid email address.';
  return null;
}

export function splitNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = normalizeRegistrationEmail(email).split('@')[0] || 'Client';
  const parts = local.replace(/[._+-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: 'Client', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
