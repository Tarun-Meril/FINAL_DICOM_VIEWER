import React, { useState, useEffect, useCallback } from 'react';
import PacsStudyBrowser from './pacs/PacsStudyBrowser';
import App from './App';
import { Activity, RefreshCw, FolderOpen, AlertTriangle } from 'lucide-react';

export function getInitialRoute(): { view: 'pacs' | 'viewer'; studyUid?: string } {
  const hash = window.location.hash;
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // 1. Check share links first (highest priority)
  if (
    hash.startsWith('#/share/') || 
    hash.startsWith('#share/') || 
    pathname.includes('/share/') || 
    params.get('shareToken') || 
    params.get('token')
  ) {
    return { view: 'viewer' };
  }

  // 2. Check hash (#/viewer/:uid or #/pacs)
  if (hash === '#/pacs' || hash === '#pacs') {
    return { view: 'pacs' };
  }
  if (hash.startsWith('#/viewer/') || hash.startsWith('#viewer/')) {
    const raw = hash.replace(/^#\/?viewer\//, '').split('?')[0];
    if (raw) return { view: 'viewer', studyUid: decodeURIComponent(raw) };
  }

  // 3. Check pathname (/viewer/:uid or /pacs)
  if (pathname === '/pacs' || pathname.startsWith('/pacs/')) {
    return { view: 'pacs' };
  }
  if (pathname.includes('/viewer/')) {
    const parts = pathname.split('/viewer/');
    const uid = parts[1]?.split('/')[0]?.split('?')[0];
    if (uid) return { view: 'viewer', studyUid: decodeURIComponent(uid) };
  }

  // 4. Check query parameters (?studyUID=...)
  const qStudy = params.get('studyUID') || params.get('studyUid');
  if (qStudy) {
    return { view: 'viewer', studyUid: qStudy };
  }

  // Default initial route: PACS Study Browser!
  return { view: 'pacs' };
}

export default function UnifiedApp() {
  const [routeState, setRouteState] = useState<{ view: 'pacs' | 'viewer'; studyUid?: string }>(getInitialRoute);
  
  // Health check startup states
  const [isInitializing, setIsInitializing] = useState(false);
  const [startupError, setStartupError] = useState<{ service: string; message: string } | null>(null);

  const navigateToViewer = useCallback((studyUid: string) => {
    if (!studyUid) return;
    console.log(`[UnifiedApp] Navigating to Viewer for study: ${studyUid}`);
    try {
      if (window.location.search || (window.location.pathname !== '/' && window.location.pathname !== '/index.html')) {
        window.history.replaceState({}, '', `/#/viewer/${encodeURIComponent(studyUid)}`);
      }
    } catch (_) {}
    window.location.hash = `#/viewer/${encodeURIComponent(studyUid)}`;
    setRouteState({ view: 'viewer', studyUid });
  }, []);

  const navigateToPacs = useCallback(() => {
    console.log(`[UnifiedApp] Navigating to PACS Study Browser`);
    try {
      window.history.replaceState({}, '', '/#/pacs');
    } catch (_) {}
    window.location.hash = '#/pacs';
    setRouteState({ view: 'pacs' });
  }, []);

  // Listen for hash and popstate changes
  useEffect(() => {
    const handleLocationChange = () => {
      const current = getInitialRoute();
      setRouteState(current);
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Listen for Electron deep links and IPC study opening
  useEffect(() => {
    if (window.electronAPI?.getStartupStudy) {
      window.electronAPI.getStartupStudy().then((uid) => {
        if (uid) {
          console.log(`[UnifiedApp] Retrieved startup study from Electron: ${uid}`);
          navigateToViewer(uid);
        }
      });
    }

    if (window.electronAPI?.getStartupShare) {
      window.electronAPI.getStartupShare().then((token) => {
        if (token) {
          console.log(`[UnifiedApp] Retrieved startup share from Electron: ${token}`);
          setRouteState({ view: 'viewer' });
        }
      });
    }

    if (window.electronAPI?.onOpenStudy) {
      const unsubscribeStudy = window.electronAPI.onOpenStudy((uid: string) => {
        if (uid) {
          console.log(`[UnifiedApp] Electron onOpenStudy received: ${uid}`);
          navigateToViewer(uid);
        }
      });
      return () => {
        unsubscribeStudy();
      };
    }
  }, [navigateToViewer]);

  useEffect(() => {
    if (window.electronAPI?.onOpenSharedStudy) {
      const unsubscribeShare = window.electronAPI.onOpenSharedStudy((token: string) => {
        if (token) {
          console.log(`[UnifiedApp] Electron onOpenSharedStudy received: ${token}`);
          setRouteState({ view: 'viewer' });
        }
      });
      return () => {
        unsubscribeShare();
      };
    }
  }, []);

  // Startup health check for Electron desktop application
  useEffect(() => {
    const isElectron = !!window.electronAPI;
    if (isElectron && window.electronAPI.getServicesStatus) {
      setIsInitializing(true);
      const checkHealthWithRetry = async () => {
        try {
          let status = await window.electronAPI.getServicesStatus!();
          // If not ready on initial check, wait 1.5s and re-verify before alerting the user
          if (status && (!status.pacs || !status.backend)) {
            await new Promise((r) => setTimeout(r, 1500));
            status = await window.electronAPI.getServicesStatus!();
          }

          if (status && (!status.pacs || !status.backend)) {
            if (status.error) {
              setStartupError({
                service: !status.pacs ? 'PACS Archive Service' : 'FastAPI Backend',
                message: status.error,
              });
            }
          } else {
            setStartupError(null);
          }
        } catch (err: any) {
          console.warn('[UnifiedApp] Health check status retrieval note:', err);
        } finally {
          setIsInitializing(false);
        }
      };

      checkHealthWithRetry();
    }
  }, []);

  const handleRetryStartup = async () => {
    if (window.electronAPI?.retryServices) {
      setIsInitializing(true);
      setStartupError(null);
      try {
        await window.electronAPI.retryServices();
        const status = await window.electronAPI.getServicesStatus?.();
        if (status && status.pacs && status.backend) {
          setStartupError(null);
        } else if (status?.error) {
          setStartupError({ service: 'Local Services', message: status.error });
        }
      } catch (err: any) {
        setStartupError({ service: 'Service Startup', message: err.message || 'Retry failed' });
      } finally {
        setIsInitializing(false);
      }
    }
  };

  const handleOpenLogs = () => {
    if (window.electronAPI?.openLogsFolder) {
      window.electronAPI.openLogsFolder();
    }
  };

  return (
    <div className="w-full h-full h-[100dvh] max-h-[100dvh] max-w-[100vw] overflow-hidden overflow-x-hidden select-none bg-[#070708]">
      {/* Startup Health Check Overlay */}
      {isInitializing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070708] text-white">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-[#0f1420] border border-[#1e293b] shadow-2xl max-w-md w-full text-center">
            <div className="w-12 h-12 rounded-full bg-[#0088ff]/10 border border-[#0088ff]/30 flex items-center justify-center text-[#0088ff]">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-wide uppercase text-white">MerilView</h2>
              <p className="text-xs text-[#94a3b8] mt-1">Starting unified workstation services...</p>
            </div>
            <div className="w-full bg-[#1b2333] h-1.5 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-[#0088ff] animate-pulse w-3/4 rounded-full" />
            </div>
            <div className="text-[11px] text-[#64748b] font-mono">
              Checking PACS Archive & DICOM Engine...
            </div>
          </div>
        </div>
      )}

      {/* Startup Error Modal */}
      {startupError && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm text-white p-4">
          <div className="flex flex-col gap-4 p-6 rounded-xl bg-[#0f1420] border border-[#ef4444]/40 shadow-2xl max-w-lg w-full">
            <div className="flex items-center gap-3 text-[#f87171]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-base">MerilView Service Alert</h3>
                <p className="text-xs text-[#94a3b8]">Service: {startupError.service}</p>
              </div>
            </div>

            <div className="p-3 bg-[#131317] border border-[#27272a] rounded text-xs text-[#fca5a5] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {startupError.message}
            </div>

            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={handleOpenLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#1e293b] text-[#cbd5e1] hover:bg-[#334155] transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Open Logs</span>
              </button>
              <button
                onClick={handleRetryStartup}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button
                onClick={() => setStartupError(null)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-[#334155] text-white hover:bg-[#475569] transition-colors"
              >
                Continue to PACS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Unified Viewport */}
      {routeState.view === 'pacs' ? (
        <PacsStudyBrowser onOpenStudy={navigateToViewer} />
      ) : (
        <App
          key={routeState.studyUid || 'viewer'}
          initialStudyUid={routeState.studyUid}
          onNavigateToPacs={navigateToPacs}
        />
      )}
    </div>
  );
}
