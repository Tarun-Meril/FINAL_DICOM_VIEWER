import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Crosshair, Sliders, Maximize, RotateCcw, Move, ZoomIn, Eye, Sparkles, AlertTriangle, Layers } from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface ClinicalServerMPRViewProps {
  studyUID: string;
  seriesUID?: string;
  onClose?: () => void;
  onSwitchToWebGL?: () => void;
  hasWebGLError?: boolean;
}

interface VolumeInfo {
  status: string;
  studyUid: string;
  seriesUid: string;
  patientName: string;
  patientId: string;
  modality: string;
  dimensions: {
    axial: number;
    coronal: number;
    sagittal: number;
  };
  spacing: [number, number, number];
  windowCenter: number;
  windowWidth: number;
}

const PRESETS: Record<string, { wc: number; ww: number }> = {
  'Abdomen / Soft': { wc: 40, ww: 400 },
  'Bone': { wc: 300, ww: 1500 },
  'Lung': { wc: -600, ww: 1500 },
  'Brain': { wc: 40, ww: 100 },
  'Mediastinum': { wc: 50, ww: 350 },
  'Linear (Full)': { wc: 500, ww: 2000 },
};

export const ClinicalServerMPRView: React.FC<ClinicalServerMPRViewProps> = ({
  studyUID,
  seriesUID,
  onClose,
  onSwitchToWebGL,
  hasWebGLError = false,
}) => {
  const [activeSeries, setActiveSeries] = useState<string>(seriesUID || '');
  const [volInfo, setVolInfo] = useState<VolumeInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active slice indices for the 3 orthogonal planes
  const [axialSlice, setAxialSlice] = useState<number>(0);
  const [coronalSlice, setCoronalSlice] = useState<number>(0);
  const [sagittalSlice, setSagittalSlice] = useState<number>(0);

  // Windowing state
  const [wc, setWc] = useState<number>(40);
  const [ww, setWw] = useState<number>(400);
  const [activePreset, setActivePreset] = useState<string>('Abdomen / Soft');

  // Display toggles
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<'crosshair' | 'wl' | 'zoom' | 'pan'>('crosshair');
  const [layout, setLayout] = useState<'all' | 'axial' | 'coronal' | 'sagittal'>('all');

  // Zoom / Pan states per viewport
  const [zoom, setZoom] = useState<Record<string, number>>({ axial: 1, coronal: 1, sagittal: 1 });
  const [pan, setPan] = useState<Record<string, { x: number; y: number }>>({
    axial: { x: 0, y: 0 },
    coronal: { x: 0, y: 0 },
    sagittal: { x: 0, y: 0 },
  });

  // Cached blob URLs to completely bypass COEP and avoid any network blocking
  const [sliceBlobUrls, setSliceBlobUrls] = useState<Record<string, string>>({
    axial: '',
    coronal: '',
    sagittal: '',
  });

  const dragRef = useRef<{
    plane: 'axial' | 'coronal' | 'sagittal';
    startX: number;
    startY: number;
    startWc: number;
    startWw: number;
    startPanX: number;
    startPanY: number;
    startZoom: number;
  } | null>(null);

  // Sync activeSeries when prop changes
  useEffect(() => {
    if (seriesUID) setActiveSeries(seriesUID);
  }, [seriesUID]);

  // Fetch volume info on mount or series change
  useEffect(() => {
    let cancelled = false;
    async function fetchInfo() {
      try {
        setLoading(true);
        setError(null);
        const url = `${API_BASE_URL}/api/mpr/info?study_uid=${encodeURIComponent(studyUID)}&series_uid=${encodeURIComponent(activeSeries)}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (onSwitchToWebGL) {
            console.warn(`[MPR] Server endpoint unavailable (HTTP ${res.status}) — switching to client-side WebGL engine`);
            onSwitchToWebGL();
            return;
          }
          throw new Error(`Failed to load volume metadata: HTTP ${res.status}`);
        }
        const data: VolumeInfo = await res.json();
        if (cancelled) return;
        setVolInfo(data);
        if (data.seriesUid && data.seriesUid !== activeSeries) {
          setActiveSeries(data.seriesUid);
        }
        setWc(data.windowCenter || 40);
        setWw(data.windowWidth || 400);
        setAxialSlice(Math.floor((data.dimensions.axial || 100) / 2));
        setCoronalSlice(Math.floor((data.dimensions.coronal || 512) / 2));
        setSagittalSlice(Math.floor((data.dimensions.sagittal || 512) / 2));
      } catch (err: any) {
        if (!cancelled) {
          if (onSwitchToWebGL) {
            console.warn('[MPR] Server MPR failed with exception — falling back to WebGL engine:', err);
            onSwitchToWebGL();
            return;
          }
          setError(err.message || 'Error initializing MPR engine');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchInfo();
    return () => {
      cancelled = true;
    };
  }, [studyUID, activeSeries]);

  // Load slice blob URLs via fetch to ensure 100% COEP/CORS compliance
  const loadSliceBlob = useCallback(
    async (plane: 'axial' | 'coronal' | 'sagittal', sliceIdx: number) => {
      if (!volInfo) return;
      const sUid = activeSeries || volInfo.seriesUid || '';
      const url = `${API_BASE_URL}/api/mpr/slice?study_uid=${encodeURIComponent(studyUID)}&series_uid=${encodeURIComponent(sUid)}&plane=${plane}&slice=${sliceIdx}&wc=${wc}&ww=${ww}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          setSliceBlobUrls((prev) => {
            if (prev[plane]) {
              try { URL.revokeObjectURL(prev[plane]); } catch {}
            }
            return { ...prev, [plane]: objectUrl };
          });
        }
      } catch (e) {
        console.warn(`[MPR] Error fetching ${plane} slice:`, e);
      }
    },
    [studyUID, activeSeries, volInfo, wc, ww]
  );

  // Trigger slice fetches when coordinates or windowing change
  useEffect(() => {
    if (volInfo) loadSliceBlob('axial', axialSlice);
  }, [axialSlice, wc, ww, volInfo, loadSliceBlob]);

  useEffect(() => {
    if (volInfo) loadSliceBlob('coronal', coronalSlice);
  }, [coronalSlice, wc, ww, volInfo, loadSliceBlob]);

  useEffect(() => {
    if (volInfo) loadSliceBlob('sagittal', sagittalSlice);
  }, [sagittalSlice, wc, ww, volInfo, loadSliceBlob]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(sliceBlobUrls).forEach((url) => {
        if (url) {
          try { URL.revokeObjectURL(url); } catch {}
        }
      });
    };
  }, []);

  const handlePresetChange = (name: string) => {
    setActivePreset(name);
    if (PRESETS[name]) {
      setWc(PRESETS[name].wc);
      setWw(PRESETS[name].ww);
    }
  };

  const handleWheel = (plane: 'axial' | 'coronal' | 'sagittal', e: React.WheelEvent) => {
    e.preventDefault();
    if (!volInfo) return;
    const delta = e.deltaY > 0 ? 1 : -1;
    if (plane === 'axial') {
      const max = (volInfo.dimensions.axial || 1) - 1;
      setAxialSlice((prev) => Math.max(0, Math.min(max, prev + delta)));
    } else if (plane === 'coronal') {
      const max = (volInfo.dimensions.coronal || 1) - 1;
      setCoronalSlice((prev) => Math.max(0, Math.min(max, prev + delta)));
    } else {
      const max = (volInfo.dimensions.sagittal || 1) - 1;
      setSagittalSlice((prev) => Math.max(0, Math.min(max, prev + delta)));
    }
  };

  const handleReset = () => {
    setZoom({ axial: 1, coronal: 1, sagittal: 1 });
    setPan({
      axial: { x: 0, y: 0 },
      coronal: { x: 0, y: 0 },
      sagittal: { x: 0, y: 0 },
    });
    if (volInfo) {
      setAxialSlice(Math.floor(volInfo.dimensions.axial / 2));
      setCoronalSlice(Math.floor(volInfo.dimensions.coronal / 2));
      setSagittalSlice(Math.floor(volInfo.dimensions.sagittal / 2));
      setWc(volInfo.windowCenter || 40);
      setWw(volInfo.windowWidth || 400);
    }
  };

  const handleMouseDown = (plane: 'axial' | 'coronal' | 'sagittal', e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = {
      plane,
      startX: e.clientX,
      startY: e.clientY,
      startWc: wc,
      startWw: ww,
      startPanX: pan[plane]?.x ?? 0,
      startPanY: pan[plane]?.y ?? 0,
      startZoom: zoom[plane] ?? 1,
    };

    if (activeTool === 'crosshair') {
      updateCrosshairPosition(plane, e);
    }
  };

  const updateCrosshairPosition = (plane: 'axial' | 'coronal' | 'sagittal', e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!volInfo) return;
    const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.() || (e.target as HTMLElement)?.getBoundingClientRect?.();
    if (!rect) return;
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (plane === 'axial') {
      const newSagittal = Math.floor(normX * (volInfo.dimensions.sagittal - 1));
      const newCoronal = Math.floor(normY * (volInfo.dimensions.coronal - 1));
      setSagittalSlice(newSagittal);
      setCoronalSlice(newCoronal);
    } else if (plane === 'coronal') {
      const newSagittal = Math.floor(normX * (volInfo.dimensions.sagittal - 1));
      const newAxial = Math.floor((1 - normY) * (volInfo.dimensions.axial - 1));
      setSagittalSlice(newSagittal);
      setAxialSlice(newAxial);
    } else {
      const newCoronal = Math.floor(normX * (volInfo.dimensions.coronal - 1));
      const newAxial = Math.floor((1 - normY) * (volInfo.dimensions.axial - 1));
      setCoronalSlice(newCoronal);
      setAxialSlice(newAxial);
    }
  };

  const handleMouseMove = (plane: 'axial' | 'coronal' | 'sagittal', e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.plane !== plane) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (activeTool === 'crosshair') {
      updateCrosshairPosition(plane, e);
    } else if (activeTool === 'wl') {
      const newWw = Math.max(1, Math.round(drag.startWw + dx * 2));
      const newWc = Math.round(drag.startWc - dy * 2);
      setWw(newWw);
      setWc(newWc);
    } else if (activeTool === 'pan') {
      const newPanX = drag.startPanX + dx;
      const newPanY = drag.startPanY + dy;
      setPan((prev) => ({
        ...prev,
        [plane]: {
          x: newPanX,
          y: newPanY,
        },
      }));
    } else if (activeTool === 'zoom') {
      const zoomFactor = Math.max(0.2, Math.min(5, drag.startZoom - dy * 0.01));
      setZoom((prev) => ({ ...prev, [plane]: zoomFactor }));
    }
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const getCrosshairNorm = (plane: 'axial' | 'coronal' | 'sagittal') => {
    if (!volInfo) return { x: 0.5, y: 0.5 };
    if (plane === 'axial') {
      return {
        x: sagittalSlice / (volInfo.dimensions.sagittal || 1),
        y: coronalSlice / (volInfo.dimensions.coronal || 1),
      };
    } else if (plane === 'coronal') {
      return {
        x: sagittalSlice / (volInfo.dimensions.sagittal || 1),
        y: 1 - axialSlice / (volInfo.dimensions.axial || 1),
      };
    } else {
      return {
        x: coronalSlice / (volInfo.dimensions.coronal || 1),
        y: 1 - axialSlice / (volInfo.dimensions.axial || 1),
      };
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full bg-[#0B0D10] flex flex-col items-center justify-center text-white gap-4">
        <div className="w-12 h-12 border-4 border-[#2E7DFF] border-t-transparent rounded-full animate-spin" />
        <div className="text-base font-medium">Reconstructing 3D Volume on Server...</div>
        <div className="text-xs text-gray-400">Loading orthogonal CT slice matrix (Zero GPU Overhead)</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-[#0B0D10] flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <div className="text-lg font-semibold text-red-400">Backend MPR Error</div>
        <div className="text-sm text-gray-400 max-w-md">{error}</div>
        <div className="flex items-center gap-3 mt-4">
          {onSwitchToWebGL && (
            <button
              onClick={onSwitchToWebGL}
              className="px-4 py-2 bg-[#2E7DFF] hover:bg-[#2563EB] text-white rounded text-sm font-medium transition-colors shadow-lg"
            >
              Switch to WebGL MPR
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#1A1D24] border border-[#2E333D] rounded text-sm hover:bg-[#252A34] text-white"
            >
              ← Return to 2D Viewer
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderViewport = (plane: 'axial' | 'coronal' | 'sagittal', label: string, color: string) => {
    const currentSlice = plane === 'axial' ? axialSlice : plane === 'coronal' ? coronalSlice : sagittalSlice;
    const totalSlices =
      plane === 'axial'
        ? volInfo?.dimensions.axial || 1
        : plane === 'coronal'
        ? volInfo?.dimensions.coronal || 1
        : volInfo?.dimensions.sagittal || 1;

    const crosshair = getCrosshairNorm(plane);
    const blobUrl = sliceBlobUrls[plane];

    return (
      <div
        key={plane}
        className="relative w-full h-full bg-black overflow-hidden border border-[#1A1D24] select-none cursor-crosshair flex flex-col"
        onWheel={(e) => handleWheel(plane, e)}
        onMouseDown={(e) => handleMouseDown(plane, e)}
        onMouseMove={(e) => handleMouseMove(plane, e)}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Top-Left Overlay */}
        <div className="absolute top-2 left-2 z-20 text-[11px] leading-tight text-white font-mono pointer-events-none drop-shadow">
          <div style={{ color }} className="font-bold tracking-wider uppercase mb-0.5">
            {label}
          </div>
          <div className="text-gray-300">{volInfo?.patientName}</div>
          <div className="text-gray-400">{volInfo?.patientId}</div>
          <div className="text-gray-400">{volInfo?.modality}</div>
        </div>

        {/* Top-Right Overlay */}
        <div className="absolute top-2 right-2 z-20 text-[11px] leading-tight text-white font-mono text-right pointer-events-none drop-shadow">
          <div className="text-gray-200">
            Slice: {currentSlice + 1} / {totalSlices}
          </div>
          <div className="text-gray-400">
            Thk: {volInfo?.spacing[0]?.toFixed(2)} mm
          </div>
          <div className="text-gray-400">
            W: {ww} L: {wc}
          </div>
        </div>

        {/* Anatomical Orientation Tags */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-[11px] font-bold text-gray-400 pointer-events-none">
          {plane === 'axial' ? 'A' : 'S'}
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 text-[11px] font-bold text-gray-400 pointer-events-none">
          {plane === 'axial' ? 'P' : 'I'}
        </div>
        <div className="absolute top-1/2 left-2 -translate-y-1/2 z-20 text-[11px] font-bold text-gray-400 pointer-events-none">
          {plane === 'sagittal' ? 'A' : 'R'}
        </div>
        <div className="absolute top-1/2 right-2 -translate-y-1/2 z-20 text-[11px] font-bold text-gray-400 pointer-events-none">
          {plane === 'sagittal' ? 'P' : 'L'}
        </div>

        {/* Main Image with Blob URL (Same-Origin & 100% COEP Immune) */}
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${pan[plane].x}px, ${pan[plane].y}px) scale(${zoom[plane]})`,
            transformOrigin: 'center center',
            transition: dragRef.current ? 'none' : 'transform 0.05s ease-out',
          }}
        >
          {blobUrl ? (
            <img
              src={blobUrl}
              alt={`${plane} slice`}
              crossOrigin="anonymous"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="text-xs text-gray-600 font-mono">Generating slice...</div>
          )}
        </div>

        {/* Interactive Crosshairs */}
        {showCrosshair && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div
              className="absolute left-0 right-0 border-t border-dashed"
              style={{
                top: `${crosshair.y * 100}%`,
                borderColor: color,
                opacity: 0.8,
              }}
            />
            <div
              className="absolute top-0 bottom-0 border-l border-dashed"
              style={{
                left: `${crosshair.x * 100}%`,
                borderColor: color,
                opacity: 0.8,
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0B0D10] text-gray-200 select-none">
      {/* Top MPR Control Toolbar */}
      <div className="h-11 bg-[#13161C] border-b border-[#1E232B] flex items-center justify-between px-3 text-xs gap-3">
        {/* Left Section: Back & Title */}
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-1 bg-[#1E232B] hover:bg-[#2A313C] text-gray-200 rounded text-xs font-medium flex items-center gap-1.5 transition"
            >
              ← Back to 2D
            </button>
          )}
          <span className="font-semibold text-white tracking-wide flex items-center gap-2">
            MerilView PRO <span className="bg-[#2E7DFF] text-white px-1.5 py-0.5 rounded text-[10px] font-bold">SERVER MPR</span>
          </span>
          {hasWebGLError && (
            <span className="text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3" /> WebGL Failover Protection Active
            </span>
          )}
        </div>

        {/* Center Section: Tools & Presets */}
        <div className="flex items-center gap-2">
          {/* Tool Selector */}
          <div className="flex items-center bg-[#1A1D24] p-0.5 rounded border border-[#262B35]">
            <button
              onClick={() => setActiveTool('crosshair')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition ${activeTool === 'crosshair' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
              title="Interactive Crosshairs"
            >
              <Crosshair className="w-3.5 h-3.5" /> Crosshair
            </button>
            <button
              onClick={() => setActiveTool('wl')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition ${activeTool === 'wl' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
              title="Window / Level"
            >
              <Sliders className="w-3.5 h-3.5" /> W/L
            </button>
            <button
              onClick={() => setActiveTool('zoom')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition ${activeTool === 'zoom' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
              title="Zoom In/Out"
            >
              <ZoomIn className="w-3.5 h-3.5" /> Zoom
            </button>
            <button
              onClick={() => setActiveTool('pan')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition ${activeTool === 'pan' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
              title="Pan"
            >
              <Move className="w-3.5 h-3.5" /> Pan
            </button>
          </div>

          {/* Window Preset Selector */}
          <select
            value={activePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="bg-[#1A1D24] border border-[#262B35] rounded px-2 py-1 text-xs text-gray-200 outline-none cursor-pointer"
          >
            {Object.keys(PRESETS).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Crosshair Toggle */}
          <button
            onClick={() => setShowCrosshair(!showCrosshair)}
            className={`px-2 py-1 rounded border border-[#262B35] text-xs flex items-center gap-1 ${showCrosshair ? 'bg-[#1F2937] text-[#38BDF8]' : 'bg-[#1A1D24] text-gray-400'}`}
          >
            <Eye className="w-3 h-3" /> Crosshairs
          </button>

          {/* Reset All */}
          <button
            onClick={handleReset}
            className="px-2 py-1 bg-[#1A1D24] hover:bg-[#252A34] border border-[#262B35] rounded text-gray-300 hover:text-white text-xs flex items-center gap-1"
            title="Reset Zoom, Pan & Slices"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        {/* Right Section: Layout Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1A1D24] p-0.5 rounded border border-[#262B35]">
            <button
              onClick={() => setLayout('all')}
              className={`px-2 py-0.5 text-xs rounded ${layout === 'all' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Tri-Planar
            </button>
            <button
              onClick={() => setLayout('axial')}
              className={`px-2 py-0.5 text-xs rounded ${layout === 'axial' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Axial
            </button>
            <button
              onClick={() => setLayout('coronal')}
              className={`px-2 py-0.5 text-xs rounded ${layout === 'coronal' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Coronal
            </button>
            <button
              onClick={() => setLayout('sagittal')}
              className={`px-2 py-0.5 text-xs rounded ${layout === 'sagittal' ? 'bg-[#2E7DFF] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Sagittal
            </button>
          </div>

          {onSwitchToWebGL && (
            <button
              onClick={onSwitchToWebGL}
              className="px-2 py-1 bg-[#1E232B] hover:bg-[#2A313C] border border-[#2E333D] rounded text-[11px] text-gray-300 hover:text-white transition"
              title="Switch to WebGL Browser Engine"
            >
              ⚡ Try WebGL
            </button>
          )}
        </div>
      </div>

      {/* Main Viewports Area */}
      <div className="flex-1 w-full min-h-0 p-1">
        {layout === 'all' ? (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1">
            {renderViewport('axial', 'AXIAL (Transverse)', '#38BDF8')}
            {renderViewport('coronal', 'CORONAL (Frontal)', '#4ADE80')}
            {renderViewport('sagittal', 'SAGITTAL (Lateral)', '#F472B6')}
            {/* 4th quad: Overview / Metadata summary */}
            <div className="bg-[#121418] border border-[#1A1D24] p-4 flex flex-col justify-between text-xs text-gray-400">
              <div>
                <div className="text-white font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#2E7DFF]" /> Meril Clinical MPR Engine
                </div>
                <div className="space-y-1.5 leading-relaxed">
                  <div><strong className="text-gray-300">Patient:</strong> {volInfo?.patientName} ({volInfo?.patientId})</div>
                  <div><strong className="text-gray-300">Modality:</strong> {volInfo?.modality} Diagnostic Scan</div>
                  <div><strong className="text-gray-300">Matrix:</strong> {volInfo?.dimensions.axial} × {volInfo?.dimensions.coronal} × {volInfo?.dimensions.sagittal} voxels</div>
                  <div><strong className="text-gray-300">Slice Spacing:</strong> {volInfo?.spacing[0]?.toFixed(2)} mm (Z) × {volInfo?.spacing[1]?.toFixed(2)} mm (XY)</div>
                  <div><strong className="text-gray-300">Current Window:</strong> Center {wc} / Width {ww} ({activePreset})</div>
                  <div><strong className="text-gray-300">Architecture:</strong> Zero-Crash Server-Side Reconstructed Array</div>
                </div>
              </div>
              <div className="bg-[#1A1D24] p-2.5 rounded border border-[#262B35] text-[11px] text-gray-300 leading-normal">
                💡 <span className="font-medium text-white">Navigation Tips:</span>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-gray-400">
                  <li>Scroll mouse wheel over any viewport to scroll through slices.</li>
                  <li>Click or drag crosshair to synchronize cutting planes in 3D.</li>
                  <li>Switch tool to W/L and drag to adjust contrast and brightness.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full">
            {layout === 'axial' && renderViewport('axial', 'AXIAL (Transverse)', '#38BDF8')}
            {layout === 'coronal' && renderViewport('coronal', 'CORONAL (Frontal)', '#4ADE80')}
            {layout === 'sagittal' && renderViewport('sagittal', 'SAGITTAL (Lateral)', '#F472B6')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClinicalServerMPRView;
