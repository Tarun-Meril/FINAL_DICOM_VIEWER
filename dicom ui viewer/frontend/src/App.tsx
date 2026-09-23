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
import { API_BASE_URL } from './config';
import { clinicalFacade } from './clinical';
const SHARE_API_BASE_URL = import.meta.env.VITE_SHARE_API_BASE_URL || 'http://localhost:3001';

const getShareTokenFromUrl = () => {
  // Try pathname: /share/{token}
  const pathParts = window.location.pathname.split('/');
  const shareIndex = pathParts.indexOf('share');
  let token = shareIndex !== -1 && pathParts[shareIndex + 1] ? pathParts[shareIndex + 1] : null;

  // Try query parameters: ?shareToken=xxx or ?token=xxx
  if (!token) {
    const searchParams = new URLSearchParams(window.location.search);
    token = searchParams.get('shareToken') || searchParams.get('token');
  }
  return token;
};

const getStudyUidFromUrl = () => {
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

export default function App() {
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
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${token}`, { headers });
      const data = await res.json();

      if (res.status === 401 && data.passwordRequired) {
        setPasswordPromptToken(token);
        setPasswordPromptError(password ? 'Invalid password. Please try again.' : '');
        setShowPasswordPrompt(true);
        return;
      }

      if (!res.ok) {
        showToast(data.error || 'Access denied', 'error');
        alert(`Access Denied: ${data.error || 'Invalid share link'}`);
        return;
      }

      showToast('Study Access Granted', 'success');
      setSharePermissions(data.permissions);
      setActiveShareToken(token);
      setShowPasswordPrompt(false);
      setPasswordPromptError('');

      loadStudyAndSeries(data.study_uid);
    } catch (err: any) {
      console.error('Failed to validate share link:', err);
      showToast('PACS share validation server is offline', 'error');
      alert('Error: Connection to PACS share validation server failed.');
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
      const hostUrl = import.meta.env.VITE_SHARE_BASE_URL || window.location.origin;
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

  // Layout & sidebar panel visibility toggles
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(false);
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(true);
  const [metadataOverlayOpen, setMetadataOverlayOpen] = useState<boolean>(true);

  const loadStudyAndSeries = (studyUid: string) => {
    if (!studyUid || studyUid === 'undefined' || studyUid === 'null') return;
    if (currentStudyUidRef.current === studyUid && pacsStudy) {
      console.log(`[MedView PRO] Study ${studyUid} is already loaded. Skipping duplicate load.`);
      return;
    }
    currentStudyUidRef.current = studyUid;
    setActiveStats((prev: any) => ({
      ...prev,
      seriesInstanceUid: undefined,
      seriesNumber: undefined,
      seriesDescription: undefined,
    }));
    
    console.log(`[MedView PRO] Connecting to PACS backend for StudyUID: ${studyUid}`);
    
    const studyUrl = `${API_BASE_URL}/api/studies/${studyUid}`;
    console.log(`[MedView PRO] Fetching study metadata from: ${studyUrl}`);
    
    fetch(studyUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && (data.study_instance_uid || data.studyInstanceUid)) {
          console.log(`[MedView PRO] Study metadata successfully retrieved. Patient Name: ${data.patient_name || data.patientName}, ID: ${data.patient_id || data.patientId}`);
          const mappedStudy = {
            studyInstanceUid: data.study_instance_uid || data.studyInstanceUid,
            patientName: data.patient_name || data.patientName || 'DICOM Patient',
            patientId: data.patient_id || data.patientId || 'MR-001',
            patientBirthDate: data.patient_birth_date || data.patientBirthDate || '',
            patientSex: data.patient_sex || data.patientSex || 'O',
            studyDate: data.study_date || data.studyDate || '',
            studyTime: data.study_time || data.studyTime || '',
            studyDescription: data.study_description || data.studyDescription || '',
            modalitiesInStudy: data.modalities_in_study || data.modalitiesInStudy || 'MR',
            numberOfStudyRelatedSeries: data.number_of_study_related_series || data.numberOfStudyRelatedSeries || 1,
            numberOfStudyRelatedInstances: data.number_of_study_related_instances || data.numberOfStudyRelatedInstances || 1,
            institution: data.institution || ''
          };
          setPacsStudy(mappedStudy);
        } else {
          currentStudyUidRef.current = null;
        }
      })
      .catch((err) => {
        currentStudyUidRef.current = null;
        console.error('[MedView PRO] Error fetching study from PACS backend:', err);
      });

    const seriesUrl = `${API_BASE_URL}/api/studies/${studyUid}/series`;
    console.log(`[MedView PRO] Fetching series hierarchy from: ${seriesUrl}`);
    
    fetch(seriesUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          console.log(`[MedView PRO] Series list successfully retrieved. Count: ${data.length}`);
          const mappedSeriesList = data.map((s: any) => ({
            seriesInstanceUid: s.series_instance_uid || s.seriesInstanceUid,
            studyInstanceUid: s.study_instance_uid || s.studyInstanceUid,
            seriesNumber: s.series_number ?? s.seriesNumber ?? 1,
            modality: s.modality || 'MR',
            seriesDescription: s.series_description || s.seriesDescription || 'Series',
            numberOfSeriesRelatedInstances: s.number_of_series_related_instances || s.numberOfSeriesRelatedInstances || 1
          }));
          setPacsSeriesList(mappedSeriesList);
        }
      })
      .catch((err) => {
        console.error('[MedView PRO] Error fetching series from PACS backend:', err);
      });
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
      if (json.status === 'success') {
        const studyUid = json.results?.[0]?.study_uid;
        if (studyUid) {
          loadStudyAndSeries(studyUid);
        } else {
          alert('Upload successful but no study UID found.');
        }
      } else {
        alert('Upload failed.');
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
      if (json.status === 'success') {
        const studyUid = json.results?.[0]?.study_uid;
        if (studyUid) {
          loadStudyAndSeries(studyUid);
        } else {
          alert('Upload successful but no study UID found.');
        }
      } else {
        alert('Upload failed.');
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
    if (!(window as any).electronAPI) {
      window.history.pushState({}, '', '/');
    }
  };

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
    if ((window as any).electronAPI?.onOpenSharedStudy) {
      const unsubscribe = (window as any).electronAPI.onOpenSharedStudy((token: string) => {
        if (token) {
          setIsSystemChecking(false);
          validateAndLoadSharedStudy(token);
        }
      });
      return unsubscribe;
    }
  }, []);

  // WebSockets synchronization listener client
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    
    const isElectron = window.navigator.userAgent.toLowerCase().includes('electron') || !!(window as any).electronAPI;
    const clientType = isElectron ? 'electron' : 'web';

    const connectWebSocket = () => {
      console.log(`[MedView PRO] Connecting WebSocket sync as: ${clientType}`);
      ws = new WebSocket(`ws://127.0.0.1:8000/ws/viewer?clientType=${clientType}`);

      ws.onopen = () => {
        console.log(`[MedView PRO] WebSocket sync connection established as ${clientType}`);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'StudySelected' && payload.studyInstanceUID) {
            const studyUid = payload.studyInstanceUID;
            console.log(`[MedView PRO] Received StudySelected sync trigger for UID: ${studyUid}`);
            
            // Cleanly update route path in browser address bar without triggering full page reload
            if (!isElectron && window.location.pathname !== `/viewer/${studyUid}`) {
              window.history.pushState({}, '', `/viewer/${studyUid}`);
            }
            
            // Asynchronously reload DICOM files
            loadStudyAndSeries(studyUid);
          }
        } catch (err) {
          console.error("[MedView PRO] Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = (e) => {
        console.log(`[MedView PRO] WebSocket sync disconnected (${e.reason || 'no reason'}). Reconnecting in 3s...`);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error("[MedView PRO] WebSocket sync encountered error:", err);
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
      document.title = 'MedView PRO DICOM Viewer';
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

  const handleLoadSeries = (seriesId: string, seriesLabel: string) => {
    const activeSeriesObj = pacsSeriesList?.find(s => s.seriesInstanceUid === seriesId);
    const maxSlices = activeSeriesObj ? (activeSeriesObj.numberOfSeriesRelatedInstances || 1) : 183;
    const seriesNum = activeSeriesObj ? (activeSeriesObj.seriesNumber || 1) : 1;
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
    } else if (action === 'pacs') {
      showToast('PACS Query functionality coming soon', 'info');
    } else if (action === 'db') {
      showToast('Local Database functionality coming soon', 'info');
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
    } else if (action === 'closeStudy') {
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
        {/* Left Filmstrip & Patient Profile Sidebar (320px) */}
        {leftSidebarOpen && (
          <LeftSidebar 
            study={pacsStudy} 
            series={pacsSeriesList} 
            activeSeriesInstanceUid={activeStats?.seriesInstanceUid}
            onLoadSeries={handleLoadSeries}
            onShareStudy={() => setIsShareDialogOpen(true)}
            onCopyShareLink={handleCopyShareLink}
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
