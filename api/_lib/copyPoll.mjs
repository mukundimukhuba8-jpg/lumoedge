import { dbList } from './licenseClaim.mjs';

const TERMINAL_ROOT = 'lumo/copyTerminals';

export function sortOrders(orders) {
  return [...orders].sort((a, b) => {
    const ai = Number(String(a?.id || '').replace(/^ord-/, '')) || 0;
    const bi = Number(String(b?.id || '').replace(/^ord-/, '')) || 0;
    return bi - ai;
  });
}

function terminalPath(mentorId, eaId, terminalId) {
  const safe = (v) => encodeURIComponent(String(v || '').trim());
  return `${TERMINAL_ROOT}/${safe(mentorId)}/${safe(eaId)}/${safe(terminalId || 'default')}`;
}

export async function resolveEaContext(firebaseRead, mentorId, eaId) {
  const mid = String(mentorId || '').trim();
  const eid = String(eaId || '').trim();
  if (!mid || !eid) return { error: 'mentorId and eaId required' };

  const ws = (await firebaseRead(`lumo/store/workspaces/${mid}`)) || {};
  const eas = dbList(ws.eas);
  const ea = eas.find((row) => String(row?.id || '') === eid);
  if (!ea) return { error: 'EA not found for this mentor' };

  const licenses = dbList(ws.licenses).filter(
    (lic) =>
      lic &&
      lic.status !== 'deleted' &&
      (lic.status === 'active' || lic.status === 'assigned') &&
      String(lic.eaId || '') === eid,
  );

  return { mentorId: mid, eaId: eid, ea, licenses, ws };
}

export async function loadEaTerminal(firebaseRead, mentorId, eaId, terminalId) {
  const row = await firebaseRead(terminalPath(mentorId, eaId, terminalId));
  return row && typeof row === 'object' ? row : null;
}

function orderMatchesEa(order, eaId) {
  const tagged = String(order?.eaId || '').trim();
  if (!tagged) return true;
  return tagged === eaId;
}

function buildOrderPayload(order, fallbackComment) {
  const eaLabel = String(order.comment || fallbackComment || 'Lumo Edge')
    .replace(/\s*~LumoEdge.*$/i, '')
    .trim() || 'Lumo Edge';
  const comment = String(order.comment || '').includes('~LumoEdge')
    ? String(order.comment).slice(0, 31)
    : `${eaLabel} ~LumoEdge`.slice(0, 31);
  return {
    id: String(order.id),
    symbol: String(order.symbol || 'XAUUSD').toUpperCase(),
    side: String(order.side || 'buy') === 'sell' ? 'sell' : 'buy',
    volume: Math.max(0.01, Number(order.volume) || 0.01),
    stopLoss: Number(order.stopLoss) || 0,
    takeProfit: Number(order.takeProfit) || 0,
    comment,
    trades: Math.max(1, Math.min(50, Math.round(Number(order.trades) || 1))),
    eaId: String(order.eaId || ''),
    createdAt: String(order.createdAt || ''),
  };
}

/** Poll by mentor EA ID — all student MT5 terminals under this EA share the same inputs. */
export async function pollCopyOrderByEa(firebaseRead, firebaseWrite, input) {
  const mentorId = String(input.mentorId || '').trim();
  const eaId = String(input.eaId || input.copyEaId || '').trim();
  const terminalId = String(input.terminalId || 'default').trim() || 'default';
  if (!mentorId || !eaId) return { ok: false, error: 'mentorId and eaId required' };

  const ctx = await resolveEaContext(firebaseRead, mentorId, eaId);
  if (ctx.error) return { ok: false, error: ctx.error };

  let terminal = await loadEaTerminal(firebaseRead, mentorId, eaId, terminalId);
  if (!terminal) {
    terminal = {
      mentorId,
      eaId,
      terminalId,
      processedOrderIds: [],
      registeredAt: new Date().toISOString(),
    };
  }

  const orders = sortOrders(dbList(ctx.ws.orders)).filter((row) => orderMatchesEa(row, eaId));
  const processed = new Set(
    (Array.isArray(terminal.processedOrderIds) ? terminal.processedOrderIds : []).map(String),
  );
  const pending = orders.find((row) => row?.id && !processed.has(String(row.id))) || null;
  const order = pending ? buildOrderPayload(pending, ctx.ea?.name) : null;

  await firebaseWrite(terminalPath(mentorId, eaId, terminalId), {
    ...terminal,
    mentorId,
    eaId,
    terminalId,
    lastSeen: new Date().toISOString(),
    lastPollAt: new Date().toISOString(),
    licensedClients: ctx.licenses.length,
  });

  return {
    ok: true,
    pending: Boolean(order),
    order,
    licensedClients: ctx.licenses.length,
  };
}

export async function ackCopyOrderByEa(firebaseRead, firebaseWrite, input) {
  const mentorId = String(input.mentorId || '').trim();
  const eaId = String(input.eaId || input.copyEaId || '').trim();
  const terminalId = String(input.terminalId || 'default').trim() || 'default';
  const orderId = String(input.orderId || '').trim();
  if (!mentorId || !eaId || !orderId) {
    return { ok: false, error: 'mentorId, eaId, and orderId required' };
  }

  const ctx = await resolveEaContext(firebaseRead, mentorId, eaId);
  if (ctx.error) return { ok: false, error: ctx.error };

  const terminal =
    (await loadEaTerminal(firebaseRead, mentorId, eaId, terminalId)) || {
      mentorId,
      eaId,
      terminalId,
      processedOrderIds: [],
    };

  const processed = Array.isArray(terminal.processedOrderIds)
    ? terminal.processedOrderIds.map(String)
    : [];
  if (!processed.includes(orderId)) processed.push(orderId);

  const ok = await firebaseWrite(terminalPath(mentorId, eaId, terminalId), {
    ...terminal,
    processedOrderIds: processed.slice(-100),
    lastAckAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  });
  return ok ? { ok: true } : { ok: false, error: 'Could not save acknowledgement' };
}

export function formatPollText(result) {
  if (!result.ok) return `ERR\n${result.error || 'Unknown error'}`;
  if (!result.pending || !result.order) return 'OK\nNONE';
  const o = result.order;
  return [
    'OK',
    'ORDER',
    o.id,
    o.symbol,
    o.side,
    String(o.volume),
    String(o.stopLoss || 0),
    String(o.takeProfit || 0),
    o.comment,
    String(o.trades || 1),
  ].join('\n');
}

export async function pollCopyOrder(firebaseRead, firebaseWrite, input) {
  const mentorId = String(input.mentorId || '').trim();
  const eaId = String(input.eaId || input.copyEaId || '').trim();
  if (mentorId && eaId) {
    return pollCopyOrderByEa(firebaseRead, firebaseWrite, input);
  }
  return { ok: false, error: 'mentorId and eaId required' };
}

export async function ackCopyOrder(firebaseRead, firebaseWrite, input) {
  const mentorId = String(input.mentorId || '').trim();
  const eaId = String(input.eaId || input.copyEaId || '').trim();
  if (mentorId && eaId) {
    return ackCopyOrderByEa(firebaseRead, firebaseWrite, input);
  }
  return { ok: false, error: 'mentorId and eaId required' };
}

export async function registerTerminal(_firebaseRead, _firebaseWrite, input) {
  const mentorId = String(input.mentorId || '').trim();
  const eaId = String(input.eaId || '').trim();
  if (!mentorId || !eaId) return { ok: false, error: 'mentorId and eaId required' };
  return { ok: true, mentorId, eaId };
}
