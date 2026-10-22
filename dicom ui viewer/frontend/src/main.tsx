import './vtkPolyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MerilView] React ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#070708',
          color: '#e5e5e5', fontFamily: 'monospace', padding: '2rem', gap: '1rem'
        }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', color: '#f87171', fontWeight: 'bold' }}>
            MerilView — Render Error
          </div>
          <div style={{
            background: '#131317', border: '1px solid #3f3f46', borderRadius: '8px',
            padding: '1rem', maxWidth: '700px', width: '100%', fontSize: '0.75rem',
            color: '#a3e635', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem', padding: '0.5rem 1.5rem', background: '#4f46e5',
              color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function isStandaloneVRRoute(): boolean {
  const pathname = window.location.pathname;
  return pathname === '/vr' || pathname.startsWith('/vr/') || pathname.startsWith('/vr?');
}

function isStandaloneMPRRoute(): boolean {
  const pathname = window.location.pathname;
  return pathname === '/mpr' || pathname.startsWith('/mpr/') || pathname.startsWith('/mpr?');
}

let appRoot: ReactDOM.Root | null = (window as any).__merilview_react_root || null;

function renderApp(node: React.ReactNode) {
  const container = document.getElementById('root')!;
  if (!appRoot) {
    appRoot = ReactDOM.createRoot(container);
    (window as any).__merilview_react_root = appRoot;
  }
  appRoot.render(node);
}

// Dynamically import App to isolate module-level errors in cornerstone/vtk.js
// from preventing React from mounting entirely
async function bootstrap() {
  try {
    if (isStandaloneVRRoute()) {
      let vrMod: any = null;
      try {
        vrMod = await import('./components/vr/StandaloneVRPage');
      } catch (err) {
        console.warn('[MerilView] VR module load failed, reloading...', err);
        window.location.reload();
        return;
      }
      const StandaloneVRPage = vrMod?.default || vrMod;
      if (!StandaloneVRPage) {
        window.location.reload();
        return;
      }
      renderApp(
        <ErrorBoundary>
          <StandaloneVRPage />
        </ErrorBoundary>
      );
      return;
    }

    if (isStandaloneMPRRoute()) {
      let mprMod: any = null;
      try {
        mprMod = await import('./components/mpr/StandaloneMPRPage');
      } catch (err) {
        console.warn('[MerilView] MPR module load failed, reloading...', err);
        window.location.reload();
        return;
      }
      const StandaloneMPRPage = mprMod?.default || mprMod;
      if (!StandaloneMPRPage) {
        window.location.reload();
        return;
      }
      renderApp(
        <ErrorBoundary>
          <StandaloneMPRPage />
        </ErrorBoundary>
      );
      return;
    }

    // Dynamically import UnifiedApp with fallback to auto-reload if stale cache chunk
    let appModule: any = null;
    try {
      appModule = await import('./UnifiedApp');
    } catch (importErr) {
      console.warn('[MerilView] UnifiedApp chunk load failed, refreshing for latest release...', importErr);
      const key = 'merilview_chunk_reload';
      const last = parseInt(sessionStorage.getItem(key) || '0', 10);
      if (Date.now() - last > 5000) {
        sessionStorage.setItem(key, Date.now().toString());
        const url = new URL(window.location.href);
        url.searchParams.set('_v', Date.now().toString());
        window.location.replace(url.toString());
        return;
      }
      throw importErr;
    }

    const UnifiedApp = appModule?.default || appModule;
    if (!UnifiedApp) {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', Date.now().toString());
      window.location.replace(url.toString());
      return;
    }

    // Render React App
    renderApp(
      <ErrorBoundary>
        <UnifiedApp />
      </ErrorBoundary>
    );

    // Start Cornerstone3D initialization non-blockingly AFTER React mounts
    try {
      const { initCornerstone } = await import('./initCornerstone');
      await initCornerstone();
    } catch (err) {
      console.error("[MerilView] Cornerstone3D initialization warning:", err);
    }
  } catch (err: any) {
    console.error('[MerilView] Fatal bootstrap error:', err);
    // Show error directly on page since React may not be mounted
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#070708;color:#e5e5e5;font-family:monospace;padding:2rem;gap:1rem">
          <div style="font-size:2rem">⚠️</div>
          <div style="font-size:1.1rem;color:#f87171;font-weight:bold">MerilView — Bootstrap Error</div>
          <div style="background:#131317;border:1px solid #3f3f46;border-radius:8px;padding:1rem;max-width:700px;width:100%;font-size:0.75rem;color:#a3e635;white-space:pre-wrap;word-break:break-all">${err.message}\n\n${err.stack || ''}</div>
          <button onclick="try{const u=new URL(window.location.href);u.searchParams.set('_v',Date.now().toString());window.location.replace(u.toString());}catch(_){window.location.reload();}" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem">Reload Page</button>
        </div>
      `;
    }
  }
}

bootstrap();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
