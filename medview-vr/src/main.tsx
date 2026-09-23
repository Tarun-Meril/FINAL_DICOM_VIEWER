import React from 'react';
import { createRoot } from 'react-dom/client';
import './app/theme.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { logger } from './core/logger';

logger.setLevel(import.meta.env.DEV ? 'debug' : 'info');
logger.setConsoleMirror(import.meta.env.DEV);

window.addEventListener('error', (e) => logger.error('window', 'uncaught error', { message: e.message }));
window.addEventListener('unhandledrejection', (e) =>
  logger.error('window', 'unhandled rejection', { reason: String((e as PromiseRejectionEvent).reason) }));

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');
createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="MedView VR could not start.">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
