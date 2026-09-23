import { MPRWorkspace } from '../../mpr/ui/MPRWorkspace';
import '../../mpr/mpr.css';

/**
 * The integrated MPR workstation.
 *
 * This is the clinically validated MerilView MPR engine — the same
 * MPRStateManager, MPRViewportManager, DICOMGeometry and plane cameras that
 * produced the validation captures under `mpr building/validation` — ported to
 * Cornerstone v4 so it runs inside the main viewer's bundle rather than in an
 * iframe.
 *
 * It is a thin shell on purpose: everything below `MPRWorkspace` is the
 * validated tree, and this file adds only the scoping wrapper that keeps the
 * workstation's styles off the rest of the application.
 */
export interface MPRViewerCoreProps {
  /** StudyInstanceUID to reconstruct. Never hardcoded. */
  studyUID?: string;
  /** SeriesInstanceUID the host has open. Omit to let the engine choose. */
  seriesUID?: string;
  /** Override the PACS API base; defaults to the app's configured base. */
  apiBase?: string;
  /** Supplied by the 2D viewer so MPR can hand control back. */
  onClose?: () => void;
  /** 'embedded' hides Open Study, since the host owns study selection. */
  variant?: 'embedded' | 'standalone';
}

export default function MPRViewerCore({
  studyUID,
  seriesUID,
  apiBase,
  onClose,
  variant = 'embedded',
}: MPRViewerCoreProps) {
  return (
    <div className="merilview-mpr" style={{ width: '100%', height: '100%' }}>
      <MPRWorkspace
        studyUID={studyUID}
        seriesUID={seriesUID}
        apiBase={apiBase}
        onClose={onClose}
        variant={variant}
      />
    </div>
  );
}
