import {
  APP_ORIGIN,
  SUPPORT_EMAIL,
  licenseKeyBox,
  paragraph,
  renderLumoEmail,
} from './template.mjs';

export function mentorReceivedEmail({ name } = {}) {
  const who = name ? ` ${name}` : '';
  const bodyHtml = [
    paragraph(`Hi${who},`),
    paragraph(
      'Thank you for registering as a mentor with Lumo Edge.',
    ),
    paragraph(
      'Your mentor account is currently awaiting approval from our team.',
    ),
    paragraph(
      'You will receive another email as soon as your account has been approved.',
    ),
    paragraph(
      'Please do not create another account while your application is being reviewed.',
    ),
  ].join('');
  return {
    subject: 'Your Lumo Edge Mentor Application Has Been Received',
    html: renderLumoEmail({
      title: 'Application received',
      preheader: 'Your Lumo Edge mentor application is under review.',
      bodyHtml,
    }),
  };
}

export function mentorApprovedEmail({ name } = {}) {
  const who = name ? ` ${name}` : '';
  const bodyHtml = [
    paragraph(`Congratulations${who}!`),
    paragraph('Your Lumo Edge mentor account has been approved.'),
    paragraph(
      'You can now log in to your mentor dashboard and start using your account.',
    ),
    paragraph('Welcome to Lumo Edge.'),
  ].join('');
  return {
    subject: 'Welcome to Lumo Edge — Your Mentor Account Has Been Approved',
    html: renderLumoEmail({
      title: 'Mentor approved',
      preheader: 'Your Lumo Edge mentor account is approved — log in now.',
      bodyHtml,
      ctaLabel: 'LOGIN TO YOUR DASHBOARD',
      ctaUrl: `${APP_ORIGIN}/admin/login`,
    }),
  };
}

export function licenseKeyEmail({ name, licenseKey, eaName } = {}) {
  const who = name ? ` ${name}` : '';
  const ea = eaName ? ` for ${eaName}` : '';
  const bodyHtml = [
    paragraph(`Hi${who},`),
    paragraph(`Your Lumo Edge license key${ea} is ready.`),
    licenseKeyBox(licenseKey),
    paragraph(
      'Open the Lumo Edge app, go to Activate / License, paste this key exactly, and confirm.',
    ),
    paragraph(
      'Keep this email safe. Do not share your license key with anyone else.',
    ),
    paragraph(`Need help? Email ${SUPPORT_EMAIL}.`),
  ].join('');
  return {
    subject: 'Your Lumo Edge License Key',
    html: renderLumoEmail({
      title: 'License key',
      preheader: 'Your Lumo Edge license key is ready.',
      bodyHtml,
      ctaLabel: 'OPEN LUMO EDGE',
      ctaUrl: APP_ORIGIN,
    }),
  };
}

export function adminManualEmail({ subject, messageHtml, messageText }) {
  const body =
    messageHtml ||
    String(messageText || '')
      .split(/\n+/)
      .map((line) => paragraph(line))
      .join('');
  return {
    subject: String(subject || 'Message from Lumo Edge').trim(),
    html: renderLumoEmail({
      title: subject || 'Lumo Edge',
      preheader: String(messageText || subject || '').slice(0, 120),
      bodyHtml: body,
      ctaLabel: 'OPEN LUMO EDGE',
      ctaUrl: APP_ORIGIN,
    }),
  };
}
