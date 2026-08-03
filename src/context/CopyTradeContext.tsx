import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CopyTradeStatus, type CopyTradePhase } from '../components/CopyTradeStatus';
import {
  executeCopyOrder,
  isCopyOrderProcessed,
  markProcessed,
  mentorIdForLicense,
  rememberLicenseOwner,
  sortCopyOrders,
  type CopyOrderPayload,
} from '../lib/copyTrade';
import { getSastDayKey } from '../lib/chartScan';
import { firebaseWatchMentorOrders } from '../lib/firebaseDb';
import { getMt5Token } from '../lib/mt5Session';
import { loadJSON, saveJSON } from '../lib/storage';

export type EngineSignal = 'idle' | 'active';

export type CopyTradeEngineState = {
  mt5Linked: boolean;
  engineSignal: EngineSignal;
  statusLabel: string;
  statusDetail: string;
  sentToday: number;
  popupOpen: boolean;
  popupPhase: CopyTradePhase;
  popupMessage: string;
  popupProgress: number;
  dismissPopup: () => void;
};

const CopyTradeContext = createContext<CopyTradeEngineState | null>(null);

const SENT_TODAY_KEY = 'ub-web/copy-sent-today-v1';

type SentStore = { day: string; count: number };

function loadSentToday(): number {
  const store = loadJSON<SentStore>(SENT_TODAY_KEY, { day: '', count: 0 });
  const day = getSastDayKey();
  if (store.day !== day) return 0;
  return store.count;
}

function bumpSentToday(): number {
  const day = getSastDayKey();
  const store = loadJSON<SentStore>(SENT_TODAY_KEY, { day: '', count: 0 });
  const next = store.day === day ? store.count + 1 : 1;
  saveJSON(SENT_TODAY_KEY, { day, count: next });
  return next;
}

function orderForClient(row: Record<string, unknown>, clientEaId: string): boolean {
  const tagged = String(row.eaId || '').trim();
  if (!tagged || !clientEaId) return true;
  return tagged === clientEaId;
}

export function CopyTradeProvider({
  email,
  licenseKey,
  eaName,
  clientEaId,
  isPaused,
  ownerAdminId,
  children,
}: {
  email?: string;
  licenseKey?: string;
  eaName: string;
  clientEaId?: string;
  isPaused: boolean;
  ownerAdminId?: string;
  children: ReactNode;
}) {
  const mt5Linked = Boolean(getMt5Token(email));
  const [engineSignal, setEngineSignal] = useState<EngineSignal>('idle');
  const [statusLabel, setStatusLabel] = useState('Waiting for Signal');
  const [statusDetail, setStatusDetail] = useState('Listening for trade signals…');
  const [sentToday, setSentToday] = useState(loadSentToday);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupPhase, setPopupPhase] = useState<CopyTradePhase>('executing');
  const [popupMessage, setPopupMessage] = useState('');
  const [popupProgress, setPopupProgress] = useState(0);
  const lastHandledRef = useRef('');

  const dismissPopup = useCallback(() => setPopupOpen(false), []);

  useEffect(() => {
    if (licenseKey && ownerAdminId) {
      rememberLicenseOwner(licenseKey, ownerAdminId);
    }
  }, [licenseKey, ownerAdminId]);

  useEffect(() => {
    if (!email || !licenseKey || isPaused) {
      setEngineSignal('idle');
      setStatusLabel(mt5Linked ? 'Waiting for Signal' : 'Connect MT5 or VPS script');
      setStatusDetail(
        mt5Linked
          ? 'Listening for copy trades from your mentor EA…'
          : 'Connect MetaTrader in the app, or run LumoEdgeCopy.mq5 on VPS with your mentor EA ID.',
      );
      return;
    }

    const mentorId = ownerAdminId || mentorIdForLicense(licenseKey);
    if (!mentorId) {
      setStatusLabel('License Not Linked');
      setStatusDetail('Reconnect your license key to receive copy trades.');
      return;
    }

    rememberLicenseOwner(licenseKey, mentorId);
    let primed = false;

    const handleOrders = (rawOrders: Array<Record<string, unknown>>) => {
      const orders = sortCopyOrders(rawOrders).filter((row) =>
        orderForClient(row, clientEaId || ''),
      );
      const latest = orders[0];
      if (!latest?.id) return;

      const orderId = String(latest.id);

      if (!primed) {
        primed = true;
        for (const row of orders.slice(1)) {
          const id = String(row.id || '');
          if (id && !isCopyOrderProcessed(mentorId, id)) {
            markProcessed(mentorId, id);
          }
        }
      }

      if (orderId === lastHandledRef.current) return;
      if (isCopyOrderProcessed(mentorId, orderId)) return;

      const order: CopyOrderPayload = {
        id: orderId,
        eaId: String(latest.eaId || ''),
        symbol: String(latest.symbol || 'XAUUSD'),
        side: String(latest.side || 'buy') === 'sell' ? 'sell' : 'buy',
        volume: Number(latest.volume) || 0.01,
        stopLoss: Number(latest.stopLoss) || 0,
        takeProfit: Number(latest.takeProfit) || 0,
        comment: String(latest.comment || ''),
        trades: Number(latest.trades) || 1,
        createdAt: String(latest.createdAt || ''),
      };

      lastHandledRef.current = orderId;
      const sideLabel = order.side === 'sell' ? 'SELL' : 'BUY';

      if (!mt5Linked) {
        setEngineSignal('active');
        setStatusLabel('Signal Received');
        setStatusDetail(
          `${sideLabel} ${order.symbol} queued — open MT5 in the app or use LumoEdgeCopy.mq5 on VPS.`,
        );
        markProcessed(mentorId, orderId);
        window.setTimeout(() => {
          setEngineSignal('idle');
          setStatusLabel('Waiting for Signal');
          setStatusDetail('Connect MetaTrader or VPS script to execute copy trades.');
        }, 5000);
        return;
      }

      setEngineSignal('active');
      setStatusLabel('Executing Trade');
      setStatusDetail(`Sending ${sideLabel} ${order.symbol} to MT5…`);
      setPopupOpen(true);
      setPopupPhase('executing');
      setPopupMessage(`Executing ${sideLabel} ${order.symbol}`);
      setPopupProgress(35);

      void executeCopyOrder({
        email,
        eaName,
        order,
        mentorId,
      }).then((result) => {
        if (result.message === 'Already copied') {
          setPopupOpen(false);
          setEngineSignal('idle');
          setStatusLabel('Waiting for Signal');
          setStatusDetail('Listening for copy trades from your mentor EA…');
          return;
        }

        if (result.ok) {
          const count = bumpSentToday();
          setSentToday(count);
          setPopupPhase('success');
          setPopupMessage(result.message);
          setPopupProgress(100);
          setStatusLabel('Trade Sent Successfully');
          setStatusDetail(result.message);
          window.setTimeout(() => {
            setEngineSignal('idle');
            setStatusLabel('Waiting for Signal');
            setStatusDetail('Listening for copy trades from your mentor EA…');
          }, 3200);
          return;
        }

        lastHandledRef.current = '';
        setPopupPhase('failed');
        setPopupMessage(result.message);
        setPopupProgress(100);
        setStatusLabel('Execution Failed');
        setStatusDetail(result.message);
        setEngineSignal('idle');
      });
    };

    setStatusLabel(mt5Linked ? 'Waiting for Signal' : 'Connect MT5 or VPS');
    setStatusDetail(
      mt5Linked
        ? 'Listening for copy trades from your mentor EA…'
        : 'Use LumoEdgeCopy.mq5 on VPS with mentor EA ID + Mentor ID (no license key needed).',
    );

    const unsub = firebaseWatchMentorOrders(mentorId, handleOrders);
    return () => unsub();
  }, [email, licenseKey, eaName, clientEaId, isPaused, ownerAdminId, mt5Linked]);

  const value = useMemo<CopyTradeEngineState>(
    () => ({
      mt5Linked,
      engineSignal,
      statusLabel,
      statusDetail,
      sentToday,
      popupOpen,
      popupPhase,
      popupMessage,
      popupProgress,
      dismissPopup,
    }),
    [
      mt5Linked,
      engineSignal,
      statusLabel,
      statusDetail,
      sentToday,
      popupOpen,
      popupPhase,
      popupMessage,
      popupProgress,
      dismissPopup,
    ],
  );

  return (
    <CopyTradeContext.Provider value={value}>
      {children}
      <CopyTradeStatus
        open={popupOpen}
        phase={popupPhase}
        message={popupMessage}
        progress={popupProgress}
        onClose={dismissPopup}
      />
    </CopyTradeContext.Provider>
  );
}

export function useCopyTradeEngine() {
  const ctx = useContext(CopyTradeContext);
  if (!ctx) {
    throw new Error('useCopyTradeEngine must be used within CopyTradeProvider');
  }
  return ctx;
}
