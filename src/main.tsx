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

function rootLooksDead(): boolean {
  const el = document.getElementById('root');
  if (!el) return true;
  if (el.childElementCount === 0) return true;
  const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (text.length >= 8) return false;
  return el.querySelectorAll('button, a, input, textarea, select').length === 0;
}

let resumeRemounting = false;

function recoverFromBlank(reason: string) {
  if (resumeRemounting) return;
  if (document.visibilityState === 'hidden') return;
  if (!rootLooksDead()) return;
  resumeRemounting = true;
  try {
    // Prefer remount first — cheaper than full reload
    mount();
    window.setTimeout(() => {
      if (rootLooksDead()) {
        location.reload();
        return;
      }
      resumeRemounting = false;
      markReady();
    }, 900);
  } catch {
    location.reload();
  }
  void reason;
}

// Safari bfcache / tab resume: remount if the tree was discarded
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    try {
      mount();
    } catch {
      location.reload();
    }
    return;
  }
  window.setTimeout(() => recoverFromBlank('pageshow'), 500);
});

// Switching to Cursor / another app then back often freezes iOS WebKit black
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  window.setTimeout(() => recoverFromBlank('visibility'), 700);
});

window.addEventListener('focus', () => {
  window.setTimeout(() => recoverFromBlank('focus'), 900);
});
