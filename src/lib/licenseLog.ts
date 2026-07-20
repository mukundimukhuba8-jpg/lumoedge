/** Structured logging for license generation and activation flows. */

type LicenseLogMeta = Record<string, unknown>;

function prefix(phase: string, step: string) {
  return `[license:${phase}] ${step}`;
}

export function licenseLog(phase: string, step: string, meta?: LicenseLogMeta) {
  const msg = prefix(phase, step);
  if (meta && Object.keys(meta).length) {
    console.info(msg, meta);
  } else {
    console.info(msg);
  }
}

export function licenseWarn(phase: string, step: string, meta?: LicenseLogMeta) {
  const msg = prefix(phase, step);
  if (meta && Object.keys(meta).length) {
    console.warn(msg, meta);
  } else {
    console.warn(msg);
  }
}

export function licenseError(phase: string, step: string, meta?: LicenseLogMeta) {
  const msg = prefix(phase, step);
  if (meta && Object.keys(meta).length) {
    console.error(msg, meta);
  } else {
    console.error(msg);
  }
}
