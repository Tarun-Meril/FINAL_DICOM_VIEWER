import { useAppStore } from '@/state/store';
import { measure, measurementValidity, volumePhysicalDimensions, formatVolume } from '@/measurement/measurements';
import { getSession } from '@/state/session';
import type { Tool } from '@/state/store';

const TOOLS: Array<[Tool, string, string]> = [
  ['probe', 'HU probe', 'Click to read the Hounsfield value and patient coordinates of the first visible surface.'],
  ['measure-distance', '3D distance', 'Click two points; the distance is the true 3D separation in millimetres.'],
  ['measure-angle', '3D angle', 'Click three points; the angle is measured at the middle one.'],
  ['measure-polyline', 'Polyline', 'Click a chain of points, then press Enter.'],
];

export function MeasurePanel(): JSX.Element {
  const s = useAppStore();
  const session = getSession();
  const geometry = s.load?.volume.geometry;
  const validity = geometry ? measurementValidity(geometry) : { valid: false };
  const phys = geometry ? volumePhysicalDimensions(geometry) : null;

  return (
    <>
      <div className="section">
        <h3>Measurement tools</h3>
        <div className="list">
          {TOOLS.map(([id, label, desc]) => (
            <div key={id} className="list-item" data-active={s.tool === id}
              onClick={() => s.setTool(s.tool === id ? 'navigate' : id)} title={desc}>
              <span className="name">{label}</span>
            </div>
          ))}
        </div>
        {!validity.valid && <div className="note warn" style={{ marginTop: 8 }}>{validity.reason}</div>}
        {validity.valid && (
          <div className="note ok" style={{ marginTop: 8 }}>
            Slice spacing was measured from Image Position (Patient); distances are in true
            patient millimetres.
          </div>
        )}
      </div>

      <div className="section">
        <h3>Measurements</h3>
        <div className="list">
          {s.measurements.length === 0 && (
            <div className="list-item"><span className="name" style={{ color: 'var(--fg-2)' }}>None yet</span></div>
          )}
          {s.measurements.map((m) => {
            const v = measure(m, geometry);
            return (
              <div key={m.id} className="list-item" data-active={m.id === s.activeMeasurementId}
                onClick={() => s.setActiveMeasurement(m.id)}>
                <input type="checkbox" checked={m.visible} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => s.updateMeasurement(m.id, { visible: e.target.checked })} />
                <span className="name">{m.label || m.kind}</span>
                <span className="meta">{v.display}</span>
                <button className="btn sm" onClick={(e) => { e.stopPropagation(); s.removeMeasurement(m.id); }}>×</button>
              </div>
            );
          })}
        </div>
        {s.measurements.length > 0 && (
          <button className="btn wide sm" style={{ marginTop: 6 }} onClick={s.clearMeasurements}>Clear all</button>
        )}
        {(() => {
          const active = s.measurements.find((m) => m.id === s.activeMeasurementId);
          if (!active) return null;
          const v = measure(active, geometry);
          return (
            <div className="kv" style={{ marginTop: 10 }}>
              <div><span>Type</span><span>{active.kind}</span></div>
              <div><span>Value</span><span>{v.display}</span></div>
              {v.components && Object.entries(v.components).map(([k, val]) => (
                <div key={k}><span>{k}</span><span>{val}</span></div>
              ))}
              {active.points.map((p, i) => (
                <div key={i}><span>P{i + 1} (LPS)</span><span>{p.map((c) => c.toFixed(1)).join(', ')} mm</span></div>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="section">
        <h3>Volume measurements</h3>
        {phys && (
          <div className="kv">
            <div><span>Voxel size</span><span>{geometry!.spacing.map((v) => v.toFixed(4)).join(' × ')} mm</span></div>
            <div><span>Voxel volume</span><span>{(geometry!.spacing[0] * geometry!.spacing[1] * geometry!.spacing[2]).toFixed(5)} mm³</span></div>
            <div><span>Field of view</span><span>{phys.display}</span></div>
            <div><span>Scanned volume</span><span>{formatVolume(phys.mm[0] * phys.mm[1] * phys.mm[2])}</span></div>
          </div>
        )}
        {s.segments.length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Segmented volumes</h3>
            <div className="kv">
              {s.segments.map((seg) => (
                <div key={seg.id}>
                  <span>{seg.name}</span>
                  <span>{s.segmentStats[seg.id] ? formatVolume(s.segmentStats[seg.id].volumeMm3) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="hint">
              Segment volume = voxel count × voxel volume. It is exact for the mask, but the mask
              itself depends on the threshold you chose.
            </div>
          </>
        )}
        {session?.masked && (
          <div className="hint">
            Part of the volume is currently hidden by sculpting or cropping. Measurements are
            still taken against the full source data.
          </div>
        )}
      </div>
    </>
  );
}
