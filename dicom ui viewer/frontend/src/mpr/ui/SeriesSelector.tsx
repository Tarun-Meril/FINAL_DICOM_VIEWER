import type { SpatialGroup } from '../core/volume/SeriesValidator';
import type { LoadedStudy } from '../app/loadStudy';

interface Props {
  study: LoadedStudy;
  onSelect: (group: SpatialGroup) => void;
}

/**
 * When a study contains more than one volumetric group the user chooses
 * explicitly. Nothing is auto-fused: an arterial and a venous phase look
 * identical in a thumbnail but must never share a volume.
 */
export function SeriesSelector({ study, onSelect }: Props) {
  return (
    <div className="startup">
      <div className="title">SELECT SERIES FOR REFORMATTING</div>
      <div className="hint">
        {study.filter.excluded.length > 0 && (
          <>
            {study.filter.excluded.length} non-volumetric image(s) (localiser,
            scout, dose report) were excluded automatically.
          </>
        )}
      </div>
      <div className="series-list">
        {study.candidates.map((group) => (
          <button
            key={group.key}
            className="series-row"
            onClick={() => onSelect(group)}
          >
            <div style={{ flex: 1 }}>
              <div>
                {group.seriesDescription ?? 'Series'}{' '}
                {group.seriesNumber !== undefined && `(#${group.seriesNumber})`}
              </div>
              <div className="meta">
                {group.modality} · {group.columns}×{group.rows} ·{' '}
                {group.frames.length} images
                {group.convolutionKernel ? ` · kernel ${group.convolutionKernel}` : ''}
                {group.acquisitionNumber !== undefined
                  ? ` · acq ${group.acquisitionNumber}`
                  : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
      {study.failedFiles.length > 0 && (
        <div className="hint">
          {study.failedFiles.length} file(s) could not be parsed and were ignored.
        </div>
      )}
    </div>
  );
}
