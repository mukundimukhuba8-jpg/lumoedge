import type { ScanHistoryItem, TradeDirection } from './chartScan';
import { MIN_SCAN_CONFIDENCE, buildTpLadder } from './chartScan';
import {
  buildTradeComment,
  checkConnect,
  fetchBrokerSymbols,
  orderSend,
} from './mt5Api';
import { resolveBrokerSymbol } from './symbolVerify';
import { notifyMentorTelegramTrade } from './telegramNotify';

export const TRADE_ENGINE_STEPS = [
  'AI Analysis Complete',
  'Validating Signal',
  'Verifying Symbol',
  'Checking Market Status',
  'Calculating Entry',
  'Calculating Stop Loss',
  'Calculating Take Profit',
  'Connecting to MT5',
  'Sending Trade',
  'Waiting for Broker Confirmation',
  'Trade Successfully Executed',
] as const;

export type EngineStepStatus = 'pending' | 'active' | 'done' | 'failed';

export type TradeEngineStep = {
  label: string;
  status: EngineStepStatus;
  error?: string;
};

export type TradeEngineDashboard = {
  symbol: string;
  direction: string;
  confidence: number;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  mt5Status: string;
  broker: string;
  tradeStatus: string;
  executionMs: number;
};

export type TradeEngineSnapshot = {
  steps: TradeEngineStep[];
  progressPct: number;
  etaSec: number;
  dashboard: TradeEngineDashboard;
  failedStep: number | null;
  complete: boolean;
  autoTrade: boolean;
};

export type TradeEngineInput = {
  item: ScanHistoryItem;
  token: string;
  broker: string;
  eaName: string;
  trades: number;
  lotSize: string;
  autoTrade: boolean;
  /** Mentor owner id (optional metadata) */
  mentorId?: string;
  /** Client license key — Telegram alerts only for Super Admin allowlisted keys */
  licenseKey?: string;
  startFromStep?: number;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function initialSteps(): TradeEngineStep[] {
  return TRADE_ENGINE_STEPS.map((label) => ({ label, status: 'pending' as const }));
}

function pct(activeIndex: number, total: number) {
  return Math.round(((activeIndex + 1) / total) * 100);
}

export function createEngineSnapshot(
  item: ScanHistoryItem,
  broker: string,
  autoTrade: boolean,
): TradeEngineSnapshot {
  const dir = (item.direction || 'buy').toUpperCase();
  const tps = buildTpLadder(
    Number(item.entryPrice) || 0,
    Number(item.stopLoss) || 0,
    item.direction === 'sell' ? 'sell' : 'buy',
    1,
  );
  return {
    steps: initialSteps(),
    progressPct: 0,
    etaSec: TRADE_ENGINE_STEPS.length * 2,
    dashboard: {
      symbol: String(item.symbol || '—').toUpperCase(),
      direction: dir,
      confidence: item.accuracy,
      entry: item.entryPrice ? String(item.entryPrice) : '—',
      stopLoss: item.stopLoss ? String(item.stopLoss) : '—',
      takeProfit: tps[0] ? String(tps[0]) : '—',
      mt5Status: 'Pending',
      broker: broker || '—',
      tradeStatus: autoTrade ? 'Preparing' : 'Preview only',
      executionMs: 0,
    },
    failedStep: null,
    complete: false,
    autoTrade,
  };
}

export async function runTradeEngine(
  input: TradeEngineInput,
  onUpdate: (snap: TradeEngineSnapshot) => void,
): Promise<TradeEngineSnapshot> {
  const startAt = performance.now();
  const startStep = input.startFromStep ?? 0;
  let snap = createEngineSnapshot(input.item, input.broker, input.autoTrade);
  snap.steps = snap.steps.map((s, i) =>
    i < startStep ? { ...s, status: 'done' } : s,
  );

  const publish = (patch: Partial<TradeEngineSnapshot>) => {
    snap = { ...snap, ...patch };
    onUpdate(snap);
  };

  const setStep = (index: number, status: EngineStepStatus, error?: string) => {
    const steps = snap.steps.map((s, i) => {
      if (i < index) return { ...s, status: 'done' as const, error: undefined };
      if (i === index) return { ...s, status, error };
      if (i > index && status !== 'done') return { ...s, status: 'pending' as const, error: undefined };
      return s;
    });
    const elapsed = Math.round((performance.now() - startAt) / 1000);
    publish({
      steps,
      progressPct: pct(index, TRADE_ENGINE_STEPS.length),
      etaSec: Math.max(0, (TRADE_ENGINE_STEPS.length - index - 1) * 2),
      dashboard: {
        ...snap.dashboard,
        executionMs: elapsed * 1000,
      },
      failedStep: status === 'failed' ? index : null,
    });
  };

  const fail = (index: number, message: string) => {
    setStep(index, 'failed', message);
    publish({
      dashboard: {
        ...snap.dashboard,
        tradeStatus: 'Failed',
        mt5Status: message,
      },
    });
    return snap;
  };

  try {
    // 0 — AI Analysis Complete
    setStep(0, 'active');
    await wait(400);
    setStep(0, 'done');

    // 1 — Validating Signal
    setStep(1, 'active');
    await wait(350);
    if (input.item.accuracy < MIN_SCAN_CONFIDENCE) {
      return fail(
        1,
        `Confidence ${input.item.accuracy}% is below minimum ${MIN_SCAN_CONFIDENCE}%. Trade rejected.`,
      );
    }
    setStep(1, 'done');

    // 2 — Verifying Symbol
    setStep(2, 'active');
    let resolvedSymbol = String(input.item.symbol || '').trim();
    if (!input.token) {
      if (input.autoTrade) {
        return fail(2, 'Connect MetaTrader first to verify symbol and execute trades.');
      }
      publish({
        dashboard: {
          ...snap.dashboard,
          symbol: resolvedSymbol.toUpperCase() || '—',
          tradeStatus: 'Preview — connect MT5 to verify symbol',
          mt5Status: 'Not connected',
        },
      });
    } else {
      try {
        const symbols = await fetchBrokerSymbols(input.token);
        const match = resolveBrokerSymbol(resolvedSymbol, symbols);
        if (!match.symbol) {
          return fail(2, match.message);
        }
        resolvedSymbol = match.symbol;
        publish({
          dashboard: {
            ...snap.dashboard,
            symbol: resolvedSymbol.toUpperCase(),
            tradeStatus: match.message,
          },
        });
      } catch (e) {
        return fail(
          2,
          e instanceof Error ? e.message : 'Could not verify symbol on broker.',
        );
      }
    }
    await wait(300);
    setStep(2, 'done');

    // 3 — Checking Market Status
    setStep(3, 'active');
    if (!input.token) {
      if (input.autoTrade) {
        return fail(3, 'MT5 not connected — open MetaTrader and connect your account.');
      }
      publish({
        dashboard: {
          ...snap.dashboard,
          mt5Status: 'Not connected',
          tradeStatus: 'Preview mode — validations only',
        },
      });
      await wait(300);
      setStep(3, 'done');
    } else {
    const alive = await checkConnect(input.token).catch(() => false);
    if (!alive) {
      return fail(3, 'MT5 session expired — reconnect MetaTrader.');
    }
    publish({ dashboard: { ...snap.dashboard, mt5Status: 'Connected' } });
    await wait(300);
    setStep(3, 'done');
    }

    const direction: TradeDirection =
      input.item.direction === 'sell' ? 'sell' : 'buy';
    const entry = Number(input.item.entryPrice) || 0;
    const stopLoss = Number(input.item.stopLoss) || 0;
    const count = Math.max(1, Math.min(20, Math.round(input.trades) || 1));
    const volume = Math.max(0.01, Number(input.lotSize) || 0.01);
    const tps = buildTpLadder(entry, stopLoss, direction, count);

    // 4-6 — Calculations
    for (const [idx, val, key] of [
      [4, entry || '—', 'entry'],
      [5, stopLoss || '—', 'stopLoss'],
      [6, tps[0] || '—', 'takeProfit'],
    ] as const) {
      setStep(idx, 'active');
      await wait(280);
      publish({
        dashboard: {
          ...snap.dashboard,
          [key]: String(val),
        },
      });
      setStep(idx, 'done');
    }

    if (!input.autoTrade) {
      publish({
        complete: true,
        dashboard: {
          ...snap.dashboard,
          tradeStatus: 'Auto Trade off — enable to execute',
          mt5Status: 'Ready',
        },
        progressPct: 100,
        etaSec: 0,
      });
      return snap;
    }

    // Auto Trade started — Telegram only for Super Admin allowlisted license keys
    notifyMentorTelegramTrade({
      licenseKey: String(input.licenseKey || ''),
      mentorId: String(input.mentorId || ''),
      symbol: resolvedSymbol,
      side: direction,
      entry: entry || undefined,
      stopLoss: stopLoss || undefined,
      takeProfit: tps[0] || undefined,
      volume,
      trades: count,
      eaName: input.eaName,
      accuracy: input.item.accuracy,
      source: 'Chart Scanner Auto Trade',
    });

    // 7 — Connecting to MT5
    setStep(7, 'active');
    await wait(350);
    setStep(7, 'done');

    // 8 — Sending Trade
    setStep(8, 'active');
    publish({ dashboard: { ...snap.dashboard, tradeStatus: 'Sending…' } });
    const operation = direction === 'sell' ? 'Sell' : 'Buy';
    const comment = buildTradeComment(input.eaName);
    let ok = 0;
    let lastErr = '';
    for (let i = 0; i < count; i += 1) {
      let sent = false;
      for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
        try {
          if (attempt > 0) await wait(400);
          await orderSend({
            id: input.token,
            symbol: resolvedSymbol,
            operation,
            volume,
            comment,
            slippage: 10000,
            stopLoss: stopLoss || undefined,
            takeProfit: tps[i] || undefined,
          });
          ok += 1;
          sent = true;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : 'OrderSend failed';
        }
      }
      // Keep sending remaining ladder trades even if one leg fails
      if (i < count - 1) await wait(250);
    }
    if (ok === 0) {
      return fail(8, lastErr || 'Broker rejected the order.');
    }
    setStep(8, 'done');
    if (ok < count) {
      publish({
        dashboard: {
          ...snap.dashboard,
          tradeStatus: `Opened ${ok}/${count} — retry failed legs if needed`,
          mt5Status: lastErr || 'Partial fill',
        },
      });
    }

    // 9 — Waiting for Broker Confirmation
    setStep(9, 'active');
    publish({ dashboard: { ...snap.dashboard, tradeStatus: 'Awaiting broker…' } });
    await wait(600);
    setStep(9, 'done');

    // 10 — Success
    setStep(10, 'active');
    await wait(400);
    setStep(10, 'done');
    publish({
      complete: true,
      progressPct: 100,
      etaSec: 0,
      dashboard: {
        ...snap.dashboard,
        tradeStatus: `Executed ${ok}/${count} ${operation} ${resolvedSymbol}`,
        mt5Status: 'Confirmed',
        executionMs: Math.round(performance.now() - startAt),
      },
    });
    return snap;
  } catch (e) {
    const idx = snap.failedStep ?? 0;
    return fail(idx, e instanceof Error ? e.message : 'Trade engine error');
  }
}
