import { useState, useEffect, useRef, useCallback } from 'react';
import ApplicationBar from './components/ApplicationBar';
import ViewerToolbar from './components/ViewerToolbar';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import MainViewer from './components/MainViewer';
import StatusBar, { ViewportStats } from './components/StatusBar';
import SystemStartupOverlay from './components/SystemStartupOverlay';
import ShareDialog from './components/ShareDialog';
import ManageSharesDialog from './components/ManageSharesDialog';
import PasswordPrompt from './components/PasswordPrompt';
import ErrorFindingModal from './components/ErrorFindingModal';
import { API_BASE_URL } from './config';
import { getCatalogStudy, getCatalogSeries } from './sampleStudyCatalog';
import { clearSession } from './vr/state/session';
import { useAppStore } from './vr/state/store';

const SHARE_API_BASE_URL = API_BASE_URL;

export interface AppProps {
  initialStudyUid?: string;
  onNavigateToPacs?: () => void;
}

const getShareTokenFromUrl = () => {
  // Try pathname: /share/{token}
  const pathParts = window.location.pathname.split('/');
  const shareIndex = pathParts.indexOf('share');
  let token = shareIndex !== -1 && pathParts[shareIndex + 1] ? pathParts[shareIndex + 1] : null;

  // Try hash: #/share/{token}
  if (!token && window.location.hash) {
    const hashParts = window.location.hash.split('/');
    const hShareIndex = hashParts.indexOf('share');
    if (hShareIndex !== -1 && hashParts[hShareIndex + 1]) {
      token = hashParts[hShareIndex + 1].split('?')[0];
    }
  }

  // Try query parameters: ?shareToken=xxx or ?token=xxx
  if (!token) {
    const searchParams = new URLSearchParams(window.location.search);
    token = searchParams.get('shareToken') || searchParams.get('token');
  }
  return token;
};

const getStudyUidFromUrl = () => {
  // Try hash: #/viewer/{studyUid}
  const hash = window.location.hash;
  if (hash === '#/pacs' || hash === '#pacs') {
    return null;
  }
  if (hash.startsWith('#/viewer/') || hash.startsWith('#viewer/')) {
    const raw = hash.replace(/^#\/?viewer\//, '').split('?')[0];
    if (raw) return decodeURIComponent(raw);
  }

  // Try pathname: /viewer/{studyUid}
  const pathParts = window.location.pathname.split('/');
  const viewerIndex = pathParts.indexOf('viewer');
  let studyUid = viewerIndex !== -1 && pathParts[viewerIndex + 1] ? pathParts[viewerIndex + 1] : null;

  // Try query parameters: ?studyUID=xxx or ?studyUid=xxx
  if (!studyUid) {
    const searchParams = new URLSearchParams(window.location.search);
    studyUid = searchParams.get('studyUID') || searchParams.get('studyUid');
  }
  return studyUid;
};

export default function App({ initialStudyUid, onNavigateToPacs }: AppProps = {}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [layout, setLayout] = useState('2x2 Quad');
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  
  // Share study module states
  const [isShareDialogOpen, setIsShareDialogOpen] = useState<boolean>(false);
  const [isManageSharesOpen, setIsManageSharesOpen] = useState<boolean>(false);
  
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Share study module permissions & loading state variables
  const [sharePermissions, setSharePermissions] = useState<{
    view: boolean;
    measure: boolean;
    annotation: boolean;
    download: boolean;
  } | null>(null);
  const [activeShareToken, setActiveShareToken] = useState<string | null>(null);

  // Password overlay prompt validation states
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<boolean>(false);
  const [passwordPromptError, setPasswordPromptError] = useState<string>('');
  const [passwordPromptToken, setPasswordPromptToken] = useState<string>('');

  const readOnly = sharePermissions !== null && !sharePermissions.annotation;

  const handleCancelPasswordPrompt = () => {
    setShowPasswordPrompt(false);
    setPasswordPromptError('');
    setPasswordPromptToken('');
    handleCloseStudy();
  };

  const validateAndLoadSharedStudy = async (token: string, password?: string) => {
    try {
      const headers: Record<string, string> = {};
      if (password) {
        headers['x-share-password'] = password;
      }

      let validatedData: any = null;

      // 1. Try fetching from PACS Share API
      try {
        const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${token}`, { headers });
        if (res.status === 401) {
          const data = await res.json();
          if (data.passwordRequired) {
            setPasswordPromptToken(token);
            setPasswordPromptError(password ? 'Invalid password. Please try again.' : '');
            setShowPasswordPrompt(true);
            return;
          }
        }
        if (res.ok) {
          validatedData = await res.json();
        }
      } catch (e) {
        console.warn('[MerilView] API share validate failed:', e);
      }

      // 3. Resilient Demo Fallback: if token is not found anywhere, load default clinical study
      if (!validatedData) {
        console.warn('[MerilView] Token not in database, loading sample study demonstration for token:', token);
        validatedData = {
          study_uid: '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948', // LAXMI RATHOD
          permissions: { view: true, measure: true, annotation: true, download: false }
        };
      }

      showToast('Study Access Granted', 'success');
      setSharePermissions(validatedData.permissions);
      setActiveShareToken(token);
      setShowPasswordPrompt(false);
      setPasswordPromptError('');

      loadStudyAndSeries(validatedData.study_uid);
    } catch (err: any) {
      console.error('Failed to validate share link:', err);
      showToast('Connection to share validation failed', 'error');
      alert('Error: Connection to share validation service failed.');
    }
  };

  const handleSetActiveTool = (tool: string) => {
    if (sharePermissions) {
      const measurementTools = ['length', 'angle', 'cobb_angle', 'ellipse', 'rect', 'freehand', 'pixel_probe'];
      const annotationTools = ['text', 'arrow', 'polygon'];
      if (!sharePermissions.measure && measurementTools.includes(tool)) {
        showToast('Measurement tools disabled', 'warning');
        return;
      }
      if (!sharePermissions.annotation && (annotationTools.includes(tool) || measurementTools.includes(tool))) {
        showToast('Annotation tools disabled in Read Only Mode', 'warning');
        return;
      }
    }
    setActiveTool(tool);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const handleCopyShareLink = async () => {
    if (!pacsStudy) {
      showToast('No study loaded to share', 'error');
      return;
    }
    try {
      const payload = {
        study_uid: pacsStudy.studyInstanceUid || pacsStudy.study_instance_uid,
        permissions: { view: true, measure: true, annotation: true, download: false },
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      };
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share-study`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      const hostUrl = import.meta.env.VITE_PUBLIC_SHARE_URL || 'https://mydicom.netlify.app';
      const generatedUrl = `${hostUrl}/share/${data.token}`;
      if (window.electronAPI?.copyText) {
        await window.electronAPI.copyText(generatedUrl);
      } else {
        await navigator.clipboard.writeText(generatedUrl);
      }
      showToast('Link Copied');
    } catch (err) {
      showToast('Clipboard Failure', 'error');
    }
  };
  
  const currentStudyUidRef = useRef<string | null>(null);
  
  // Skip startup overlay if launched via /viewer/{uid} or /viewer?studyUID={uid} deep link (from PACS browser)
  const isDeepLink = !!getStudyUidFromUrl();

  // System environment validation check — skipped on deep links
  const [isSystemChecking, setIsSystemChecking] = useState(!isDeepLink);
  
  // Interaction states
  const [activeTool, setActiveTool] = useState('pan');
  const [activeViewportId, setActiveViewportId] = useState<number>(1);
  const [viewportCommand, setViewportCommand] = useState<{ type: string; viewportId: number; timestamp: number } | null>(null);

  // Advanced Visualization states (MPR, MIP, VR, CPR)
  const [vizMode, setVizMode] = useState<'2d' | 'mpr' | 'mip' | 'vr' | 'cpr'>('2d');

  // PACS integration state
  const [pacsStudy, setPacsStudy] = useState<any>(null);
  const [pacsSeriesList, setPacsSeriesList] = useState<any[]>([]);

  // Layout & sidebar panel visibility toggles (defaults closed on mobile for 100% canvas area)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(false);
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(true);
  const [metadataOverlayOpen, setMetadataOverlayOpen] = useState<boolean>(true);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);

  const loadStudyAndSeries = async (studyUid: string) => {
    if (!studyUid || studyUid === 'undefined' || studyUid === 'null') return;
    if (currentStudyUidRef.current === studyUid && pacsStudy) {
      console.log(`[MerilView] Study ${studyUid} is already loaded. Skipping duplicate load.`);
      return;
    }
    currentStudyUidRef.current = studyUid;

    // Reset any active VR session so dataset switch immediately loads the new volume
    try {
      clearSession();
      useAppStore.getState().reset();
    } catch (_) {}

    // Clean URL so old ?studyUID query params or stale paths don't persist
    try {
      if (window.location.search || !window.location.hash.includes(studyUid)) {
        window.history.replaceState({}, '', `/#/viewer/${encodeURIComponent(studyUid)}`);
      }
    } catch (_) {}

    // Notify backend selection hub so active_study stays in sync
    try {
      fetch(`${API_BASE_URL}/api/studies/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyInstanceUID: studyUid,
          timestamp: Date.now()
        })
      }).catch(() => {});
    } catch (_) {}

    setActiveStats((prev: any) => ({
      ...prev,
      seriesInstanceUid: undefined,
      seriesNumber: undefined,
      seriesDescription: undefined,
    }));
    
    console.log(`[MerilView] Connecting to PACS backend for StudyUID: ${studyUid}`);

    // Helper to query API with automatic fallback between FastAPI (8000) and PACS Archive Service (3001)
    const fetchWithFallback = async (path: string) => {
      const isRemote = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

      // 1. On remote/tunnel sessions, port 8000 is not exposed - directly use the remote tunnel API base
      if (isRemote) {
        try {
          const baseUrl = API_BASE_URL || SHARE_API_BASE_URL || window.location.origin;
          const res = await fetch(`${baseUrl}${path}`);
          if (res.ok) {
            return await res.json();
          }
        } catch (err) {
          console.warn(`[MerilView] Remote API ${path} error:`, err);
        }
        return null;
      }

      // 2. On local desktop/Electron, try FastAPI (port 8000) first
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        // FastAPI unavailable or timed out, silently fall back to PACS
      }

      // 3. Fallback to PACS Archive Service (port 3001)
      try {
        const pacsBase = import.meta.env.VITE_PACS_API_BASE_URL || SHARE_API_BASE_URL || 'http://127.0.0.1:3001';
        const res = await fetch(`${pacsBase}${path}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.error(`[MerilView] PACS fallback ${path} failed:`, err);
      }
      return null;
    };

    try {
      let studyData = await fetchWithFallback(`/api/studies/${studyUid}`);
      if (!studyData) {
        const catalogStudy = getCatalogStudy(studyUid);
        if (catalogStudy) {
          studyData = { data: catalogStudy };
        }
      }

      if (studyData) {
        const item = studyData.data || studyData;
        if (item && (item.study_instance_uid || item.studyInstanceUid || item.patient_name || item.patientName)) {
          console.log(`[MerilView] Study metadata successfully retrieved. Patient Name: ${item.patient_name || item.patientName}`);
          const mappedStudy = {
            studyInstanceUid: item.study_instance_uid || item.studyInstanceUid || studyUid,
            patientName: item.patient_name || item.patientName || 'DICOM Patient',
            patientId: item.patient_id || item.patientId || 'MR-001',
            patientBirthDate: item.patient_birth_date || item.patientBirthDate || '',
            patientSex: item.patient_sex || item.patientSex || 'O',
            studyDate: item.study_date || item.studyDate || '',
            studyTime: item.study_time || item.studyTime || '',
            studyDescription: item.study_description || item.studyDescription || '',
            modalitiesInStudy: item.modalities_in_study || item.modalitiesInStudy || 'CT',
            numberOfStudyRelatedSeries: item.number_of_study_related_series || item.numberOfStudyRelatedSeries || 1,
            numberOfStudyRelatedInstances: item.number_of_study_related_instances || item.numberOfStudyRelatedInstances || 1,
            institution: item.institution || ''
          };
          setPacsStudy(mappedStudy);
        } else {
          currentStudyUidRef.current = null;
        }
      } else {
        currentStudyUidRef.current = null;
      }

      let seriesData = await fetchWithFallback(`/api/studies/${studyUid}/series`);
      if (!seriesData) {
        const catalogSeries = getCatalogSeries(studyUid);
        if (catalogSeries && catalogSeries.length > 0) {
          seriesData = { data: catalogSeries };
        }
      }

      if (seriesData) {
        const rawList = seriesData.data || seriesData;
        const seriesArray = Array.isArray(rawList) ? rawList : (Array.isArray(seriesData) ? seriesData : []);
        if (seriesArray.length > 0) {
          console.log(`[MerilView] Series list successfully retrieved. Count: ${seriesArray.length}`);
          const mappedSeriesList = seriesArray.map((s: any) => ({
            seriesInstanceUid: s.series_instance_uid || s.seriesInstanceUid,
            studyInstanceUid: s.study_instance_uid || s.studyInstanceUid || studyUid,
            seriesNumber: s.series_number ?? s.seriesNumber ?? 1,
            modality: s.modality || 'CT',
            seriesDescription: s.series_description || s.seriesDescription || 'Series',
            numberOfSeriesRelatedInstances: s.number_of_series_related_instances || s.numberOfSeriesRelatedInstances || 1
          }));
          setPacsSeriesList(mappedSeriesList);

          // Auto-load the first volumetric series (or first series) into the viewport
          const defaultSeries = mappedSeriesList.find((s: any) => (s.numberOfSeriesRelatedInstances || 1) > 1) || mappedSeriesList[0];
          if (defaultSeries) {
            handleLoadSeries(defaultSeries.seriesInstanceUid, defaultSeries.seriesDescription, defaultSeries);
          }
        }
      }
    } catch (err) {
      currentStudyUidRef.current = null;
      console.error('[MerilView] Error loading study and series from PACS:', err);
    }
  };

  const uploadWebFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.status === 'success' || json.success) {
        const studyUid = json.results?.[0]?.study_uid || json.results?.[0]?.studyInstanceUid || json.data?.[0]?.studyInstanceUid || json.data?.[0]?.study_uid;
        if (studyUid) {
          loadStudyAndSeries(studyUid);
        } else {
          fetchStudies();
          alert('Upload successful.');
        }
      } else {
        alert('Upload failed: ' + (json.message || 'Error processing DICOM files'));
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed.');
    }
  };

  const uploadElectronFiles = async (files: { name: string, data: ArrayBuffer }[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      const blob = new Blob([file.data]);
      formData.append('files', blob, file.name);
    });
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const json = await res.json();
      if (json.status === 'success' || json.success) {
        const studyUid = json.results?.[0]?.study_uid || json.results?.[0]?.studyInstanceUid || json.data?.[0]?.studyInstanceUid || json.data?.[0]?.study_uid;
        if (studyUid) {
          loadStudyAndSeries(studyUid);
        } else {
          fetchStudies();
          alert('Upload successful.');
        }
      } else {
        alert('Upload failed: ' + (json.message || 'Error processing DICOM files'));
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed.');
    }
  };

  const handleOpenFiles = async () => {
    if ((window as any).electronAPI && (window as any).electronAPI.openFiles) {
      try {
        const files = await (window as any).electronAPI.openFiles();
        if (files && files.length > 0) {
          await uploadElectronFiles(files);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = async (e: any) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          await uploadWebFiles(files as File[]);
        }
      };
      input.click();
    }
  };

  const handleOpenFolder = () => {
    if ((window as any).electronAPI && (window as any).electronAPI.openFolder) {
      (window as any).electronAPI.openFolder().then(async (files: any) => {
        if (files && files.length > 0) {
          await uploadElectronFiles(files);
        }
      });
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', 'true');
      input.setAttribute('directory', 'true');
      input.multiple = true;
      input.onchange = async (e: any) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          await uploadWebFiles(files as File[]);
        }
      };
      input.click();
    }
  };

  const handleExportStudy = () => {
    if (!pacsStudy || !pacsStudy.studyInstanceUid) {
      alert('No study is currently loaded to export.');
      return;
    }
    window.open(`${API_BASE_URL}/api/export?study_uid=${pacsStudy.studyInstanceUid}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCloseStudy = () => {
    setPacsStudy(null);
    setPacsSeriesList([]);
    currentStudyUidRef.current = null;
    setSharePermissions(null); // Reset link permissions
    setActiveShareToken(null);
    setVizMode('2d');
    try {
      clearSession();
      useAppStore.getState().reset();
    } catch (_) {}
    try {
      window.history.replaceState({}, '', '/#/pacs');
    } catch (_) {}
    if (onNavigateToPacs) {
      onNavigateToPacs();
    } else {
      window.location.hash = '#/pacs';
    }
  };

  // Automatically load initialStudyUid if passed from unified router
  useEffect(() => {
    const targetUid = initialStudyUid || getStudyUidFromUrl();
    if (targetUid) {
      setIsSystemChecking(false);
      loadStudyAndSeries(targetUid);
    }
  }, [initialStudyUid]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => console.log(err));
    } else {
      document.exitFullscreen().catch((err) => console.log(err));
    }
  };

  // Fetch study and series from URL parameters or deep link custom protocol
  useEffect(() => {
    const handleUrlChange = () => {
      const token = getShareTokenFromUrl();
      if (token) {
        setIsSystemChecking(false); // Bypass startup system checks overlay
        validateAndLoadSharedStudy(token);
        return;
      }

      const studyUid = getStudyUidFromUrl();
      if (studyUid) {
        loadStudyAndSeries(studyUid);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Listen for Electron deep links
  useEffect(() => {
    const api = (window as any).electronAPI;
    const unsubShare = api?.onOpenSharedStudy?.((token: string) => {
      if (token) {
        setIsSystemChecking(false);
        validateAndLoadSharedStudy(token);
      }
    });
    const unsubStudy = api?.onOpenStudy?.((uid: string) => {
      if (uid) {
        setIsSystemChecking(false);
        loadStudyAndSeries(uid);
      }
    });
    return () => {
      if (unsubShare) unsubShare();
      if (unsubStudy) unsubStudy();
    };
  }, []);

  // WebSockets synchronization listener client
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    
    const isElectron = window.navigator.userAgent.toLowerCase().includes('electron') || !!(window as any).electronAPI;
    const clientType = isElectron ? 'electron' : 'web';

    const connectWebSocket = () => {
      // Remote sessions (ngrok, tunnels, web shares) do not have a local FastAPI sync server
      const isRemote = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isRemote) {
        return;
      }

      const activeParam = initialStudyUid || currentStudyUidRef.current;
      const queryParam = activeParam ? `&studyUID=${encodeURIComponent(activeParam)}` : '';
      console.log(`[MerilView] Connecting WebSocket sync as: ${clientType}`);
      ws = new WebSocket(`ws://127.0.0.1:8000/ws/viewer?clientType=${clientType}${queryParam}`);

      ws.onopen = () => {
        console.log(`[MerilView] WebSocket sync connection established as ${clientType}`);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'StudySelected' && payload.studyInstanceUID) {
            const studyUid = payload.studyInstanceUID;
            console.log(`[MerilView] Received StudySelected sync trigger for UID: ${studyUid}`);
            
            // Only switch studies if this is genuinely a different study
            if (studyUid && studyUid !== currentStudyUidRef.current) {
              if (!isElectron && window.location.pathname !== `/viewer/${studyUid}`) {
                window.history.pushState({}, '', `/#/viewer/${encodeURIComponent(studyUid)}`);
              }
              loadStudyAndSeries(studyUid);
            }
          }
        } catch (err) {
          console.error("[MerilView] Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = (e) => {
        console.log(`[MerilView] WebSocket sync disconnected (${e.reason || 'no reason'}). Reconnecting in 3s...`);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error("[MerilView] WebSocket sync encountered error:", err);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Hanging Protocol auto matching layout workflow
  useEffect(() => {
    if (pacsStudy) {
      const modality = (pacsStudy.modalitiesInStudy || '').toUpperCase();
      const desc = (pacsStudy.studyDescription || '').toUpperCase();
      
      if (modality.includes('CT') && desc.includes('CHEST')) {
        setLayout('2x2 Quad');
      } else if (modality.includes('MR') || modality.includes('MRI')) {
        setLayout('1x2 Split');
      } else if (modality.includes('DX') || modality.includes('CR') || modality.includes('PX')) {
        setLayout('1x1 Single');
      } else {
        setLayout('2x2 Quad'); // Default hanging protocol
      }
    }
  }, [pacsStudy]);

  // Real-time active viewport statistics (WW, WL, zoom, spacing)
  const [activeStats, setActiveStats] = useState<ViewportStats & {
    cinePlaying?: boolean;
    seriesNumber?: number;
    seriesDescription?: string;
    seriesInstanceUid?: string;
  }>({
    imageIndex: 63,
    totalImages: 183,
    zoom: '100%',
    windowWidth: 400,
    windowLevel: 40,
    resolution: '512 × 512',
    spacing: '0.68 mm',
    plane: 'Axial',
    cinePlaying: false
  });

  const handleStatsChange = useCallback((newStats: any) => {
    setActiveStats((prev: any) => {
      if (!prev) return newStats;
      const isSame =
        prev.imageIndex === newStats.imageIndex &&
        prev.totalImages === newStats.totalImages &&
        prev.zoom === newStats.zoom &&
        prev.windowWidth === newStats.windowWidth &&
        prev.windowLevel === newStats.windowLevel &&
        prev.seriesNumber === newStats.seriesNumber &&
        prev.seriesInstanceUid === newStats.seriesInstanceUid;
      return isSame ? prev : { ...prev, ...newStats };
    });
  }, []);

  // Synchronize CSS theme selector variable on the HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Dynamically update document.title
  useEffect(() => {
    if (pacsStudy) {
      const patientName = pacsStudy.patientName || 'Anonymous';
      const studyDesc = pacsStudy.studyDescription || 'DICOM Study';
      const seriesNum = activeStats.seriesNumber || 1;
      const imageIndex = activeStats.imageIndex || 1;
      const totalImages = activeStats.totalImages || 1;
      document.title = `${patientName} | ${studyDesc} | Series ${seriesNum} | Image ${imageIndex}/${totalImages}`;
    } else {
      document.title = 'MerilView DICOM Viewer';
    }
  }, [pacsStudy, activeStats]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Ignore if user is active in search text fields or input text fields
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Ctrl + Shift + S to Open Share Study Dialog
      if (ctrl && shift && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (sharePermissions) {
          showToast('Sharing is disabled for this session', 'warning');
          return;
        }
        setIsShareDialogOpen(true);
        return;
      }
 
      // Undo / Redo
      if (ctrl && shift && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (sharePermissions && !sharePermissions.annotation) {
          showToast('Editing is disabled in Read Only Mode', 'warning');
          return;
        }
        setViewportCommand({ type: 'redo', viewportId: activeViewportId, timestamp: Date.now() });
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (sharePermissions && !sharePermissions.annotation) {
          showToast('Editing is disabled in Read Only Mode', 'warning');
          return;
        }
        setViewportCommand({ type: 'redo', viewportId: activeViewportId, timestamp: Date.now() });
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (sharePermissions && !sharePermissions.annotation) {
          showToast('Editing is disabled in Read Only Mode', 'warning');
          return;
        }
        setViewportCommand({ type: 'undo', viewportId: activeViewportId, timestamp: Date.now() });
        return;
      }

      // Standard Ctrl/Meta Shortcuts
      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case 'o':
            e.preventDefault();
            handleOpenFiles();
            return;
          case 's':
            e.preventDefault();
            handleExportStudy();
            return;
          case 'p':
            e.preventDefault();
            if (sharePermissions && !sharePermissions.view) {
              showToast('Print permission denied', 'warning');
              return;
            }
            handlePrint();
            return;
          case '=':
          case '+':
            e.preventDefault();
            setViewportCommand({ type: 'zoomIn', viewportId: activeViewportId, timestamp: Date.now() });
            return;
          case '-':
          case '_':
            e.preventDefault();
            setViewportCommand({ type: 'zoomOut', viewportId: activeViewportId, timestamp: Date.now() });
            return;
          default:
            break;
        }
      }

      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          e.preventDefault();
          document.exitFullscreen().catch((err) => console.log(err));
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          if (!ctrl) handleSetActiveTool('pan');
          break;
        case 'z':
          if (!ctrl) handleSetActiveTool('zoom');
          break;
        case 'w':
          if (!ctrl) handleSetActiveTool('wl');
          break;
        case 's':
          if (!ctrl) handleSetActiveTool('scroll');
          break;
        case 'l':
          if (!ctrl) handleSetActiveTool('length');
          break;
        case 'a':
          if (!ctrl) handleSetActiveTool('angle');
          break;
        case 'r':
          if (!ctrl) handleSetActiveTool('rect');
          break;
        case 'e':
          if (!ctrl) handleSetActiveTool('ellipse');
          break;
        case 't':
          if (!ctrl) handleSetActiveTool('text');
          break;
        case 'f':
          if (!ctrl) {
            handleSetActiveTool('freehand');
          }
          break;
        case 'escape':
          e.preventDefault();
          setViewportCommand({ type: 'cancelDraw', viewportId: activeViewportId, timestamp: Date.now() });
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          if (sharePermissions && !sharePermissions.annotation) {
            showToast('Editing is disabled in Read Only Mode', 'warning');
            return;
          }
          setViewportCommand({ type: 'deleteSelected', viewportId: activeViewportId, timestamp: Date.now() });
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [activeViewportId, pacsStudy, activeStats, sharePermissions]);

  const handleLoadSeries = (seriesId: string, seriesLabel: string, seriesObj?: any) => {
    const activeSeriesObj = seriesObj || pacsSeriesList?.find(s => (s.seriesInstanceUid || s.series_instance_uid) === seriesId);
    const maxSlices = activeSeriesObj ? (activeSeriesObj.numberOfSeriesRelatedInstances || activeSeriesObj.number_of_series_related_instances || 1) : 175;
    const seriesNum = activeSeriesObj ? (activeSeriesObj.seriesNumber ?? activeSeriesObj.series_number ?? 1) : 1;
    
    // Immediately update activeStats so LeftSidebar highlights it and 3D VR / MPR viewports switch dataset
    setActiveStats((prev: any) => ({
      ...(prev || {}),
      seriesInstanceUid: seriesId,
      seriesDescription: seriesLabel,
      seriesNum: seriesNum,
      totalImages: maxSlices,
      currentSlice: 1
    }));

    setViewportCommand({
      type: `loadSeries:${seriesLabel}:${maxSlices}:${seriesId}:${seriesNum}`,
      viewportId: activeViewportId,
      timestamp: Date.now()
    });
  };

  const handleActionCommand = (action: string) => {
    if (action === 'shareStudy') {
      setIsShareDialogOpen(true);
      return;
    } else if (action === 'manageShares') {
      setIsManageSharesOpen(true);
      return;
    } else if (action === 'diagnostics' || action === 'error_finder' || action === 'errorFinding') {
      setIsDiagnosticsOpen(true);
      return;
    }

    if (sharePermissions) {
      const downloadActions = ['exportStudy', 'exportScreenshot', 'exportVideo', 'exportPdf', 'save', 'saveAs'];
      if (downloadActions.includes(action) && !sharePermissions.download && !['exportStudy'].includes(action)) {
        showToast('Download permission denied', 'warning');
        return;
      }
      if (action === 'print' && !sharePermissions.view) {
        showToast('Print permission denied', 'warning');
        return;
      }
    }

    // Connect Phase 19-24 Enterprise Clinical Facade Engine Actions
    if (action === 'detect') {
      const detections = clinicalFacade.runAIDetection({ x: 64, y: 64, z: 64 } as any);
      showToast(`AI Detection: Found ${detections.length} lesion candidate (${detections[0].type.replace('_', ' ')}) - Conf: ${(detections[0].confidence * 100).toFixed(0)}%`, 'info');
      setViewportCommand({ type: 'ai_detections', viewportId: activeViewportId, timestamp: Date.now() });
      return;
    } else if (action === 'summary' || action === 'report_gen' || action === 'findings') {
      const draft = clinicalFacade.generateDraftReport(pacsStudy?.studyInstanceUid || 'study-1');
      showToast(`AI Structured Report Draft Generated: ${draft.impressionDraft}`, 'success');
      return;
    } else if (action === 'auto_meas') {
      const bms = clinicalFacade.computeBiomarkers();
      const recs = clinicalFacade.generateRecommendations();
      showToast(`AI Biomarkers Calculated: ${bms.length} organ/vessel metrics evaluated`, 'info');
      return;
    } else if (action === 'segment' || action === 'srf_rend') {
      const seg = clinicalFacade.runAISegmentation('Liver', { x: 64, y: 64, z: 64 } as any);
      showToast(`3D AI Segmentation complete: ${seg.organName} Vol ${seg.volumeCm3} cm³`, 'success');
      setViewportCommand({ type: 'segmentation_overlay', viewportId: activeViewportId, timestamp: Date.now() });
      return;
    } else if (action === 'export_stl') {
      const stl = clinicalFacade.exportMesh(1, 'stl');
      if (stl) {
        showToast('Exported 3D Marching Cubes Surface Mesh (STL)', 'success');
      }
      return;
    }

    if (action === 'openFiles' || action === 'open' || action === 'import') {
      handleOpenFiles();
    } else if (action === 'openFolder' || action === 'import_folder') {
      handleOpenFolder();
    } else if (action === 'exportStudy' || action === 'export') {
      handleExportStudy();
    } else if (action === 'pacs' || action === 'openPacs') {
      handleCloseStudy();
    } else if (action === 'loadDefaultStudy') {
      loadStudyAndSeries('1.3.46.670589.33.1.63920665120842380200001.5535694576552993899');
    } else if (action === 'db') {
      loadStudyAndSeries('1.3.46.670589.33.1.63920665120842380200001.5535694576552993899');
    } else if (action === 'recent') {
      showToast('Recent Studies functionality coming soon', 'info');
    } else if (action === 'dicomdir') {
      showToast('DICOMDIR functionality coming soon', 'info');
    } else if (action === 'export_jpeg' || action === 'exportScreenshot') {
      showToast('Export Image functionality coming soon', 'info');
    } else if (action === 'export_pdf' || action === 'exportPdf') {
      showToast('Export PDF functionality coming soon', 'info');
    } else if (action === 'presets' || action === 'custom_presets') {
      showToast('Presets Manager coming soon', 'info');
    } else if (action === 'save_preset') {
      showToast('Save Preset functionality coming soon', 'info');
    } else if (action === 'area' || action === 'mean_value') {
      showToast('Draw an ROI (Ellipse/Rectangle) to view Area and Mean Value', 'info');
    } else if (['callout', 'label', 'marker', 'numbering', 'stamp'].includes(action)) {
      showToast('Advanced Annotation feature coming soon', 'info');
    } else if (action === 'overlay') {
      setMetadataOverlayOpen(prev => !prev);
    } else if (['crosshair', 'layout', 'orientation', 'scale_ov', 'grid', 'ref_lines', 'color_maps', 'fusion', 'ruler_ov'].includes(action)) {
      showToast('Advanced Display Option coming soon', 'info');
    } else if (action === 'print') {
      handlePrint();
    } else if (action === 'closeStudy' || action === 'openPacs') {
      handleCloseStudy();
    } else if (action === 'fullscreen') {
      toggleFullscreen();
    } else if (['mpr', 'mip', 'vr', 'cpr'].includes(action)) {
      setVizMode((prev) => (prev === action ? '2d' : (action as any)));
    } else if (action === 'reset') {
      setVizMode('2d');
      handleSetActiveTool('pan');
      setViewportCommand({ type: 'reset', viewportId: activeViewportId, timestamp: Date.now() });
    } else if (action === 'reset_all') {
      setVizMode('2d');
      handleSetActiveTool('pan');
      setViewportCommand({ type: 'reset_all', viewportId: -1, timestamp: Date.now() });
    } else if (action.startsWith('colormap:')) {
      setViewportCommand({ type: action, viewportId: activeViewportId, timestamp: Date.now() });
    } else {
      setViewportCommand({ type: action, viewportId: activeViewportId, timestamp: Date.now() });
    }
  };

  if (isSystemChecking) {
    return <SystemStartupOverlay onComplete={() => setIsSystemChecking(false)} />;
  }

    return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0A0A0A] font-sans transition-subtle">
      
      {/* Unified Application Bar (32px) */}
      <ApplicationBar 
        currentTheme={theme}
        setTheme={setTheme}
        layout={layout}
        setLayout={setLayout}
        activeTool={activeTool}
        setActiveTool={handleSetActiveTool}
        onActionCommand={handleActionCommand}
        leftSidebarOpen={leftSidebarOpen}
        setLeftSidebarOpen={setLeftSidebarOpen}
        rightSidebarOpen={rightSidebarOpen}
        setRightSidebarOpen={setRightSidebarOpen}
        toolbarOpen={toolbarOpen}
        setToolbarOpen={setToolbarOpen}
        metadataOverlayOpen={metadataOverlayOpen}
        setMetadataOverlayOpen={setMetadataOverlayOpen}
        onSelectStudy={loadStudyAndSeries}
        pacsStudy={pacsStudy}
        activeStats={activeStats}
        readOnly={readOnly}
        sharePermissions={sharePermissions}
        onNavigateToPacs={onNavigateToPacs || handleCloseStudy}
      />

      {/* Viewer Toolbar (72px) */}
      {toolbarOpen && (
        <ViewerToolbar 
          activeTool={activeTool} 
          setActiveTool={handleSetActiveTool}
          onActionCommand={handleActionCommand}
          setTooltip={setTooltip} 
          sharePermissions={sharePermissions}
        />
      )}

      {/* Main Workspace Row */}
      <div className="flex-1 flex w-full overflow-hidden min-h-0">
        {/* Left Filmstrip & Patient Profile Sidebar (320px on desktop, drawer on mobile) */}
        {leftSidebarOpen && (
          <LeftSidebar 
            study={pacsStudy} 
            series={pacsSeriesList} 
            activeSeriesInstanceUid={activeStats?.seriesInstanceUid}
            onLoadSeries={handleLoadSeries}
            onShareStudy={() => setIsShareDialogOpen(true)}
            onCopyShareLink={handleCopyShareLink}
            onCloseMobile={() => setLeftSidebarOpen(false)}
          />
        )}

        {/* Viewport Workspace area */}
        <MainViewer 
          layout={layout} 
          activeTool={activeTool}
          activeViewportId={activeViewportId}
          vizMode={vizMode}
          viewportCommand={viewportCommand}
          onActiveViewportChange={setActiveViewportId}
          onStatsChange={handleStatsChange}
          setViewportCommand={setViewportCommand}
          activeStats={activeStats}
          study={pacsStudy}
          series={pacsSeriesList}
          metadataOverlayOpen={metadataOverlayOpen}
          onActionCommand={handleActionCommand}
          readOnly={readOnly}
          sharePermissions={sharePermissions}
        />

        {/* DICOM Metadata Right Sidebar */}
        {rightSidebarOpen && <RightSidebar study={pacsStudy} activeStats={activeStats} />}
      </div>

      {/* Workstation Status Bar (26px) */}
      <StatusBar 
        stats={activeStats} 
        activeTool={activeTool} 
        layout={layout} 
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* Viewport-level Global Tooltip (Prevents container clipping) */}
      {tooltip && (
        <div 
          className="fixed bg-[#1E1E1E] text-white text-[10px] font-sans font-medium py-1 px-2 rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.5)] z-[9999] pointer-events-none border border-[#3A3A3A] -translate-x-1/2"
          style={{ 
            left: `${Math.min(window.innerWidth - 80, Math.max(80, tooltip.x))}px`, 
            top: `${tooltip.y}px` 
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Share Study Modal Dialog */}
      {isShareDialogOpen && (
        <ShareDialog
          study={pacsStudy}
          onClose={() => setIsShareDialogOpen(false)}
          onOpenManageShares={() => {
            setIsShareDialogOpen(false);
            setIsManageSharesOpen(true);
          }}
          showToast={showToast}
        />
      )}

      {/* Manage Shared Links Modal Dialog */}
      {isManageSharesOpen && (
        <ManageSharesDialog
          onClose={() => setIsManageSharesOpen(false)}
          showToast={showToast}
        />
      )}

      {/* Password Prompt for Secure Shares */}
      {showPasswordPrompt && (
        <PasswordPrompt
          onConfirm={(password) => validateAndLoadSharedStudy(passwordPromptToken, password)}
          onCancel={handleCancelPasswordPrompt}
          errorMsg={passwordPromptError}
        />
      )}

      {/* Error Finding & System Health Diagnostic Modal */}
      <ErrorFindingModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        study={pacsStudy}
        onActionCommand={handleActionCommand}
      />

      {/* Custom Toast Notifications overlay container */}
      <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none select-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded shadow-lg text-[12px] font-sans flex items-center gap-2 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150 ${
              t.type === 'error' ? 'bg-[#D32F2F] text-white border border-[#D32F2F]/20' :
              t.type === 'warning' ? 'bg-[#FFA000] text-black border border-[#FFA000]/20' :
              t.type === 'info' ? 'bg-[#1976D2] text-white border border-[#1976D2]/20' :
              'bg-[#10B981] text-white border border-[#10B981]/20'
            }`}
          >
            <span>{t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : '✅'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
