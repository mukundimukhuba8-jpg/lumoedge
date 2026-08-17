#!/usr/bin/env node
/**
 * One-shot preview emails to Super Admin inbox.
 * Usage: RESEND_API_KEY=re_... node scripts/send-email-previews.mjs
 * Does not commit the key.
 */
import {
  licenseKeyEmail,
  mentorApprovedEmail,
  mentorReceivedEmail,
  adminManualEmail,
} from '../api/_lib/email/messages.mjs';
import { sendResendEmail } from '../api/_lib/email/send.mjs';

const TO = process.env.PREVIEW_TO || 'mukundimukhuba8@gmail.com';

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('Set RESEND_API_KEY');
    process.exit(1);
  }
  const samples = [
    {
      label: 'mentor_received',
      ...mentorReceivedEmail({ name: 'Mukundi' }),
      subjectPrefix: '[Preview] ',
    },
    {
      label: 'mentor_approved',
      ...mentorApprovedEmail({ name: 'Mukundi' }),
      subjectPrefix: '[Preview] ',
    },
    {
      label: 'license_key',
      ...licenseKeyEmail({
        name: 'Mukundi',
        licenseKey: 'LUMO-TEST-PREV-VIEW',
        eaName: 'Lumo Edge',
      }),
      subjectPrefix: '[Preview] ',
    },
    {
      label: 'admin_manual',
      ...adminManualEmail({
        subject: 'Lumo Edge Email Center sample',
        messageText:
          'This is how a Super Admin manual email looks with Lumo Edge branding.\n\nYou can send these from Admin → Send Emails.',
      }),
      subjectPrefix: '[Preview] ',
    },
  ];

  for (const s of samples) {
    const subject = `${s.subjectPrefix}${s.subject}`;
    const result = await sendResendEmail({
      to: TO,
      subject,
      html: s.html,
      tags: [`preview-${s.label}`],
    });
    console.log(s.label, result.ok ? `OK ${result.id}` : `FAIL ${result.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
