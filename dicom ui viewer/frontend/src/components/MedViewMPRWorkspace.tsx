import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, RefreshCw, X, Layers, Maximize2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface MedViewMPRWorkspaceProps {
  study?: any;
  series?: any[];
  activeSeriesInstanceUid?: string;
  onClose?: () => void;
}

export const MedViewMPRWorkspace: React.FC<MedViewMPRWorkspaceProps> = ({
  study,
  series,
  activeSeriesInstanceUid,
  onClose,
}) => {
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const studyUid = study?.studyInstanceUid || study?.study_instance_uid || '';

  // Choose series: active, or first CT/MR series, or first series in study
  const chosenSeries = series?.find(
    (s: any) =>
      (activeSeriesInstanceUid && (s.seriesInstanceUid === activeSeriesInstanceUid || s.series_instance_uid === activeSeriesInstanceUid)) ||
      (!activeSeriesInstanceUid && (s.modality === 'CT' || s.modality === 'MR'))
  ) || series?.[0];

  const chosenSeriesUid = activeSeriesInstanceUid ||
    chosenSeries?.seriesInstanceUid ||
    chosenSeries?.series_instance_uid ||
    '';

  const mprBaseUrl = import.meta.env.VITE_MEDVIEW_MPR_URL || 'http://localhost:5176';
  const queryParams = new URLSearchParams();
  if (studyUid) queryParams.set('studyUID', studyUid);
  if (chosenSeriesUid) queryParams.set('seriesUID', chosenSeriesUid);
  queryParams.set('api', API_BASE_URL);

  const mprUrl = `${mprBaseUrl}?${queryParams.toString()}`;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MPR_CLOSE') {
        onClose?.();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  const handleOpenExternal = () => {
    window.open(mprUrl, '_blank', 'noopener,noreferrer');
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

  const seriesDesc = chosenSeries?.seriesDescription || chosenSeries?.series_description || (chosenSeries?.seriesNumber ? `Series ${chosenSeries.seriesNumber}` : 'Series');

  return (
    <div 
      ref={containerRef}
      className="relative flex flex-col w-full h-full bg-[#0B0D11] overflow-hidden select-none"
    >
      {/* MPR Workspace Header Bar */}
      <div className="h-9 px-3 bg-[#13161C] border-b border-[#252A34] flex items-center justify-between text-xs text-[#E1E4EA] z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1C2230] border border-[#2B354D] text-[#37D67A] font-semibold tracking-wide uppercase text-[10px]">
            <Layers className="w-3.5 h-3.5" />
            <span>MerilView MPR Engine</span>
          </div>

          <div className="text-[#8E99A8] flex items-center gap-2">
            <span>Patient:</span>
            <span className="text-white font-medium">{study?.patientName || study?.patient_name || 'DICOM Study'}</span>
            {(study?.patientId || study?.patient_id) && (
              <span className="text-[#6C7684]">({study.patientId || study.patient_id})</span>
            )}
            <span className="text-[#404756]">•</span>
            <span>Selected Series:</span>
            <span className="text-[#37D67A] font-mono text-[11px] font-medium">{seriesDesc}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReload}
            title="Reload MPR Workspace"
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#184E34] hover:bg-[#1E6342] border border-[#278257] text-white font-medium transition-colors cursor-pointer text-[11px]"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open Standalone MPR</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close MPR and return to 2D Viewer"
              className="p-1 rounded hover:bg-[#252A34] text-[#8E99A8] hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Embedded MPR Application Frame */}
      <div className="flex-1 w-full h-full min-h-0 min-w-0 bg-[#000000] relative">
        <iframe
          key={iframeKey}
          src={mprUrl}
          title="MerilView MPR Multiplanar Reconstruction"
          className="w-full h-full border-0 block"
          allow="fullscreen"
        />
      </div>
    </div>
  );
};

export default MedViewMPRWorkspace;
