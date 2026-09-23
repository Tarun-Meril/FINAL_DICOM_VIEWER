import React, { useState, useRef } from 'react';
import { ExternalLink, RefreshCw, X, Eye, Maximize2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface MedViewVRWorkspaceProps {
  study?: any;
  series?: any[];
  activeSeriesInstanceUid?: string;
  onClose?: () => void;
}

export const MedViewVRWorkspace: React.FC<MedViewVRWorkspaceProps> = ({
  study,
  series,
  activeSeriesInstanceUid,
  onClose,
}) => {
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const studyUid = study?.studyInstanceUid || study?.study_instance_uid || '';
  
  // Choose series: active, or first CT series, or first series in study
  const chosenSeriesUid = activeSeriesInstanceUid || 
    series?.find((s: any) => s.modality === 'CT')?.seriesInstanceUid || 
    series?.find((s: any) => s.modality === 'CT')?.series_instance_uid || 
    series?.[0]?.seriesInstanceUid || 
    series?.[0]?.series_instance_uid || 
    '';

  const vrBaseUrl = import.meta.env.VITE_MEDVIEW_VR_URL || 'http://localhost:5173';
  const queryParams = new URLSearchParams();
  if (studyUid) queryParams.set('studyUID', studyUid);
  if (chosenSeriesUid) queryParams.set('seriesUID', chosenSeriesUid);
  queryParams.set('api', API_BASE_URL);

  const vrUrl = `${vrBaseUrl}?${queryParams.toString()}`;

  const handleOpenExternal = () => {
    window.open(vrUrl, '_blank', 'noopener,noreferrer');
  };

  const handleReload = () => {
    setIframeKey(Date.now());
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col w-full h-full bg-[#0B0D11] overflow-hidden select-none"
    >
      {/* VR Workspace Header Bar */}
      <div className="h-9 px-3 bg-[#13161C] border-b border-[#252A34] flex items-center justify-between text-xs text-[#E1E4EA] z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1C2230] border border-[#2B354D] text-[#4A90E2] font-semibold tracking-wide uppercase text-[10px]">
            <Eye className="w-3.5 h-3.5" />
            <span>MedView VR Engine</span>
          </div>

          <div className="text-[#8E99A8] flex items-center gap-2">
            <span>Patient:</span>
            <span className="text-white font-medium">{study?.patientName || 'CT Study'}</span>
            {study?.patientId && (
              <span className="text-[#6C7684]">({study.patientId})</span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReload}
            title="Reload 3D Volume"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] border border-[#353C48] text-[#C9D1D9] hover:text-white transition-colors cursor-pointer text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reload</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Maximize Viewport"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] border border-[#353C48] text-[#C9D1D9] hover:text-white transition-colors cursor-pointer text-[11px]"
          >
            <Maximize2 className="w-3 h-3" />
            <span>{isFullscreen ? 'Exit Full' : 'Maximize'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenExternal}
            title="Open in new window / tab"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1F3D73] hover:bg-[#255099] border border-[#2E62B8] text-white font-medium transition-colors cursor-pointer text-[11px]"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open Standalone VR</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close VR and return to 2D Viewer"
              className="p-1 rounded hover:bg-[#252A34] text-[#8E99A8] hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Embedded medview-vr Application Frame */}
      <div className="flex-1 w-full h-full min-h-0 min-w-0 bg-[#000000] relative">
        <iframe
          key={iframeKey}
          src={vrUrl}
          title="MedView VR 3D Volume Visualization"
          className="w-full h-full border-0 block"
          allow="fullscreen"
        />
      </div>
    </div>
  );
};

export default MedViewVRWorkspace;
