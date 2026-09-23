import { VRWorkspace } from '../../vr/app/VRWorkspace';
import '../../vr/app/theme.css';

/**
 * The integrated 3D Volume Rendering workstation.
 *
 * This is the MedView VR engine — the same VolumeRenderEngine, transfer
 * functions, presets and camera code the standalone app uses. The rendering
 * layer already lived in this project at `src/3d/`; this brings across the UI
 * and ingest layer so VR runs inside the main viewer's bundle rather than in an
 * iframe.
 *
 * It is a thin shell on purpose: everything below `VRWorkspace` is the
 * validated tree, and this file adds only the scoping wrapper that keeps the
 * workstation's styles off the rest of the application.
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
