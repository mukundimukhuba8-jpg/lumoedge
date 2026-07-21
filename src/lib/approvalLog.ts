/** Structured logging for client + mentor registration approval flows. */

type ApprovalLogMeta = Record<string, unknown>;

function prefix(kind: 'client' | 'mentor', step: string) {
  return `[approval:${kind}] ${step}`;
}

export function approvalLog(
  kind: 'client' | 'mentor',
  step: string,
  meta?: ApprovalLogMeta,
) {
  const msg = prefix(kind, step);
  if (meta && Object.keys(meta).length) console.info(msg, meta);
  else console.info(msg);
}

export function approvalWarn(
  kind: 'client' | 'mentor',
  step: string,
  meta?: ApprovalLogMeta,
) {
  const msg = prefix(kind, step);
  if (meta && Object.keys(meta).length) console.warn(msg, meta);
  else console.warn(msg);
}

export function approvalError(
  kind: 'client' | 'mentor',
  step: string,
  meta?: ApprovalLogMeta,
) {
  const msg = prefix(kind, step);
  if (meta && Object.keys(meta).length) console.error(msg, meta);
  else console.error(msg);
}
