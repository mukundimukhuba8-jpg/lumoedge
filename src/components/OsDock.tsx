import { Home, Monitor, ScanSearch } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Persistent OS bottom navigation — never remounts with page content. */
export function OsDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const home = pathname === '/app' || pathname === '/app/';
  const scanner = pathname.startsWith('/app/scanner');
  const mt5 = pathname.startsWith('/app/metatrader');

  return (
    <nav className="lay-dock os-dock os-dock-triple os-dock-fixed" aria-label="Primary">
      <button
        type="button"
        className={`lay-dock-item os-ctrl${home ? ' active' : ''}`}
        onClick={() => navigate('/app')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>
      <button
        type="button"
        className={`lay-dock-item os-ctrl${scanner ? ' active' : ''}`}
        onClick={() => navigate('/app/scanner')}
      >
        <ScanSearch size={20} />
        <span>Scanner</span>
      </button>
      <button
        type="button"
        className={`lay-dock-item os-ctrl${mt5 ? ' active' : ''}`}
        onClick={() => navigate('/app/metatrader')}
      >
        <Monitor size={20} />
        <span>MetaTrader</span>
      </button>
    </nav>
  );
}
