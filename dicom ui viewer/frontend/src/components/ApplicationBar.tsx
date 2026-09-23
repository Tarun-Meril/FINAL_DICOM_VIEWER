import { useState, useEffect, useRef } from 'react';
import { Bell, Settings, ChevronRight, X } from 'lucide-react';
import { API_BASE_URL } from '../config';
import logo from '../logo.png';

interface ApplicationBarProps {
  currentTheme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  layout: string;
  setLayout: (layout: string) => void;
  
  // App states & controls passed from App.tsx
  activeTool: string;
  setActiveTool: (tool: string) => void;
  onActionCommand: (action: string) => void;
  
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  toolbarOpen: boolean;
  setToolbarOpen: (open: boolean) => void;
  metadataOverlayOpen: boolean;
  setMetadataOverlayOpen: (open: boolean) => void;
  
  onSelectStudy: (studyUid: string) => void;
  pacsStudy: any;
  activeStats: any;
  readOnly?: boolean;
  sharePermissions?: any;
}

interface MenuItem {
  type?: 'separator';
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  radioGroup?: string;
  submenu?: MenuItem[];
  onClick?: () => void;
}

export default function ApplicationBar({
  currentTheme,
  setTheme,
  layout,
  setLayout,
  activeTool,
  setActiveTool,
  onActionCommand,
  leftSidebarOpen,
  setLeftSidebarOpen,
  rightSidebarOpen,
  setRightSidebarOpen,
  toolbarOpen,
  setToolbarOpen,
  metadataOverlayOpen,
  setMetadataOverlayOpen,
  onSelectStudy,
  pacsStudy,
  activeStats,
  readOnly,
  sharePermissions
}: ApplicationBarProps) {
  const [minimizeNotif, setMinimizeNotif] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number>(-1);
  const [focusedSubmenuItemIndex, setFocusedSubmenuItemIndex] = useState<number>(-1);

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Real PACS studies loaded state
  const [pacsStudiesList, setPacsStudiesList] = useState<any[]>([]);
  const [studiesLoaded, setStudiesLoaded] = useState(false);
  const [studiesLoading, setStudiesLoading] = useState(false);

  // Custom UI Modals
  const [activeModal, setActiveModal] = useState<'about' | 'shortcuts' | null>(null);

  // Toggle states for PACS, plugins, and reconstructions
  const [pacsServerStatus, setPacsServerStatus] = useState(true);
  const [active3DMode, setActive3DMode] = useState('mip');
  const [pluginsLoaded] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isElectron = !!(window as any).electronAPI;

  // Sync window maximize status from Electron
  useEffect(() => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.getMaximized().then((status: boolean) => {
        setIsMaximized(status);
      });

      const unsubscribe = (window as any).electronAPI.onMaximizedStatus((status: boolean) => {
        setIsMaximized(status);
      });

      return () => {
        unsubscribe();
      };
    }
  }, []);

  // Fetch real studies from PACS when component mounts or study changes
  const fetchPacsStudies = () => {
    setStudiesLoading(true);
    fetch(`${API_BASE_URL}/api/studies`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPacsStudiesList(data);
          setStudiesLoaded(true);
        }
        setStudiesLoading(false);
      })
      .catch((err) => {
        console.error('[MedView PRO] Error fetching studies for application bar:', err);
        setStudiesLoading(false);
      });
  };

  useEffect(() => {
    fetchPacsStudies();
  }, [pacsStudy]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllMenus();
      }
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) {
        setShowLayoutMenu(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeAllMenus = () => {
    setOpenMenuIndex(null);
    setFocusedItemIndex(-1);
    setActiveSubmenuIndex(-1);
    setFocusedSubmenuItemIndex(-1);
  };

  const getRecentSubmenuItems = (): MenuItem[] => {
    if (!studiesLoaded && studiesLoading) {
      return [{ label: 'Loading studies from PACS...', disabled: true }];
    }
    if (pacsStudiesList.length === 0) {
      return [{ label: 'No studies found in PACS', disabled: true }];
    }
    return pacsStudiesList.slice(0, 8).map((study) => {
      const formattedDate = study.study_date
        ? `${study.study_date.substring(0, 4)}-${study.study_date.substring(4, 6)}-${study.study_date.substring(6, 8)}`
        : '-';
      return {
        label: `${study.patient_name || 'Anonymous'} (${study.patient_id || '-'}) - ${study.study_description || 'No Description'} [${study.modalities_in_study || 'IMG'} | ${formattedDate}]`,
        icon: '📂',
        onClick: () => onSelectStudy(study.study_instance_uid)
      };
    });
  };

  // FULL DESKTOP MENU STRUCTURE MAPPING
  const menus = [
    {
      name: 'File',
      altKey: 'f',
      items: [
        { label: 'New Study', icon: '📄', shortcut: 'Ctrl+N', onClick: () => alert('Action: New Study'), disabled: !!sharePermissions },
        { label: 'Open DICOM Files...', icon: '📂', shortcut: 'Ctrl+O', onClick: () => onActionCommand('openFiles'), disabled: !!sharePermissions },
        { label: 'Open Local DICOM Folder...', icon: '📁', onClick: () => onActionCommand('openFolder'), disabled: !!sharePermissions },
        { 
          label: 'Open Recent', 
          icon: '🗂', 
          submenu: getRecentSubmenuItems(),
          disabled: !!sharePermissions
        },
        { type: 'separator' as const },
        { label: 'Import DICOM Files...', icon: '⬇', onClick: () => alert('Import DICOM Files'), disabled: !!sharePermissions },
        { label: 'Import from PACS...', icon: '🌐', onClick: () => alert('Import from PACS'), disabled: !!sharePermissions },
        { label: 'Import from CD/DVD...', icon: '📀', onClick: () => alert('Import from CD/DVD'), disabled: !!sharePermissions },
        { label: 'Import ZIP Archive...', icon: '📦', onClick: () => alert('Import ZIP Archive'), disabled: !!sharePermissions },
        { type: 'separator' as const },
        { label: 'Export Study...', icon: '⬆', shortcut: 'Ctrl+S', onClick: () => onActionCommand('exportStudy'), disabled: sharePermissions ? !sharePermissions.download : false },
        { label: 'Export Screenshot', icon: '🖼', onClick: () => onActionCommand('exportScreenshot'), disabled: sharePermissions ? !sharePermissions.download : false },
        { label: 'Export Video...', icon: '🎥', onClick: () => alert('Export Video'), disabled: sharePermissions ? !sharePermissions.download : false },
        { label: 'Export PDF Report...', icon: '📄', onClick: () => alert('Export PDF Report'), disabled: sharePermissions ? !sharePermissions.download : false },
        { type: 'separator' as const },
        { label: 'Save', icon: '💾', onClick: () => alert('Save Study'), disabled: readOnly },
        { label: 'Save As...', icon: '💾', onClick: () => alert('Save As'), disabled: readOnly },
        { label: 'Print Viewer', icon: '🖨', shortcut: 'Ctrl+P', onClick: () => onActionCommand('print'), disabled: sharePermissions ? !sharePermissions.view : false },
        { label: 'Print Study...', icon: '🖨', onClick: () => alert('Print Study'), disabled: sharePermissions ? !sharePermissions.view : false },
        { type: 'separator' as const },
        { label: 'Share Study...', icon: '🔗', shortcut: 'Ctrl+Shift+S', onClick: () => onActionCommand('shareStudy'), disabled: !!sharePermissions },
        { label: 'Manage Shared Links...', icon: '⚙', onClick: () => onActionCommand('manageShares'), disabled: !!sharePermissions },
        { type: 'separator' as const },
        { label: 'Close Study', icon: '❌', onClick: () => onActionCommand('closeStudy') },
        { 
          label: 'Exit', 
          icon: '🚪', 
          shortcut: 'Alt+F4', 
          onClick: () => {
            if (isElectron) (window as any).electronAPI.close();
            else alert('Exit Application');
          }
        },
      ] as MenuItem[]
    },
    {
      name: 'Ntk',
      altKey: 'n',
      items: [
        { label: 'Query/Retrieve...', icon: '🔍', shortcut: 'Ctrl+Q', onClick: () => alert('PACS Query/Retrieve') },
        { label: 'PACS Server Status', icon: '📡', checked: pacsServerStatus, onClick: () => setPacsServerStatus(!pacsServerStatus) },
        { label: 'Send to PACS...', icon: '📤', onClick: () => alert('Send to PACS') },
        { label: 'Receive from PACS...', icon: '📥', onClick: () => alert('Receive from PACS') },
        { type: 'separator' as const },
        { label: 'Local C-STORE SCU', icon: '🖥', onClick: () => alert('Local C-STORE SCU') },
        { label: 'Local C-FIND SCP', icon: '🖥', onClick: () => alert('Local C-FIND SCP') },
        { label: 'Local C-MOVE SCP', icon: '🖥', onClick: () => alert('Local C-MOVE SCP') },
        { type: 'separator' as const },
        { label: 'PACS Configuration...', icon: '⚙', onClick: () => alert('PACS Config') },
        { label: 'DICOM Network Settings...', icon: '🌍', onClick: () => alert('DICOM Network Settings') },
        { label: 'Connection Test', icon: '🧪', onClick: () => alert('PACS Connection Test') },
      ] as MenuItem[]
    },
    {
      name: 'Edit',
      altKey: 'e',
      items: [
        { label: 'Undo', icon: '↶', shortcut: 'Ctrl+Z', onClick: () => onActionCommand('undo') },
        { label: 'Redo', icon: '↷', shortcut: 'Ctrl+Y', onClick: () => onActionCommand('redo') },
        { type: 'separator' as const },
        { label: 'Cut', icon: '✂', shortcut: 'Ctrl+X', onClick: () => alert('Cut') },
        { label: 'Copy', icon: '📋', shortcut: 'Ctrl+C', onClick: () => alert('Copy') },
        { label: 'Paste', icon: '📋', shortcut: 'Ctrl+V', onClick: () => alert('Paste') },
        { label: 'Delete Selected Annotation', icon: '🗑', shortcut: 'Delete', onClick: () => onActionCommand('deleteSelected') },
        { type: 'separator' as const },
        { label: 'Copy Measurements', icon: '📐', onClick: () => onActionCommand('copyMeasurements') },
        { label: 'Select All Annotations', icon: '📋', onClick: () => onActionCommand('selectAll') },
        { label: 'Clear Measurements', icon: '🧹', onClick: () => onActionCommand('clearMeasurements') },
        { type: 'separator' as const },
        { label: 'Reset Active View', icon: '🔄', onClick: () => onActionCommand('reset') },
        { label: 'Reset All Viewports', icon: '🔄', onClick: () => onActionCommand('reset_all') },
        { type: 'separator' as const },
        { 
          label: 'Synchronize Viewports', 
          icon: '🔄', 
          checked: localStorage.getItem('medview-sync-enabled') !== 'false',
          onClick: () => {
            const current = localStorage.getItem('medview-sync-enabled') !== 'false';
            localStorage.setItem('medview-sync-enabled', (!current).toString());
            window.location.reload();
          }
        },
        { label: 'Preferences...', icon: '⚙', onClick: () => alert('Preferences') },
      ] as MenuItem[]
    },
    {
      name: 'View',
      altKey: 'v',
      items: [
        { label: 'Fullscreen', icon: '🖥', shortcut: 'F11', onClick: () => onActionCommand('fullscreen') },
        { label: 'Fit to Window', icon: '◧', onClick: () => onActionCommand('fit') },
        { label: 'Actual Size', icon: '🔍', onClick: () => onActionCommand('actualSize') },
        { label: 'Zoom In', icon: '➕', shortcut: 'Ctrl++', onClick: () => onActionCommand('zoomIn') },
        { label: 'Zoom Out', icon: '➖', shortcut: 'Ctrl+-', onClick: () => onActionCommand('zoomOut') },
        { label: 'Reset Zoom', icon: '🔄', onClick: () => onActionCommand('resetZoom') },
        { type: 'separator' as const },
        { label: 'Toggle Left Panel', icon: '📁', checked: leftSidebarOpen, onClick: () => setLeftSidebarOpen(!leftSidebarOpen) },
        { label: 'Toggle Right Panel', icon: '🏷', checked: rightSidebarOpen, onClick: () => setRightSidebarOpen(!rightSidebarOpen) },
        { label: 'Toggle Toolbar', icon: '🛠', checked: toolbarOpen, onClick: () => setToolbarOpen(!toolbarOpen) },
        { label: 'Toggle Metadata Panel', icon: '📊', checked: metadataOverlayOpen, onClick: () => setMetadataOverlayOpen(!metadataOverlayOpen) },
      ] as MenuItem[]
    },
    {
      name: '2D',
      altKey: '2',
      items: [
        { label: 'Zoom', icon: '🔍', checked: activeTool === 'zoom', onClick: () => setActiveTool('zoom') },
        { label: 'Pan', icon: '✋', checked: activeTool === 'pan', onClick: () => setActiveTool('pan') },
        { label: 'Window / Level', icon: '🖐', checked: activeTool === 'wl', onClick: () => setActiveTool('wl') },
        { label: 'Magnifier', icon: '🎯', checked: activeTool === 'magnifier', onClick: () => setActiveTool('magnifier') },
        { label: 'Crosshair', icon: '➕', checked: activeTool === 'crosshair', onClick: () => setActiveTool('crosshair') },
        { type: 'separator' as const },
        { label: 'Distance', icon: '📏', checked: activeTool === 'length', onClick: () => setActiveTool('length') },
        { label: 'Angle', icon: '📐', checked: activeTool === 'angle', onClick: () => setActiveTool('angle') },
        { label: 'Circle ROI', icon: '⭕', checked: activeTool === 'ellipse', onClick: () => setActiveTool('ellipse') },
        { label: 'Rectangle ROI', icon: '⬜', checked: activeTool === 'rect', onClick: () => setActiveTool('rect') },
        { label: 'Freehand ROI', icon: '✍', checked: activeTool === 'freehand', onClick: () => setActiveTool('freehand') },
        { label: 'Pixel Probe', icon: '📊', checked: activeTool === 'pixel_probe', onClick: () => setActiveTool('pixel_probe') },
        { type: 'separator' as const },
        { label: 'Invert Image', icon: '🌗', onClick: () => onActionCommand('invert') },
        { 
          label: 'Color Maps', 
          icon: '🌈', 
          submenu: [
            { label: 'Grayscale (Default)', onClick: () => onActionCommand('colormap:grayscale') },
            { label: 'Hot Iron', onClick: () => onActionCommand('colormap:hot') },
            { label: 'Rainbow / PET', onClick: () => onActionCommand('colormap:rainbow') }
          ]
        },
        { type: 'separator' as const },
        { label: 'Reset Active View', icon: '🔄', onClick: () => onActionCommand('reset') },
        { label: 'Reset All Viewports', icon: '🔄', onClick: () => onActionCommand('reset_all') },
        { label: 'Clear Measurements', icon: '🧹', onClick: () => onActionCommand('clearMeasurements') },
      ] as MenuItem[]
    },
    {
      name: '3D',
      altKey: '3',
      items: [
        { 
          label: 'MPR', 
          icon: '🧠', 
          checked: active3DMode === 'mpr', 
          onClick: () => { 
            onActionCommand('mpr'); 
            setActive3DMode(active3DMode === 'mpr' ? '2d' : 'mpr'); 
          } 
        },
        { 
          label: 'MIP', 
          icon: '🖥', 
          checked: active3DMode === 'mip', 
          onClick: () => { 
            onActionCommand('mip'); 
            setActive3DMode(active3DMode === 'mip' ? '2d' : 'mip'); 
          } 
        },
        { 
          label: 'MinIP', 
          icon: '🌈', 
          checked: active3DMode === 'minip', 
          onClick: () => setActive3DMode(active3DMode === 'minip' ? '2d' : 'minip') 
        },
        { 
          label: 'Volume Rendering', 
          icon: '📦', 
          checked: active3DMode === 'volume', 
          onClick: () => { 
            onActionCommand('vr'); 
            setActive3DMode(active3DMode === 'volume' ? '2d' : 'volume'); 
          } 
        },
        { 
          label: 'Surface Rendering', 
          icon: '🗿', 
          checked: active3DMode === 'surface', 
          onClick: () => setActive3DMode(active3DMode === 'surface' ? '2d' : 'surface') 
        },
        { type: 'separator' as const },
        { 
          label: 'Curved MPR', 
          icon: '🪄', 
          onClick: () => onActionCommand('cpr') 
        },
        { label: 'Oblique MPR', icon: '📊', onClick: () => alert('Oblique MPR') },
        { label: '3D Reconstruction', icon: '🔄', onClick: () => alert('3D Reconstruction') },
        { type: 'separator' as const },
        { label: '3D Rendering Settings', icon: '⚙', onClick: () => alert('3D Rendering Settings') },
      ] as MenuItem[]
    },
    {
      name: 'R.O.I.',
      altKey: 'r',
      items: [
        { label: 'Rectangle ROI', icon: '⬜', checked: activeTool === 'rect', onClick: () => setActiveTool('rect') },
        { label: 'Ellipse ROI', icon: '⭕', checked: activeTool === 'ellipse', onClick: () => setActiveTool('ellipse') },
        { label: 'Polygon ROI', icon: '🔺', checked: activeTool === 'polygon', onClick: () => setActiveTool('polygon') },
        { label: 'Freehand ROI', icon: '✍', checked: activeTool === 'freehand', onClick: () => setActiveTool('freehand') },
        { type: 'separator' as const },
        { label: 'Length', icon: '📏', checked: activeTool === 'length', onClick: () => setActiveTool('length') },
        { label: 'Angle', icon: '📐', checked: activeTool === 'angle', onClick: () => setActiveTool('angle') },
        { label: 'Point', icon: '📍', checked: activeTool === 'point', onClick: () => setActiveTool('point') },
        { label: 'Area', icon: '🧮', checked: activeTool === 'area', onClick: () => setActiveTool('area') },
        { type: 'separator' as const },
        { label: 'Text Annotation', icon: '📝', checked: activeTool === 'text', onClick: () => setActiveTool('text') },
        { label: 'Arrow Annotation', icon: '🏷', checked: activeTool === 'arrow', onClick: () => setActiveTool('arrow') },
        { type: 'separator' as const },
        { label: 'Delete ROI', icon: '🗑', onClick: () => onActionCommand('deleteSelected') },
        { label: 'Clear All ROIs', icon: '🧹', onClick: () => onActionCommand('clearMeasurements') },
      ] as MenuItem[]
    },
    {
      name: 'Plugins',
      altKey: 'p',
      items: !pluginsLoaded 
        ? [{ label: 'Loading plugins...', disabled: true }]
        : [
            { label: 'Plugin Manager...', icon: '🧩', onClick: () => alert('Plugins Manager') },
            { type: 'separator' as const },
            { label: 'AI Segmentation', icon: '📈', onClick: () => alert('Plugin: AI Segmentation') },
            { label: 'Cardiac Analysis', icon: '🫀', onClick: () => alert('Plugin: Cardiac Analysis') },
            { label: 'Brain Analysis', icon: '🧠', onClick: () => alert('Plugin: Brain Analysis') },
            { label: 'Bone Density', icon: '🦴', onClick: () => alert('Plugin: Bone Density') },
            { type: 'separator' as const },
            { label: 'Install Plugin...', icon: '⬇', onClick: () => alert('Install Plugin') },
            { label: 'Update Plugins...', icon: '🔄', onClick: () => alert('Update Plugins') }
          ] as MenuItem[]
    },
    {
      name: 'Recent Studies',
      altKey: 's',
      items: getRecentSubmenuItems()
    },
    {
      name: 'Window',
      altKey: 'w',
      items: isElectron 
        ? [
            { label: 'Minimize', icon: '➖', onClick: () => (window as any).electronAPI.minimize() },
            { label: 'Maximize', icon: '⬜', onClick: () => (window as any).electronAPI.maximize() },
            { label: 'Restore Window', icon: '🗖', onClick: () => (window as any).electronAPI.maximize() },
            { type: 'separator' as const },
            { label: 'Close Window', icon: '❌', onClick: () => (window as any).electronAPI.close() }
          ]
        : [
            { label: 'Minimize (Desktop Only)', icon: '➖', disabled: true },
            { label: 'Maximize (Desktop Only)', icon: '⬜', disabled: true },
            { label: 'Close Window (Desktop Only)', icon: '❌', disabled: true }
          ] as MenuItem[]
    },
    {
      name: 'Help',
      altKey: 'h',
      items: [
        { label: 'About MedView PRO', icon: 'ℹ', onClick: () => setActiveModal('about') },
        { label: 'Keyboard Shortcuts', icon: '⌨', onClick: () => setActiveModal('shortcuts') },
        { type: 'separator' as const },
        { label: 'User Guide', icon: '📖', onClick: () => alert('Opening local User Guide...') },
        { label: 'Report Bug', icon: '🐞', onClick: () => alert('Redirecting to support portal...') },
        { label: 'Check for Updates', icon: '🔄', onClick: () => alert('You are running the latest version.') }
      ] as MenuItem[]
    }
  ];

  // Alt shortcuts listener
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (e.altKey) {
        const matchingIndex = menus.findIndex(m => m.altKey === e.key.toLowerCase());
        if (matchingIndex !== -1) {
          e.preventDefault();
          setOpenMenuIndex(matchingIndex);
          setFocusedItemIndex(0);
          setActiveSubmenuIndex(-1);
          setFocusedSubmenuItemIndex(-1);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [menus]);

  // Dropdown list Keyboard Controller (Arrow keys, Escape, Enter, Tab, Home, End)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (openMenuIndex === null) return;

      const activeMenuItems = menus[openMenuIndex].items;
      const totalItems = activeMenuItems.length;

      let activeSubmenuItems: MenuItem[] = [];
      if (activeSubmenuIndex !== -1 && activeMenuItems[activeSubmenuIndex].submenu) {
        activeSubmenuItems = activeMenuItems[activeSubmenuIndex].submenu!;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (activeSubmenuIndex === -1 && activeMenuItems[focusedItemIndex]?.submenu) {
            setActiveSubmenuIndex(focusedItemIndex);
            setFocusedSubmenuItemIndex(0);
          } else {
            const nextIndex = (openMenuIndex + 1) % menus.length;
            setOpenMenuIndex(nextIndex);
            setFocusedItemIndex(0);
            setActiveSubmenuIndex(-1);
            setFocusedSubmenuItemIndex(-1);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            setActiveSubmenuIndex(-1);
            setFocusedSubmenuItemIndex(-1);
          } else {
            const prevIndex = (openMenuIndex - 1 + menus.length) % menus.length;
            setOpenMenuIndex(prevIndex);
            setFocusedItemIndex(0);
            setActiveSubmenuIndex(-1);
            setFocusedSubmenuItemIndex(-1);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            let nextSubIdx = focusedSubmenuItemIndex + 1;
            while (nextSubIdx < activeSubmenuItems.length && activeSubmenuItems[nextSubIdx].type === 'separator') {
              nextSubIdx++;
            }
            if (nextSubIdx >= activeSubmenuItems.length) nextSubIdx = 0;
            setFocusedSubmenuItemIndex(nextSubIdx);
          } else {
            let nextIdx = focusedItemIndex + 1;
            while (nextIdx < totalItems && activeMenuItems[nextIdx].type === 'separator') {
              nextIdx++;
            }
            if (nextIdx >= totalItems) nextIdx = 0;
            setFocusedItemIndex(nextIdx);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            let prevSubIdx = focusedSubmenuItemIndex - 1;
            while (prevSubIdx >= 0 && activeSubmenuItems[prevSubIdx].type === 'separator') {
              prevSubIdx--;
            }
            if (prevSubIdx < 0) prevSubIdx = activeSubmenuItems.length - 1;
            setFocusedSubmenuItemIndex(prevSubIdx);
          } else {
            let prevIdx = focusedItemIndex - 1;
            while (prevIdx >= 0 && activeMenuItems[prevIdx].type === 'separator') {
              prevIdx--;
            }
            if (prevIdx < 0) prevIdx = totalItems - 1;
            setFocusedItemIndex(prevIdx);
          }
          break;

        case 'Enter':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            const subitem = activeSubmenuItems[focusedSubmenuItemIndex];
            if (subitem && !subitem.disabled && subitem.onClick) {
              subitem.onClick();
              closeAllMenus();
            }
          } else {
            const item = activeMenuItems[focusedItemIndex];
            if (item) {
              if (item.submenu) {
                setActiveSubmenuIndex(focusedItemIndex);
                setFocusedSubmenuItemIndex(0);
              } else if (!item.disabled && item.onClick) {
                item.onClick();
                closeAllMenus();
              }
            }
          }
          break;

        case 'Escape':
          e.preventDefault();
          closeAllMenus();
          break;

        case 'Tab':
          closeAllMenus();
          break;

        case 'Home':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            setFocusedSubmenuItemIndex(0);
          } else {
            setFocusedItemIndex(0);
          }
          break;

        case 'End':
          e.preventDefault();
          if (activeSubmenuIndex !== -1) {
            setFocusedSubmenuItemIndex(activeSubmenuItems.length - 1);
          } else {
            setFocusedItemIndex(totalItems - 1);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenuIndex, focusedItemIndex, activeSubmenuIndex, focusedSubmenuItemIndex, menus]);

  const handleMenuClick = (index: number) => {
    if (openMenuIndex === index) {
      closeAllMenus();
    } else {
      setOpenMenuIndex(index);
      setFocusedItemIndex(0);
      setActiveSubmenuIndex(-1);
      setFocusedSubmenuItemIndex(-1);
    }
  };

  const handleMenuMouseEnter = (index: number) => {
    if (openMenuIndex !== null) {
      setOpenMenuIndex(index);
      setFocusedItemIndex(0);
      setActiveSubmenuIndex(-1);
      setFocusedSubmenuItemIndex(-1);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.submenu) return;
    if (item.onClick) item.onClick();
    closeAllMenus();
  };

  // Electron Window Operations
  const handleMinimize = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.minimize();
    } else {
      // Browser fallback: show a brief visual notification
      setMinimizeNotif(true);
      setTimeout(() => setMinimizeNotif(false), 2000);
    }
  };

  const handleMaximize = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.maximize();
    } else {
      // Browser fallback: toggle fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => console.log(err));
        setIsMaximized(true);
      } else {
        document.exitFullscreen().catch((err) => console.log(err));
        setIsMaximized(false);
      }
    }
  };

  const handleClose = () => {
    if ((window as any).electronAPI) {
      (window as any).electronAPI.close();
    } else {
      // Browser fallback: close the active study and navigate to root
      onActionCommand('closeStudy');
      window.history.pushState({}, '', '/');
    }
  };

  // Calculate Titlebar Details
  const getTitleContent = () => {
    if (!pacsStudy) return 'MedView PRO';
    const patientName = pacsStudy.patientName || 'Anonymous';
    const studyDesc = pacsStudy.studyDescription || 'DICOM Study';
    const seriesNum = activeStats?.seriesNumber || 1;
    const imageIndex = activeStats?.imageIndex || 1;
    const totalImages = activeStats?.totalImages || 1;
    return `${patientName} | ${studyDesc} | Series ${seriesNum} | Image ${imageIndex}/${totalImages}`;
  };

  return (
    <div 
      ref={containerRef}
      className="drag-region flex items-center justify-between h-[32px] w-full bg-titlebar-bg border-b border-titlebar-border select-none text-text-primary px-0 overflow-visible transition-subtle z-50 relative"
      role="menubar"
      aria-label="Workstation Application Bar"
    >
      
      {/* SECTION 1 - Application Identity */}
      <div className="flex items-center no-drag-region ml-2 shrink-0 gap-[6px]">
        <img src={logo} alt="Meril Logo" style={{ height: '22px', width: 'auto', display: 'block' }} />
      </div>

      {/* SECTION 2 - Desktop Menu */}
      <div 
        className="flex items-center gap-[12px] ml-3 no-drag-region shrink-0"
        onMouseLeave={closeAllMenus}
      >
        {menus.map((menu, mIndex) => {
          const isOpen = openMenuIndex === mIndex;
          return (
            <div key={menu.name} className="relative">
              <button
                onClick={() => handleMenuClick(mIndex)}
                onMouseEnter={() => handleMenuMouseEnter(mIndex)}
                className={`px-2 py-0.5 rounded-[4px] cursor-pointer outline-none transition-subtle font-medium text-[13px] no-drag-region ${
                  isOpen 
                    ? 'bg-[#3A3A3A] text-white font-semibold' 
                    : 'text-[#E5E5E5] hover:bg-[#3A3A3A] hover:text-white'
                }`}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={isOpen ? 'true' : 'false'}
              >
                {menu.name}
              </button>

              {isOpen && (
                <div 
                  className="absolute left-0 top-[26px] z-50 min-w-[220px] max-w-[340px] bg-dropdown-bg border border-dropdown-border rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1 no-scrollbar overflow-visible"
                  role="menu"
                  aria-label={`${menu.name} Menu`}
                >
                  {menu.items.map((item, iIndex) => {
                    if (item.type === 'separator') {
                      return <div key={`sep-${iIndex}`} className="h-[1px] bg-[#3A3A3A] my-1" />;
                    }

                    const isItemFocused = focusedItemIndex === iIndex;
                    const isSubOpen = activeSubmenuIndex === iIndex;

                    return (
                      <div 
                        key={`${item.label}-${iIndex}`}
                        className="relative"
                        onMouseEnter={() => {
                          setFocusedItemIndex(iIndex);
                          if (item.submenu) {
                            setActiveSubmenuIndex(iIndex);
                            setFocusedSubmenuItemIndex(-1);
                          } else {
                            setActiveSubmenuIndex(-1);
                            setFocusedSubmenuItemIndex(-1);
                          }
                        }}
                      >
                        <button
                          onClick={() => handleItemClick(item)}
                          disabled={item.disabled}
                          className={`w-full flex items-center justify-between min-h-[28px] py-1 px-3 text-left text-[13px] transition-subtle cursor-default outline-none ${
                            item.disabled 
                              ? 'text-[#666666]' 
                              : isItemFocused 
                                ? 'bg-[#007ACC] text-white' 
                                : 'text-text-primary'
                          }`}
                          role="menuitem"
                          aria-disabled={item.disabled}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-[14px] h-[14px] flex items-center justify-center font-mono shrink-0">
                              {item.checked !== undefined ? (
                                item.checked ? (
                                  <span className="text-[11px] font-bold text-green-500">✓</span>
                                ) : null
                              ) : (
                                item.icon || null
                              )}
                            </div>
                            <span className="font-sans truncate" title={item.label}>{item.label}</span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-[#888888] font-mono-numbers pl-4 shrink-0">
                            {item.shortcut && <span className={`${isItemFocused ? 'text-white/80' : ''}`}>{item.shortcut}</span>}
                            {item.submenu && <ChevronRight className="w-3 h-3 text-[#aaaaaa]" />}
                          </div>
                        </button>

                        {/* Nested Submenus */}
                        {item.submenu && isSubOpen && (
                          <div 
                            className="absolute left-full top-0 ml-[2px] z-[60] min-w-[220px] max-w-[340px] bg-dropdown-bg border border-dropdown-border rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1"
                            role="menu"
                          >
                            {item.submenu.map((subitem, sIndex) => {
                              if (subitem.type === 'separator') {
                                return <div key={`subsep-${sIndex}`} className="h-[1px] bg-[#3A3A3A] my-1" />;
                              }

                              const isSubItemFocused = focusedSubmenuItemIndex === sIndex;

                              return (
                                <button
                                  key={`${subitem.label}-${sIndex}`}
                                  onClick={() => {
                                    if (!subitem.disabled && subitem.onClick) {
                                      subitem.onClick();
                                    }
                                    closeAllMenus();
                                  }}
                                  disabled={subitem.disabled}
                                  className={`w-full flex items-center justify-between min-h-[28px] py-1 px-3 text-left text-[13px] transition-subtle cursor-default outline-none ${
                                    subitem.disabled 
                                      ? 'text-[#666666]' 
                                      : isSubItemFocused 
                                        ? 'bg-[#007ACC] text-white' 
                                        : 'text-text-primary'
                                  }`}
                                  role="menuitem"
                                  onMouseEnter={() => setFocusedSubmenuItemIndex(sIndex)}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-[14px] h-[14px] flex items-center justify-center font-mono shrink-0">
                                      {subitem.checked !== undefined ? (
                                        subitem.checked ? (
                                          <span className="text-[11px] font-bold text-green-500">✓</span>
                                        ) : null
                                      ) : (
                                        subitem.icon || null
                                      )}
                                    </div>
                                    <span className="font-sans truncate" title={subitem.label}>{subitem.label}</span>
                                  </div>
                                  
                                  {subitem.shortcut && (
                                    <span className={`text-[11px] text-[#888888] font-mono-numbers pl-4 ${isSubItemFocused ? 'text-white/80' : ''} shrink-0`}>
                                      {subitem.shortcut}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SECTION 2.5 - Flexible spacer (title removed per design update) */}
      <div className="flex-1 min-w-[8px] h-full flex items-center justify-center pointer-events-none">
        {readOnly && (
          <span className="bg-[#EF4444] text-white text-[9.5px] font-sans font-bold px-2 py-0.5 rounded shadow-[0_2px_8px_rgba(0,0,0,0.5)] tracking-wider select-none animate-pulse">
            READ ONLY
          </span>
        )}
      </div>

      {/* SECTION 3 - Global Controls */}
      <div className="flex items-center gap-[12px] h-full no-drag-region shrink-0 pr-3 z-10">
        
        {/* Layout Selector */}
        <div className="relative" ref={layoutRef}>
          <button 
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className="flex items-center h-[24px] px-2 text-[12px] font-medium text-text-secondary hover:bg-hover-bg rounded-[4px] cursor-pointer transition-subtle no-drag-region"
          >
            Layout <span className="ml-1 text-[9px]">▼</span>
          </button>
          
          {showLayoutMenu && (
            <div className="absolute right-0 top-[28px] z-50 min-w-[140px] bg-dropdown-bg border border-dropdown-border rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1 text-[12px] text-text-primary">
              {['1x1 Single', '1x2 Split', '2x2 Quad', '3x3 Matrix'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setLayout(opt);
                    setShowLayoutMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-[#007ACC] hover:text-white transition-subtle flex items-center justify-between ${
                    layout === opt ? 'bg-hover-bg font-semibold' : ''
                  }`}
                >
                  <span>{opt}</span>
                  {layout === opt && <span className="text-[10px] text-green-500">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button 
          title="Notifications"
          className="flex items-center justify-center p-[6px] text-text-secondary hover:bg-[#2D2D2D] rounded-[4px] cursor-pointer transition-subtle no-drag-region"
        >
          <Bell className="w-4 h-4 text-text-secondary" />
        </button>

        {/* Settings */}
        <div className="relative" ref={settingsRef}>
          <button 
            title="Settings & Themes"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            className="flex items-center justify-center p-[6px] text-text-secondary hover:bg-[#2D2D2D] rounded-[4px] cursor-pointer transition-subtle no-drag-region"
          >
            <Settings className="w-4 h-4 text-text-secondary" />
          </button>

          {showSettingsMenu && (
            <div className="absolute right-0 top-[28px] z-50 min-w-[180px] bg-dropdown-bg border border-dropdown-border rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] py-1 text-[12px] text-text-primary">
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-secondary font-bold border-b border-border-color mb-1">
                Appearance
              </div>
              <button
                onClick={() => {
                  setTheme('dark');
                  setShowSettingsMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-[#007ACC] hover:text-white transition-subtle flex items-center justify-between ${
                  currentTheme === 'dark' ? 'font-semibold bg-hover-bg' : ''
                }`}
              >
                <span>Dark PACS Workstation</span>
                {currentTheme === 'dark' && <span className="text-[10px]">✓</span>}
              </button>
              <button
                onClick={() => {
                  setTheme('light');
                  setShowSettingsMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-[#007ACC] hover:text-white transition-subtle flex items-center justify-between ${
                  currentTheme === 'light' ? 'font-semibold bg-hover-bg' : ''
                }`}
              >
                <span>Light Clinician View</span>
                {currentTheme === 'light' && <span className="text-[10px]">✓</span>}
              </button>
            </div>
          )}
        </div>

        {/* User Profile */}
        <button 
          title="User Account"
          className="flex items-center justify-center w-6 h-6 rounded-full bg-[#3B82F6] hover:brightness-105 cursor-pointer text-white font-sans text-[12px] font-semibold transition-subtle no-drag-region mr-2"
        >
          DR
        </button>

      </div>

      {/* SECTION 4 - Window Controls (Far Right) */}
      <div className="flex items-center h-full no-drag-region shrink-0">

        {/* Minimize notification toast (browser-only fallback) */}
        {minimizeNotif && (
          <div className="absolute top-[36px] right-[80px] z-[9999] bg-[#1E1E1E] border border-[#3A3A3A] text-white text-[11px] font-sans px-3 py-1.5 rounded-[4px] shadow-lg pointer-events-none animate-in fade-in slide-in-from-top-1 duration-150">
            Minimize is only available in the Desktop app
          </div>
        )}

        <button 
          id="btn-window-minimize"
          title={isElectron ? 'Minimize' : 'Minimize (Desktop app only)'}
          onClick={handleMinimize}
          className="flex items-center justify-center w-[46px] h-[32px] text-text-secondary hover:bg-window-other-hover transition-subtle no-drag-region"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        
        <button 
          id="btn-window-maximize"
          title={isMaximized ? 'Restore Window' : (isElectron ? 'Maximize' : 'Toggle Fullscreen')}
          onClick={handleMaximize}
          className="flex items-center justify-center w-[46px] h-[32px] text-text-secondary hover:bg-window-other-hover transition-subtle no-drag-region"
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path fill="none" stroke="currentColor" strokeWidth="1" d="M3,1 L9,1 L9,7 M1,3 L7,3 L7,9 L1,9 Z" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect fill="none" stroke="currentColor" strokeWidth="1" x="1" y="1" width="8" height="8" />
            </svg>
          )}
        </button>

        <button 
          id="btn-window-close"
          title={isElectron ? 'Close Application' : 'Close Study'}
          onClick={handleClose}
          className="flex items-center justify-center w-[46px] h-[32px] text-text-secondary hover:bg-[#E81123] hover:text-white transition-subtle no-drag-region"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path fill="none" stroke="currentColor" strokeWidth="1" d="M1,1 L9,9 M9,1 L1,9" />
          </svg>
        </button>
      </div>

      {/* ==================== CUSTOM MODALS ==================== */}

      {/* ABOUT MODAL */}
      {activeModal === 'about' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-[2px] pointer-events-auto">
          <div className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-[0_12px_36px_rgba(0,0,0,0.6)] w-[400px] overflow-hidden text-left font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 bg-[#15181E] border-b border-[#353C48]">
              <span className="text-[14px] font-bold text-white uppercase tracking-wider">About MedView PRO</span>
              <button 
                onClick={() => setActiveModal(null)}
                className="text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col items-center text-center gap-4">
              <div className="flex items-center justify-center w-[48px] h-[48px] bg-[#3B82F6]/10 rounded-full border border-[#3B82F6]/30">
                <svg width="24" height="24" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="7.2" y="1.8" width="3.6" height="14.4" rx="0.9" fill="#3B82F6"/>
                  <rect x="1.8" y="7.2" width="14.4" height="3.6" rx="0.9" fill="#3B82F6"/>
                  <circle cx="9" cy="9" r="8.1" stroke="#3B82F6" strokeWidth="1.2" strokeDasharray="3 2" fill="none"/>
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-[18px] font-bold text-white tracking-wide">MedView PRO Workstation</h3>
                <span className="text-[12px] text-[#8B949E] font-medium font-mono">
                  {isElectron ? 'Desktop Workstation' : 'Web Browser Workstation'}
                </span>
                <span className="text-[12px] text-[#A8A8A8] font-mono mt-1">Version: 1.4.2 (Production Build)</span>
              </div>
              <p className="text-[12.5px] text-[#8B949E] leading-relaxed max-w-[320px] mt-2">
                A professional-grade, diagnostic-capable medical imaging viewer supporting PACS connectivity, hanging protocols, ROI annotations, and multi-planar reformations.
              </p>
              <div className="w-full h-[1px] bg-[#353C48]/50 my-2" />
              <span className="text-[11px] text-[#666666]">
                Copyright © 2026 MedView Team. All rights reserved.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS MODAL */}
      {activeModal === 'shortcuts' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-[2px] pointer-events-auto">
          <div className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-[0_12px_36px_rgba(0,0,0,0.6)] w-[460px] overflow-hidden text-left font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 bg-[#15181E] border-b border-[#353C48]">
              <span className="text-[14px] font-bold text-white uppercase tracking-wider">Keyboard Shortcuts Guide</span>
              <button 
                onClick={() => setActiveModal(null)}
                className="text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[400px] no-scrollbar">
              <div className="flex flex-col gap-2.5">
                {[
                  { section: 'Global Actions', keys: [
                    { k: 'Ctrl + O', desc: 'Open Study / DICOM Files' },
                    { k: 'Ctrl + S', desc: 'Export ZIP Study Archive' },
                    { k: 'Ctrl + P', desc: 'Print Viewer Screen' },
                    { k: 'F11', desc: 'Toggle Fullscreen Mode' },
                    { k: 'Esc', desc: 'Exit Fullscreen / Cancel Drawings' }
                  ]},
                  { section: 'Viewer Tools Activation', keys: [
                    { k: 'P', desc: 'Activate Pan Tool' },
                    { k: 'Z', desc: 'Activate Zoom Tool' },
                    { k: 'W', desc: 'Activate Window / Level (Contrast) Tool' },
                    { k: 'S', desc: 'Activate Stack Scroll Tool' },
                    { k: 'L', desc: 'Distance / Length Caliper' },
                    { k: 'A', desc: 'Angle Measurement Tool' },
                    { k: 'R', desc: 'Rectangle ROI Tool' },
                    { k: 'E', desc: 'Ellipse ROI Tool' },
                    { k: 'T', desc: 'Text Annotation Tool' },
                    { k: 'F', desc: 'Freehand Drawing Tool' }
                  ]},
                  { section: 'History & Editing', keys: [
                    { k: 'Ctrl + Z', desc: 'Undo Annotation action' },
                    { k: 'Ctrl + Y', desc: 'Redo Annotation action' },
                    { k: 'Delete / Backspace', desc: 'Delete Selected Annotation' },
                    { k: 'Ctrl + Plus (+)', desc: 'Zoom In Viewport' },
                    { k: 'Ctrl + Minus (-)', desc: 'Zoom Out Viewport' }
                  ]}
                ].map((sec) => (
                  <div key={sec.section} className="flex flex-col gap-1.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#3B82F6] border-b border-[#353C48]/50 pb-1 mt-1">
                      {sec.section}
                    </h4>
                    <div className="flex flex-col gap-1">
                      {sec.keys.map((pair) => (
                        <div key={pair.k} className="flex justify-between items-center text-[12px] py-0.5">
                          <span className="text-[#C9D1D9]">{pair.desc}</span>
                          <kbd className="bg-[#15181E] border border-[#353C48] rounded px-1.5 py-0.5 font-mono text-[10.5px] text-white font-bold tracking-tight">
                            {pair.k}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
