import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Camera,
  Home,
  Minus,
  Monitor,
  Plus,
  ScanSearch,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  DAILY_SCAN_LIMIT,
  consumeScan,
  fileToScanDataUrl,
  getScansLeft,
  loadScanHistory,
  pushScanHistory,
  runChartScan,
  type ScanHistoryItem,
  type TradeDirection,
} from '../../lib/chartScan';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
} from '../../lib/interfaceStyle';

type RevealPhase = 'idle' | 'scanning' | 'symbol' | 'direction' | 'accuracy';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ChartScannerPage() {
  const navigate = useNavigate();
  const { user } = useApp();
  const prefs = useMemo(() => loadInterfacePrefs(), []);
  const accent = accentHex(prefs.accent);
  const accentRgb = hexToRgb(accent);
  const [scansLeft, setScansLeft] = useState(() => getScansLeft(user?.email));
  const [trades, setTrades] = useState(9);
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
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const animRef = useRef<number | null>(null);
  const scanning = phase === 'scanning';

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--electric', accent);
    root.style.setProperty('--accent-rgb', accentRgb);
    return () => {
      root.style.setProperty('--electric', '#3b82f6');
      root.style.removeProperty('--accent-rgb');
    };
  }, [accent, accentRgb]);

  useEffect(() => {
    setScansLeft(getScansLeft(user?.email));
    setHistory(loadScanHistory(user?.email));
  }, [user?.email]);

  // Animate accuracy 0 → target only once accuracy phase opens
  useEffect(() => {
    if (phase !== 'accuracy' || targetAccuracy == null) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = performance.now();
    const from = 0;
    const to = targetAccuracy;
    const duration = 1800;

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
    setPhase('symbol');
    setStatus(`Detected ${item.symbol || 'symbol'}…`);
    await wait(1100);
    setPhase('direction');
    setStatus(
      item.direction === 'sell'
        ? `Direction: SELL ${item.symbol || ''}`
        : `Direction: BUY ${item.symbol || ''}`,
    );
    await wait(1200);
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
      alert('No scans left today. Come back tomorrow.');
      return;
    }

    setPhase('scanning');
    setStatus('Scanning chart…');
    setLastResult(null);
    setTargetAccuracy(null);
    setAccuracy(0);

    try {
      const dataUrl = await fileToScanDataUrl(file);
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
        summary: result.summary,
        createdAt: new Date().toISOString(),
      };
      const nextHistory = pushScanHistory(user?.email, item);
      setHistory(nextHistory);
      await playReveal(item);
      setStatus(
        result.demo
          ? 'Demo scan complete'
          : 'Scan complete',
      );
    } catch (e) {
      setPhase('idle');
      setStatus(e instanceof Error ? e.message : 'Scan failed');
      alert(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      if (cameraRef.current) cameraRef.current.value = '';
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  return (
    <div className="app-shell scan-shell">
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
            <span>AI Active</span>
          </div>
        </header>

        <div className="scan-card scan-count">
          Scans left today:{' '}
          <strong>
            {scansLeft}/{DAILY_SCAN_LIMIT}
          </strong>
        </div>

        <div className="scan-card scan-info">
          <Sparkles size={18} color="var(--electric)" />
          <span>AI auto-detects symbol &amp; timeframe directly from your chart image.</span>
        </div>

        <div className="scan-row">
          <div className="scan-card scan-mini">
            <div className="muted scan-mini-label">Trades (Max 20)</div>
            <div className="scan-stepper">
              <button
                type="button"
                onClick={() => setTrades((n) => Math.max(1, n - 1))}
                aria-label="Fewer trades"
              >
                <Minus size={16} />
              </button>
              <strong>{trades}</strong>
              <button
                type="button"
                onClick={() => setTrades((n) => Math.min(20, n + 1))}
                aria-label="More trades"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="scan-card scan-mini">
            <div className="muted scan-mini-label">Lot Size</div>
            <input
              className="scan-lot"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="scan-card scan-auto">
          <div>
            <strong>Auto-Open Trades</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Trades fire automatically after scan.
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

        <div className="scan-stage">
          <div className={`scan-radar${scanning ? ' active' : ''}`} aria-hidden>
            <span className="scan-orbit scan-orbit-a" />
            <span className="scan-orbit scan-orbit-b" />
            <span className="scan-orbit scan-orbit-c" />
            <span className="scan-sweep" />
            <span className="scan-radar-core">
              <ScanSearch size={26} color="var(--electric)" />
            </span>
          </div>
          <p className="scan-upload-label">Upload your MT5 chart</p>
          <div className="scan-actions">
            <button
              type="button"
              className="scan-action"
              disabled={scanning || scansLeft <= 0}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={18} />
              Camera
            </button>
            <button
              type="button"
              className="scan-action"
              disabled={scanning || scansLeft <= 0}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload size={18} />
              Upload
            </button>
          </div>
          <p className="muted scan-hint">
            Take a screenshot of your MT5 chart or upload one.
          </p>
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
        </div>

        {phase !== 'idle' || lastResult ? (
          <div className="scan-reveal">
            {phase === 'scanning' ? (
              <div className="scan-card scan-phase-card scanning">
                <div className="scan-phase-pulse" />
                <strong>Scanning chart…</strong>
                <p className="muted">Reading symbol, direction &amp; setup</p>
              </div>
            ) : null}

            {(phase === 'symbol' || phase === 'direction' || phase === 'accuracy') &&
            lastResult ? (
              <div className="scan-card scan-phase-card pop-in">
                <div className="muted scan-phase-label">Symbol detected</div>
                <div className="scan-symbol-big">
                  {lastResult.symbol}
                  {lastResult.timeframe ? (
                    <span className="scan-tf">{lastResult.timeframe}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(phase === 'direction' || phase === 'accuracy') && lastResult ? (
              <div
                className={`scan-card scan-phase-card pop-in direction ${
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
                  {autoOpen ? ' · auto-open on' : ''}
                </div>
              </div>
            ) : null}

            {phase === 'accuracy' && lastResult ? (
              <div className="scan-card scan-phase-card pop-in accuracy-box">
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
          <div className="scan-history">
            <div className="scan-history-title">Scan history</div>
            <div className="scan-history-grid">
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="scan-history-item"
                  onClick={() => {
                    void playReveal(h);
                  }}
                >
                  <img src={h.imageDataUrl} alt="" />
                  <span>
                    {(h.direction || 'buy').toUpperCase().slice(0, 1)} · {h.accuracy}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="mt5-fab"
          aria-label="AI assistant"
          onClick={() =>
            alert('Chart Scanner AI is active. Upload an MT5 chart screenshot to scan.')
          }
        >
          <Bot size={22} color="#061018" />
        </button>
      </div>

      <nav className="lay-dock" aria-label="Main">
        <button type="button" className="lay-dock-item" onClick={() => navigate('/app')}>
          <span className="lay-dock-ico">
            <Home size={20} />
          </span>
          <span>Home</span>
        </button>
        <button type="button" className="lay-dock-item active">
          <span className="lay-dock-ico">
            <ScanSearch size={20} />
          </span>
          <span>Scanner</span>
        </button>
        <button
          type="button"
          className="lay-dock-item"
          onClick={() => navigate('/app/metatrader')}
        >
          <span className="lay-dock-ico">
            <Monitor size={20} />
          </span>
          <span>MetaTrader</span>
        </button>
      </nav>

    </div>
  );
}
