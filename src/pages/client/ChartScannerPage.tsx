import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Bot,
  Camera,
  Minus,
  Plus,
  ScanSearch,
  TrendingDown,
  TrendingUp,
  Pencil,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TradeEnginePanel } from '../../components/TradeEnginePanel';
import {
  DAILY_SCAN_LIMIT,
  MIN_SCAN_CONFIDENCE,
  SCAN_RESET_EVENT,
  consumeScan,
  buildTpLadder,
  fileToScanDataUrl,
  formatScanTime,
  getScansLeft,
  loadScanHistory,
  pushScanHistory,
  runChartScan,
  scanResultStatus,
  scheduleSastMidnightReset,
  syncScanRemoteAdmin,
  type ScanHistoryItem,
  type TradeDirection,
} from '../../lib/chartScan';
import {
  createEngineSnapshot,
  runTradeEngine,
  type TradeEngineSnapshot,
} from '../../lib/tradeEngine';
import { RAZOR_MARKETS } from '../../lib/mt5Api';
import { ensureMt5Token } from '../../lib/mt5Session';
import { loadJSON } from '../../lib/storage';

type RevealPhase = 'idle' | 'scanning' | 'symbol' | 'direction' | 'accuracy';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MT5_KEY = 'ub-web/client-mt5-v1';

type ClientMt5Saved = {
  connected?: boolean;
  token?: string;
  broker?: string;
};

function loadClientMt5Broker(email: string | undefined): string {
  if (!email) return RAZOR_MARKETS.broker;
  const all = loadJSON<Record<string, ClientMt5Saved>>(MT5_KEY, {});
  return all[email.toLowerCase()]?.broker || RAZOR_MARKETS.broker;
}

export function ChartScannerPage() {
  const navigate = useNavigate();
  const { user, bot } = useApp();
  const eaName = bot.displayName || bot.name || 'Lumo Edge';
  const [scansLeft, setScansLeft] = useState(() => getScansLeft(user?.email));
  const [trades, setTrades] = useState(1);
  const [lotSize, setLotSize] = useState('0.01');
  const [autoOpen, setAutoOpen] = useState(true);
  const [phase, setPhase] = useState<RevealPhase>('idle');
  const [accuracy, setAccuracy] = useState(0);
  const [targetAccuracy, setTargetAccuracy] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<ScanHistoryItem | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>(() =>
    loadScanHistory(user?.email),
  );
  const [status, setStatus] = useState('');
  const [tradeStatus, setTradeStatus] = useState('');
  const [aiLive, setAiLive] = useState<boolean | null>(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [scanPreview, setScanPreview] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState('');
  const [engineOpen, setEngineOpen] = useState(false);
  const [engineSnap, setEngineSnap] = useState<TradeEngineSnapshot | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const engineItemRef = useRef<ScanHistoryItem | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const animRef = useRef<number | null>(null);
  const scanning = phase === 'scanning';

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/scan/status')
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setAiLive(Boolean(data?.configured));
      })
      .catch(() => {
        if (!cancelled) setAiLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const launchTradeEngine = async (
    item: ScanHistoryItem,
    startFromStep?: number,
  ) => {
    const token = await ensureMt5Token(user?.email);
    const broker = loadClientMt5Broker(user?.email);
    const payload = {
      ...item,
      symbol: (editSymbol || item.symbol || '').trim(),
    };
    engineItemRef.current = payload;
    setEngineOpen(true);
    setEngineRunning(true);
    setEngineSnap(createEngineSnapshot(payload, broker, autoOpen));
    setTradeStatus(
      autoOpen
        ? 'Trade engine running — auto execute when validations pass…'
        : 'Trade engine preview — enable Auto Trade to execute',
    );

    await runTradeEngine(
      {
        item: payload,
        token,
        broker,
        eaName,
        trades,
        lotSize,
        autoTrade: autoOpen,
        startFromStep,
      },
      (snap) => {
        setEngineSnap(snap);
        if (snap.complete || snap.failedStep != null) {
          setTradeStatus(snap.dashboard.tradeStatus);
        }
      },
    );
    setEngineRunning(false);
  };

  const retryFailedEngineStep = () => {
    const item = engineItemRef.current;
    const step = engineSnap?.failedStep;
    if (item == null || step == null) return;
    void launchTradeEngine(item, step);
  };

  const applyDailyResetAndSync = () => {
    setScansLeft(getScansLeft(user?.email));
    setHistory(loadScanHistory(user?.email));
  };

  useEffect(() => {
    void syncScanRemoteAdmin(user?.email).then(() => applyDailyResetAndSync());
    const onRemote = () => applyDailyResetAndSync();
    window.addEventListener(SCAN_RESET_EVENT, onRemote);
    const unschedule = scheduleSastMidnightReset(() => {
      applyDailyResetAndSync();
      setLimitMsg('');
    });
    const poll = window.setInterval(() => {
      void syncScanRemoteAdmin(user?.email).then(() => applyDailyResetAndSync());
    }, 45_000);
    return () => {
      window.removeEventListener(SCAN_RESET_EVENT, onRemote);
      unschedule();
      window.clearInterval(poll);
    };
  }, [user?.email]);

  // Animate accuracy 0 → target only once accuracy phase opens
  useEffect(() => {
    if (phase !== 'accuracy' || targetAccuracy == null) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const from = 0;
    const to = targetAccuracy;
    const duration = 900;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setAccuracy(Math.round(from + (to - from) * eased));
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
      }
    };
    setAccuracy(0);
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [phase, targetAccuracy]);

  const playReveal = async (item: ScanHistoryItem) => {
    setLastResult(item);
    setEditSymbol(String(item.symbol || '').toUpperCase());
    setPhase('symbol');
    setStatus(`Detected ${item.symbol || 'symbol'}…`);
    await wait(550);
    setPhase('direction');
    setStatus(
      item.direction === 'sell'
        ? `Direction: SELL ${item.symbol || ''}`
        : `Direction: BUY ${item.symbol || ''}`,
    );
    await wait(650);
    setPhase('accuracy');
    setTargetAccuracy(item.accuracy);
    setStatus('Calculating accuracy…');
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose a chart image');
      return;
    }
    if (scansLeft <= 0) {
      setLimitMsg(
        'Daily scan limit reached. Please wait for reset or contact your administrator.',
      );
      return;
    }
    setLimitMsg('');

    setPhase('scanning');
    setStatus('Scanning chart…');
    setLastResult(null);
    setTargetAccuracy(null);
    setAccuracy(0);

    try {
      const dataUrl = await fileToScanDataUrl(file);
      // Show the uploaded chart inside the radar while it scans
      setScanPreview(dataUrl);
      const result = await runChartScan(dataUrl);
      if (!result.ok) {
        throw new Error(result.error || 'Scan failed');
      }

      const left = consumeScan(user?.email);
      setScansLeft(left);

      const accuracyValue = Math.max(
        1,
        Math.min(99, Math.round(result.accuracy || 0)),
      );
      const direction: TradeDirection =
        result.direction === 'sell' ? 'sell' : 'buy';
      const item: ScanHistoryItem = {
        id: `scan-${Date.now()}`,
        imageDataUrl: dataUrl,
        accuracy: accuracyValue,
        symbol: result.symbol || 'XAUUSD',
        timeframe: result.timeframe,
        direction,
        entryPrice: result.entryPrice,
        stopLoss: result.stopLoss,
        summary: result.summary,
        createdAt: new Date().toISOString(),
      };
      const nextHistory = pushScanHistory(user?.email, item);
      setHistory(nextHistory);
      await playReveal(item);
      setStatus(
        result.demo
          ? 'Demo scan complete'
          : 'Scan complete — launching trade engine…',
      );
      await launchTradeEngine(item);
    } catch (e) {
      setPhase('idle');
      setStatus(e instanceof Error ? e.message : 'Scan failed');
      alert(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      // Radar returns to its normal circle after the scan
      setScanPreview('');
      if (cameraRef.current) cameraRef.current.value = '';
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  return (
    <div className="os-panel scan-shell scan-shell-premium">
      <div className="scan-page">
        <header className="scan-header">
          <button
            type="button"
            className="scan-x"
            aria-label="Close"
            onClick={() => navigate('/app')}
          >
            <X size={22} />
          </button>
          <h1 className="scan-title">
            <span>Chart</span> <span className="accent">Scanner</span>
          </h1>
          <div className="scan-ai">
            <span className="scan-ai-dot">
              <Bot size={16} />
            </span>
            <span>
              {aiLive == null ? 'Checking…' : aiLive ? 'AI Live' : 'Demo mode'}
            </span>
          </div>
        </header>

        <section className="scan-stage scan-stage-hero shape-hero" aria-label="Chart scanner">
          <div className="shape-hero-aura" aria-hidden />
          <div
            className={`scan-radar${scanning ? ' active' : ''}${
              scanning && scanPreview ? ' has-image' : ''
            }`}
            aria-hidden
          >
            {scanning && scanPreview ? (
              <>
                <img className="scan-radar-img" src={scanPreview} alt="" />
                <span className="scan-radar-grid" />
                <span className="scan-beam" />
              </>
            ) : null}
            <span className="scan-orbit scan-orbit-a" />
            <span className="scan-orbit scan-orbit-b" />
            <span className="scan-orbit scan-orbit-c" />
            <span className="scan-sweep" />
            <span className="scan-radar-core">
              <ScanSearch size={30} color="var(--electric)" />
            </span>
          </div>
          <p className="scan-upload-label">Upload your MT5 chart</p>
          <p className="muted scan-hero-sub">
            {aiLive
              ? 'AI reads the exact symbol & timeframe from your chart image.'
              : 'Demo picks a random symbol until CHART_SCAN_API_KEY is set on Vercel.'}
          </p>
          <div className="scan-actions shape-actions">
            <button
              type="button"
              className="scan-action shape-action-circle"
              disabled={scanning || scansLeft <= 0}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={20} />
              <span>Camera</span>
            </button>
            <button
              type="button"
              className="scan-action shape-action-capsule"
              disabled={scanning || scansLeft <= 0}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
          </div>
          <p className="muted scan-hint">
            Take a screenshot of your MT5 chart or upload one.
          </p>
          <div className="scan-count-pill">
            Scans left today{' '}
            <strong>
              {scansLeft}/{DAILY_SCAN_LIMIT}
            </strong>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void onPick(e.target.files?.[0] || null)}
          />
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPick(e.target.files?.[0] || null)}
          />
        </section>

        {scansLeft <= 0 ? (
          <div className="scan-limit-banner" role="status">
            Daily scan limit reached. Please wait for reset or contact your administrator.
          </div>
        ) : null}

        {limitMsg && scansLeft > 0 ? (
          <p className="muted scan-hint" style={{ marginTop: 0 }}>
            {limitMsg}
          </p>
        ) : null}

        {aiLive === false ? (
          <div className="scan-alert-card shape-polygon" role="status">
            <strong>Demo assistance only</strong>
            <div>
              OpenAI key is not on the live server yet. In Vercel → Settings →
              Environment Variables, add{' '}
              <code>CHART_SCAN_API_KEY</code> for{' '}
              <strong>Production</strong>, then Redeploy. Confirm at{' '}
              <code>/api/scan/status</code> shows{' '}
              <code>configured: true</code>.
            </div>
          </div>
        ) : null}

        <section className="scan-secondary shape-secondary" aria-label="Trade settings">
          <div className="scan-row shape-widget-row">
            <div className="scan-card scan-mini shape-island-squircle">
              <div className="muted scan-mini-label">Trades (Max 20)</div>
              <div className="scan-stepper">
                <button
                  type="button"
                  className="shape-step-round"
                  onClick={() => setTrades((n) => Math.max(1, n - 1))}
                  aria-label="Fewer trades"
                >
                  <Minus size={16} />
                </button>
                <strong>{trades}</strong>
                <button
                  type="button"
                  className="shape-step-round"
                  onClick={() => setTrades((n) => Math.min(20, n + 1))}
                  aria-label="More trades"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="scan-card scan-mini shape-island-pill">
              <div className="muted scan-mini-label">Lot Size</div>
              <input
                className="scan-lot"
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="scan-auto shape-open-strip">
            <div>
              <strong>Auto Trade</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                After scan, trade engine validates and sends to MT5 when confidence ≥
                {MIN_SCAN_CONFIDENCE}%. Comment:{' '}
                <span style={{ color: 'var(--text)' }}>{eaName} Lumo~edge</span>
              </div>
            </div>
            <button
              type="button"
              className={`scan-toggle${autoOpen ? ' on' : ''}`}
              onClick={() => setAutoOpen((v) => !v)}
              aria-pressed={autoOpen}
            >
              <span />
            </button>
          </div>
          {tradeStatus ? (
            <p className="muted scan-hint" style={{ marginTop: 0 }}>
              {tradeStatus}
            </p>
          ) : null}
        </section>

        {phase !== 'idle' || lastResult ? (
          <div className="scan-reveal shape-reveal">
            {phase === 'scanning' ? (
              <div className="scan-card scan-phase-card scanning shape-phase-orb">
                <div className="scan-phase-pulse" />
                <strong>Scanning chart…</strong>
                <p className="muted">Reading symbol, direction &amp; setup</p>
              </div>
            ) : null}

            {(phase === 'symbol' || phase === 'direction' || phase === 'accuracy') &&
            lastResult ? (
              <div className="scan-card scan-phase-card pop-in shape-phase-diagonal">
                <div className="muted scan-phase-label">
                  Symbol detected — tap to correct
                </div>
                <div className="scan-symbol-big scan-symbol-edit">
                  <input
                    value={editSymbol}
                    onChange={(e) => {
                      const v = e.target.value.toUpperCase().replace(/\s+/g, '');
                      setEditSymbol(v);
                      setLastResult((prev) =>
                        prev ? { ...prev, symbol: v } : prev,
                      );
                    }}
                    aria-label="Trading symbol"
                    spellCheck={false}
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                  <Pencil size={15} className="scan-symbol-pencil" aria-hidden />
                  {lastResult.timeframe ? (
                    <span className="scan-tf">{lastResult.timeframe}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(phase === 'direction' || phase === 'accuracy') && lastResult ? (
              <div
                className={`scan-card scan-phase-card pop-in direction shape-phase-hex ${
                  lastResult.direction === 'sell' ? 'sell' : 'buy'
                }`}
              >
                <div className="muted scan-phase-label">Trade direction</div>
                <div className="scan-direction-big">
                  {lastResult.direction === 'sell' ? (
                    <TrendingDown size={22} />
                  ) : (
                    <TrendingUp size={22} />
                  )}
                  <span>{(lastResult.direction || 'buy').toUpperCase()}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {trades} trade{trades === 1 ? '' : 's'} · lot {lotSize}
                  {autoOpen ? ' · auto trade on' : ' · preview only'}
                </div>
                {lastResult.entryPrice && lastResult.stopLoss ? (
                  <div className="scan-sltp">
                    <span className="scan-sltp-chip sl">
                      SL {lastResult.stopLoss}
                    </span>
                    {buildTpLadder(
                      Number(lastResult.entryPrice),
                      Number(lastResult.stopLoss),
                      lastResult.direction === 'sell' ? 'sell' : 'buy',
                      Math.max(1, Math.min(3, trades)),
                    ).map((tp, i, arr) => (
                      <span key={`tp-${i}`} className="scan-sltp-chip tp">
                        TP{arr.length > 1 ? i + 1 : ''} {tp}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    SL/TP unavailable — price scale not readable on this image
                  </div>
                )}
              </div>
            ) : null}

            {phase === 'accuracy' && lastResult ? (
              <div className="scan-card scan-phase-card pop-in accuracy-box shape-phase-feature">
                <div className="muted scan-phase-label">Accuracy</div>
                <div className="scan-accuracy">{accuracy}%</div>
                <div className="scan-accuracy-bar">
                  <div style={{ width: `${accuracy}%` }} />
                </div>
                {lastResult.summary ? (
                  <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                    {lastResult.summary}
                  </p>
                ) : null}
                <img
                  className="scan-preview"
                  src={lastResult.imageDataUrl}
                  alt="Scanned chart"
                />
              </div>
            ) : null}

            {status && phase !== 'idle' ? (
              <p className="muted scan-status-line">{status}</p>
            ) : null}
          </div>
        ) : null}

        {history.length > 0 ? (
          <div className="scan-history shape-history">
            <div className="scan-history-title">Scan history</div>
            <div className="scan-history-list">
              {history.map((h, index) => {
                const { time, date } = formatScanTime(h.createdAt);
                const symbol = (h.symbol || 'XAUUSD').toUpperCase();
                const signal = (h.direction || 'buy').toUpperCase();
                const expanded = expandedHistoryId === h.id;
                const status = scanResultStatus(h.accuracy);
                return (
                  <div
                    key={h.id}
                    className={`scan-history-row-wrap shape-history-item shape-history-item-${index % 3}`}
                  >
                    <button
                      type="button"
                      className={`scan-history-row${expanded ? ' open' : ''}`}
                      onClick={() =>
                        setExpandedHistoryId((id) => (id === h.id ? null : h.id))
                      }
                    >
                      <img className="scan-history-thumb" src={h.imageDataUrl} alt="" />
                      <span className="scan-h-col symbol">{symbol}</span>
                      <span className={`scan-h-col signal ${h.direction === 'sell' ? 'sell' : 'buy'}`}>
                        {signal}
                      </span>
                      <span className="scan-h-col conf">{h.accuracy}%</span>
                      <span className="scan-h-col time">{time}</span>
                      <span className="scan-h-col date">{date}</span>
                      <span className={`scan-h-col status status-${status.toLowerCase()}`}>
                        {status}
                      </span>
                      <span className="scan-h-expand" aria-hidden>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="scan-history-detail">
                        {h.summary ? <p>{h.summary}</p> : null}
                        <div className="scan-history-detail-meta">
                          {h.timeframe ? <span>TF {h.timeframe}</span> : null}
                          {h.entryPrice ? <span>Entry {h.entryPrice}</span> : null}
                          {h.stopLoss ? <span>SL {h.stopLoss}</span> : null}
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ marginTop: 8, width: '100%' }}
                          onClick={() => {
                            void playReveal(h).then(() => launchTradeEngine(h));
                          }}
                        >
                          View full analysis
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

      </div>

      {engineOpen && engineSnap ? (
        <TradeEnginePanel
          snapshot={engineSnap}
          running={engineRunning}
          onRetry={retryFailedEngineStep}
          onClose={() => setEngineOpen(false)}
        />
      ) : null}
    </div>
  );
}
