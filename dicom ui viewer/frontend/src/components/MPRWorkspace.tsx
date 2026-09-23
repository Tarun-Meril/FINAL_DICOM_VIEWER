import MPRViewerCore from './mpr/MPRViewerCore';

interface MPRWorkspaceProps {
  activeTool: string;
  viewportCommand: { type: string; viewportId: number; timestamp: number } | null;
  study?: any;
  series?: any[];
  activeSeriesInstanceUid?: string;
  onClose?: () => void;
}

/**
 * Backwards-compatible wrapper.
 *
 * The workstation body that used to live here now lives in
 * `components/mpr/MPRViewerCore.tsx` so that the embedded MPR mode and the
 * standalone `/mpr` page render the exact same component. This file is kept so
 * existing imports of `./MPRWorkspace` keep working; it holds no rendering or
 * volume-loading logic of its own.
 */
export default function MPRWorkspace({
  activeTool,
  viewportCommand,
  study,
  series,
  activeSeriesInstanceUid,
  onClose,
}: MPRWorkspaceProps) {
  return (
    <MPRViewerCore
      studyUID={study?.studyInstanceUid || study?.study_instance_uid || (typeof study === 'string' ? study : undefined)}
      seriesUID={activeSeriesInstanceUid}
      onClose={onClose}
      variant="embedded"
    />
  );
}
