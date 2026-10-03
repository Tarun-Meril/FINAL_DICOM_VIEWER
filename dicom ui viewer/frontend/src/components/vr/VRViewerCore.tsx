import { useEffect } from 'react';
import { VRWorkspace } from '../../vr/app/VRWorkspace';
import '../../vr/app/theme.css';
import { useAppStore } from '../../vr/state/store';

/**
 * The integrated 3D Volume Rendering workstation.
 *
 * This is the MerilView VR engine — the same VolumeRenderEngine, transfer
 * functions, presets and camera code the standalone app uses. Directly
 * connected to DICOM instances from the PACS.
 */
export interface VRViewerCoreProps {
  /** StudyInstanceUID to render. Never hardcoded. */
  studyUID?: string;
  /** SeriesInstanceUID the host has open. Omit to let the engine choose. */
  seriesUID?: string;
  /** Override the PACS API base; defaults to the app's configured base. */
  apiBase?: string;
  /** Supplied by the 2D viewer so VR can hand control back. */
  onClose?: () => void;
  /** 'embedded' trims the standalone wordmark. */
  variant?: 'embedded' | 'standalone';
}

export default function VRViewerCore({
  studyUID,
  seriesUID,
  apiBase,
  onClose,
  variant = 'embedded',
}: VRViewerCoreProps) {
  useEffect(() => {
    const s = useAppStore.getState();
    if (s.status === 'error') {
      s.setError(null);
      s.setStatus('idle');
    }
  }, [studyUID, seriesUID]);
  return (
    <div className="medview-vr" style={{ width: '100%', height: '100%' }}>
      <VRWorkspace
        studyUID={studyUID}
        seriesUID={seriesUID}
        apiBase={apiBase}
        onClose={onClose}
        variant={variant}
      />
    </div>
  );
}
