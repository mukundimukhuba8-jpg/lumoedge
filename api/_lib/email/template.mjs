/** Shared Lumo Edge HTML email layout — safe for common email clients. */

export const LOGO_URL = 'https://lumoedge.com/lumo-logo.png';
export const APP_ORIGIN = 'https://lumoedge.com';
export const SUPPORT_EMAIL = 'lumoedge08@gmail.com';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ title?: string, preheader?: string, bodyHtml: string, ctaLabel?: string, ctaUrl?: string }} input
 */
export function renderLumoEmail(input) {
  const title = esc(input.title || 'Lumo Edge');
  const preheader = esc(input.preheader || '');
  const ctaLabel = input.ctaLabel ? esc(input.ctaLabel) : '';
  const ctaUrl = input.ctaUrl ? esc(input.ctaUrl) : '';
  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
      <tr>
        <td align="center" style="padding:8px 0 28px;">
          <a href="${ctaUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.02em;padding:14px 28px;border-radius:999px;">
            ${ctaLabel}
          </a>
        </td>
      </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#070b14;color:#e8eefc;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070b14;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#0c1220;border:1px solid rgba(59,130,246,0.28);border-radius:18px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 24px 12px;background:radial-gradient(ellipse at top, rgba(37,99,235,0.28), transparent 60%);">
              <img src="${LOGO_URL}" width="72" height="72" alt="Lumo Edge" style="display:block;border-radius:16px;border:0;" />
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.06em;color:#ffffff;margin-top:14px;">
                LUMO EDGE
              </div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#93a4c7;margin-top:4px;">
                Premium trading platform
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#d7e0f5;">
              ${input.bodyHtml}
            </td>
          </tr>
          ${ctaBlock}
          <tr>
            <td style="padding:18px 28px 28px;border-top:1px solid rgba(148,163,184,0.18);font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8b9bb8;text-align:center;">
              <strong style="color:#c7d2ea;">Lumo Edge</strong><br/>
              Questions? Contact
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#60a5fa;text-decoration:none;">${SUPPORT_EMAIL}</a><br/>
              <a href="${APP_ORIGIN}" style="color:#93a4c7;text-decoration:none;">${APP_ORIGIN}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function paragraph(text) {
  return `<p style="margin:0 0 14px;">${esc(text)}</p>`;
}

export function licenseKeyBox(key) {
  return `
  <div style="margin:18px 0;padding:16px 18px;border-radius:12px;background:#08101f;border:1px dashed rgba(56,189,248,0.55);text-align:center;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;margin-bottom:8px;">Your License Key</div>
    <div style="font-family:Consolas,Monaco,monospace;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.04em;word-break:break-all;">
      ${esc(key)}
    </div>
  </div>`;
}
