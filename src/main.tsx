import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AdminProvider } from './context/AdminContext';
import { AppProvider } from './context/AppContext';
import './styles/global.css';
import './styles/os-layouts.css';
import './styles/ui-polish.css';
import './styles/shape-language.css';
import './styles/os-system.css';

declare global {
  interface Window {
    __lumoMarkReady?: () => void;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root');
}

const root = createRoot(rootEl);

function markReady() {
  try {
    window.dispatchEvent(new Event('lumo-ready'));
    window.__lumoMarkReady?.();
  } catch {
    /* ignore */
  }
}

function mount() {
  // Hide boot splash the moment JS runs — before heavy React providers init
  markReady();
  root.render(
    <StrictMode>
      <BrowserRouter>
        <AppProvider>
          <AdminProvider>
            <App />
          </AdminProvider>
        </AppProvider>
      </BrowserRouter>
    </StrictMode>,
  );
  // Keep dismissing in case a resume path briefly re-showed the chip
  requestAnimationFrame(() => {
    markReady();
    requestAnimationFrame(markReady);
  });
  window.setTimeout(markReady, 40);
  window.setTimeout(markReady, 400);
}

mount();

// Safari bfcache / tab resume: remount if the tree was discarded
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  try {
    mount();
  } catch {
    location.reload();
  }
});
