import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme } from './core/theme';
import { applyLocale } from './core/i18n';

// Paint the saved appearance before React mounts so there is no flash of the
// default theme. The store re-applies once the engine confirms the settings.
try {
  const cached = JSON.parse(localStorage.getItem('cf.appearance') ?? '{}');
  applyTheme(cached.theme ?? 'dark', cached.accent ?? '#6366F1');
  applyLocale(cached.language ?? 'en');
  document.documentElement.dataset.motion = cached.reduceMotion ? 'reduced' : 'full';
} catch {
  applyTheme('dark', '#6366F1');
  applyLocale('en');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
