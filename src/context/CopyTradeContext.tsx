import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CopyTradeStatus, type CopyTradePhase } from '../components/CopyTradeStatus';
import {
  executeCopyOrder,
  mentorIdForLicense,
  seedProcessedOrders,
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

export function CopyTradeProvider({
  email,
  licenseKey,
  eaName,
  isPaused,
  children,
}: {
  email?: string;
  licenseKey?: string;
  eaName: string;
  isPaused: boolean;
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

  const dismissPopup = useCallback(() => setPopupOpen(false), []);

  useEffect(() => {
    if (!email || !licenseKey || isPaused) {
      setEngineSignal('idle');
      setStatusLabel(mt5Linked ? 'Waiting for Signal' : 'Connect MT5');
      setStatusDetail(
        mt5Linked ? 'Listening for trade signals…' : 'Connect MetaTrader to receive trades.',
      );
      return;
    }

    const mentorId = mentorIdForLicense(licenseKey);
    if (!mentorId) return;

    let seeded = false;
    const handleOrders = (orders: Array<Record<string, unknown>>) => {
      if (!seeded) {
        seedProcessedOrders(
          mentorId,
          orders.map((o) => String(o.id || '')).filter(Boolean),
        );
        seeded = true;
        return;
      }

      const latest = orders[0];
      if (!latest?.id) return;

      const order: CopyOrderPayload = {
        id: String(latest.id),
        symbol: String(latest.symbol || 'XAUUSD'),
        side: String(latest.side || 'buy') === 'sell' ? 'sell' : 'buy',
        volume: Number(latest.volume) || 0.01,
        stopLoss: Number(latest.stopLoss) || 0,
        takeProfit: Number(latest.takeProfit) || 0,
        comment: String(latest.comment || ''),
        trades: Number(latest.trades) || 1,
      };

      const sideLabel = order.side === 'sell' ? 'SELL' : 'BUY';
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
          setStatusDetail('Listening for trade signals…');
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
            setStatusDetail('Listening for trade signals…');
          }, 3200);
          return;
        }

        setPopupPhase('failed');
        setPopupMessage(result.message);
        setPopupProgress(100);
        setStatusLabel('Execution Failed');
        setStatusDetail(result.message);
        setEngineSignal('idle');
      });
    };

    const unsub = firebaseWatchMentorOrders(mentorId, handleOrders);
    return () => unsub();
  }, [email, licenseKey, eaName, isPaused, mt5Linked]);

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
