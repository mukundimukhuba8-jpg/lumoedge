import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Signal } from 'lucide-react';
import { CopyTradeEnginePanel } from '../../components/CopyTradeEnginePanel';
import { useApp } from '../../context/AppContext';
import {
  accentHex,
  hexToRgb,
  loadInterfacePrefs,
  subscribeInterfacePrefs,
} from '../../lib/interfaceStyle';

const ALL_SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'USDCAD',
  'NZDUSD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'XAGUSD',
  'NAS100',
  'US30',
  'BTCUSD',
];

const SYMBOL_META: Record<string, { category: string; name: string }> = {
  XAUUSD: { category: 'METALS', name: 'Gold / USD' },
  XAGUSD: { category: 'METALS', name: 'Silver / USD' },
  EURUSD: { category: 'FOREX', name: 'Euro / USD' },
  GBPUSD: { category: 'FOREX', name: 'Pound / USD' },
  USDJPY: { category: 'FOREX', name: 'USD / Yen' },
  USDCHF: { category: 'FOREX', name: 'USD / Franc' },
  AUDUSD: { category: 'FOREX', name: 'Aussie / USD' },
  USDCAD: { category: 'FOREX', name: 'USD / CAD' },
  NZDUSD: { category: 'FOREX', name: 'Kiwi / USD' },
  EURGBP: { category: 'FOREX', name: 'Euro / Pound' },
  EURJPY: { category: 'FOREX', name: 'Euro / Yen' },
  GBPJPY: { category: 'FOREX', name: 'Pound / Yen' },
  NAS100: { category: 'INDICES', name: 'Nasdaq 100' },
  US30: { category: 'INDICES', name: 'Dow Jones 30' },
  BTCUSD: { category: 'CRYPTO', name: 'Bitcoin / USD' },
};

type Tab = 'allowed' | 'selected';

export function SymbolsPage() {
  const navigate = useNavigate();
  const { bot, setSymbols, isPaused } = useApp();
  const eaTitle = bot.displayName || bot.name || 'Lumo Edge';
  const [tab, setTab] = useState<Tab>('allowed');
  const [localSymbols, setLocalSymbols] = useState(bot.symbols);
  const [prefs, setPrefs] = useState(() => loadInterfacePrefs());
  const accent = accentHex(prefs.accent);
  const accentRgb = hexToRgb(accent);

  useEffect(() => subscribeInterfacePrefs(() => setPrefs(loadInterfacePrefs())), []);
  useEffect(() => setLocalSymbols(bot.symbols), [bot.symbols]);

  const visibleSymbols = useMemo(
    () => (tab === 'selected' ? localSymbols : ALL_SYMBOLS),
    [tab, localSymbols],
  );

  const toggleSymbol = (symbol: string) => {
    setLocalSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  };

  const saveSymbols = () => {
    if (!localSymbols.length) return;
    setSymbols(localSymbols);
  };

  return (
    <div className="os-panel symbols-shell">
      <div className="page symbols-page cyber-page">
        <header className="symbols-header">
          <button
            type="button"
            className="symbols-back"
            aria-label="Back"
            onClick={() => navigate('/app')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="symbols-title-wrap">
            <Signal size={16} className="symbols-title-ico" />
            <h1 className="symbols-title">{eaTitle}</h1>
          </div>
          <span className="symbols-header-spacer" aria-hidden />
        </header>

        <CopyTradeEnginePanel eaTitle={eaTitle} isPaused={isPaused} />

        <div className="symbols-tabs" role="tablist" aria-label="Symbol views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'allowed'}
            className={`symbols-tab${tab === 'allowed' ? ' active' : ''}`}
            onClick={() => setTab('allowed')}
          >
            Allowed Symbols
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'selected'}
            className={`symbols-tab${tab === 'selected' ? ' active' : ''}`}
            onClick={() => setTab('selected')}
          >
            Selected Symbols
          </button>
        </div>

        <div className="symbols-grid">
          {visibleSymbols.map((symbol) => {
            const meta = SYMBOL_META[symbol] || { category: 'MARKET', name: symbol };
            const selected = localSymbols.includes(symbol);
            return (
              <button
                key={symbol}
                type="button"
                className={`symbols-card${selected ? ' selected' : ''}`}
                style={{
                  borderColor: selected
                    ? `rgba(${accentRgb},0.55)`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: selected
                    ? `0 0 0 1px rgba(${accentRgb},0.12), 0 0 18px rgba(${accentRgb},0.18)`
                    : undefined,
                }}
                onClick={() => toggleSymbol(symbol)}
              >
                <span className="symbols-card-cat">{meta.category}</span>
                <strong className="symbols-card-sym">{symbol}</strong>
                <span className="symbols-card-name">{meta.name}</span>
              </button>
            );
          })}
        </div>

        {tab === 'allowed' ? (
          <button
            type="button"
            className="btn btn-blue symbols-save"
            disabled={!localSymbols.length}
            onClick={saveSymbols}
          >
            Save {localSymbols.length} symbol{localSymbols.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
