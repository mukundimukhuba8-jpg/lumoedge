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

createRoot(document.getElementById('root')!).render(
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
