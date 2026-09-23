import type { SeriesGeometry } from '../core/geometry/types';
import type { VolumeDescriptor } from '../core/volume/VolumeBuilder';
import type { MPRState } from '../core/state/MPRStateManager';
import { describePatientPosition } from '../core/geometry/orientation';

interface Props {
  geometry: SeriesGeometry | null;
  volume: VolumeDescriptor | null;
  state: MPRState;
}

/**
 * Developer diagnostic panel. Hidden by default; nothing here is required for
 * clinical reading, but every number a reviewer would want to audit is
 * present and copyable.
 */
export function DebugPanel({ geometry, volume, state }: Props) {
  if (!geometry) return null;
  const f = geometry.frames[0];

  const rows: Array<[string, string]> = [
    ['Series UID', geometry.seriesInstanceUID],
    ['Frame of Reference', geometry.frameOfReferenceUID ?? '(absent)'],
    ['Modality', geometry.modality],
    ['Rows × Columns', `${f.rows} × ${f.columns}`],
    ['Frames / slices', `${geometry.frames.length}`],
    ['Pixel spacing', `${f.pixelSpacing[0]} \\ ${f.pixelSpacing[1]} mm (row \\ col)`],
    ['Slice thickness', `${f.sliceThickness ?? '—'} mm`],
    ['Spacing between slices', `${f.spacingBetweenSlices ?? '—'} mm (declared)`],
    ['Measured slice spacing', `${geometry.spacing[2].toFixed(5)} mm (median)`],
    [
      'Gap min / max',
      `${geometry.spacingAnalysis.minGap?.toFixed(5)} / ${geometry.spacingAnalysis.maxGap?.toFixed(5)} mm`,
    ],
    [
      'Max spacing deviation',
      `${(geometry.spacingAnalysis.maxRelativeDeviation * 100).toFixed(3)} %`,
    ],
    ['Missing slices', `${geometry.spacingAnalysis.estimatedMissingCount}`],
    ['Image orientation', f.imageOrientationPatient.map((v) => v.toFixed(6)).join(' \\ ')],
    ['Row direction', geometry.rowDirection.map((v) => v.toFixed(6)).join(', ')],
    ['Column direction', geometry.columnDirection.map((v) => v.toFixed(6)).join(', ')],
    ['Slice normal', geometry.sliceNormal.map((v) => v.toFixed(6)).join(', ')],
    ['Volume origin', geometry.origin.map((v) => v.toFixed(4)).join(', ')],
    ['Volume dimensions', geometry.dimensions.join(' × ')],
    ['Volume spacing', geometry.spacing.map((v) => v.toFixed(5)).join(' × ')],
    ['Volume direction', geometry.direction.map((v) => v.toFixed(4)).join(', ')],
    [
      'Detected orientation',
      `${geometry.acquisitionPlane}${geometry.oblique ? ' (oblique)' : ''}`,
    ],
    ['Gantry shear', `${geometry.gantryTilt.shearAngleDeg.toFixed(4)}°`],
    [
      'In-plane step',
      geometry.gantryTilt.inPlaneStepMm.map((v) => v.toFixed(5)).join(', ') + ' mm',
    ],
    ['Patient position', describePatientPosition(f.patientPosition)],
    ['Rescale', volume ? `slope ${volume.rescale.slope}, intercept ${volume.rescale.intercept} (${volume.units})` : '—'],
    ['Voxels', volume ? volume.numberOfVoxels.toLocaleString() : '—'],
    ['Estimated volume size', volume ? `${(volume.estimatedBytes / 1048576).toFixed(1)} MB` : '—'],
    ['Geometry verdict', geometry.verdict],
    ['Reference point (LPS)', state.referencePointWorld.map((v) => v.toFixed(3)).join(', ')],
  ];

  return (
    <div className="debug-panel">
      <h4>GEOMETRY DIAGNOSTICS</h4>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {geometry.issues.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>VALIDATION</h4>
          {geometry.issues.map((i, idx) => (
            <div key={idx} className={`issue ${i.severity}`}>
              <div>
                [{i.severity}] {i.code}
              </div>
              <div style={{ color: '#8b959f' }}>{i.detail}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
