import { useAppStore } from '@vr/state/store';
import { CLIP_AXES, clipAxisLabel, cropBoxDimensionsMm } from '@3d/rendering/clipping';
import { getSession, syncDisplay, restoreFullVolume } from '@vr/state/session';
import { sculptBox } from '@3d/segmentation/operations';
import { cropBoxWorld } from '@3d/rendering/clipping';

export function ClipPanel(): JSX.Element {
  const s = useAppStore();
  const geometry = s.load?.volume.geometry;
  const dims = geometry ? cropBoxDimensionsMm(s.cropBox, geometry) : null;

  const applyInvertedCrop = () => {
    const session = getSession();
    if (!session || !geometry) return;
    const box = cropBoxWorld(s.cropBox, geometry);
    const delta = sculptBox(session.visibility.values, geometry, box, 'erase');
    session.history.push({ delta, target: 'visibility', at: Date.now() });
    syncDisplay(session);
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };

  return (
    <>
      <div className="section">
        <h3>Clipping planes</h3>
        {CLIP_AXES.map((id) => {
          const p = s.clipping.find((c) => c.id === id)!;
          return (
            <div key={id} style={{ marginBottom: 10, opacity: p.enabled ? 1 : 0.55 }}>
              <div className="row" style={{ marginBottom: 2 }}>
                <input type="checkbox" checked={p.enabled}
                  onChange={(e) => s.updateClipPlane(id, { enabled: e.target.checked })} />
                <label style={{ flex: 1 }}>{clipAxisLabel(id)}</label>
                <button className="btn sm" title="Invert which side is kept"
                  onClick={() => s.updateClipPlane(id, { invert: !p.invert })}
                  data-active={p.invert}>{p.invert ? 'inverted' : 'normal'}</button>
              </div>
              <div className="row">
                <input type="range" min={0} max={1} step={0.002} value={p.position} disabled={!p.enabled}
                  onChange={(e) => s.updateClipPlane(id, { position: Number(e.target.value) })} />
                <span className="val">{(p.position * 100).toFixed(0)}%</span>
              </div>
              <div className="row">
                <label style={{ flex: '0 0 70px', fontSize: 11 }}>Slab (mm)</label>
                <input type="range" min={0} max={120} step={1} value={p.thickness} disabled={!p.enabled}
                  onChange={(e) => s.updateClipPlane(id, { thickness: Number(e.target.value) })} />
                <span className="val">{p.thickness || '—'}</span>
              </div>
            </div>
          );
        })}
        <button className="btn wide" onClick={s.resetClipping}>Reset all clipping planes</button>
        <div className="hint">
          Clipping hides part of the volume on the GPU. It changes no voxel and is undone by
          disabling the plane.
        </div>
      </div>

      <div className="section">
        <h3>Volume of interest (crop box)</h3>
        <div className="row">
          <label>Enabled</label>
          <input type="checkbox" checked={s.cropBox.enabled}
            onChange={(e) => s.setCropBox({ enabled: e.target.checked })} />
          <label style={{ flex: '0 0 auto', marginLeft: 'auto', fontSize: 11 }}>Show only ROI</label>
          <input type="checkbox" checked={s.cropBox.showOnlyRoi}
            onChange={(e) => s.setCropBox({ showOnlyRoi: e.target.checked })} />
        </div>
        {(['Right ⇄ Left', 'Anterior ⇄ Posterior', 'Inferior ⇄ Superior'] as const).map((label, axis) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 2 }}>{label}</div>
            <div className="row">
              <input type="range" min={0} max={1} step={0.002} value={s.cropBox.min[axis]} disabled={!s.cropBox.enabled}
                onChange={(e) => {
                  const min = [...s.cropBox.min] as [number, number, number];
                  min[axis] = Math.min(Number(e.target.value), s.cropBox.max[axis] - 0.01);
                  s.setCropBox({ min });
                }} />
              <input type="range" min={0} max={1} step={0.002} value={s.cropBox.max[axis]} disabled={!s.cropBox.enabled}
                onChange={(e) => {
                  const max = [...s.cropBox.max] as [number, number, number];
                  max[axis] = Math.max(Number(e.target.value), s.cropBox.min[axis] + 0.01);
                  s.setCropBox({ max });
                }} />
            </div>
          </div>
        ))}
        {dims && (
          <div className="kv" style={{ marginBottom: 8 }}>
            <div><span>ROI size</span><span>{dims.map((v) => v.toFixed(1)).join(' × ')} mm</span></div>
            <div><span>ROI volume</span><span>{((dims[0] * dims[1] * dims[2]) / 1000).toFixed(1)} mL</span></div>
          </div>
        )}
        <div className="grid2">
          <button className="btn sm" onClick={s.resetCropBox}>Reset ROI</button>
          <button className="btn sm" onClick={applyInvertedCrop} disabled={!s.cropBox.enabled}
            title="Permanently hide everything inside the box (reversible via Undo)">Remove inside</button>
          <button className="btn sm wide" style={{ gridColumn: '1 / -1' }}
            onClick={() => { const session = getSession(); if (session) { restoreFullVolume(session); session.history.clear(); s.setHistoryState(false, false, { undo: [], redo: [] }); } }}>
            Restore full volume
          </button>
        </div>
      </div>
    </>
  );
}
