import { useAppStore } from '@/state/store';
import { getSession, syncDisplay, restoreFullVolume } from '@/state/session';
import type { Tool } from '@/state/store';

const TOOLS: Array<[Tool, string, string]> = [
  ['sculpt-brush-erase', 'Brush erase', 'Click in the 3D view to remove a sphere of voxels.'],
  ['sculpt-brush-keep', 'Brush keep', 'Click to keep a sphere and remove nothing else (additive).'],
  ['sculpt-polygon-erase', 'Polygon erase', 'Click to trace a polygon, Enter to cut everything inside it through the volume.'],
  ['sculpt-polygon-keep', 'Polygon keep', 'Click to trace a polygon, Enter to keep only what lies inside it.'],
];

export function SculptPanel(): JSX.Element {
  const s = useAppStore();
  const session = getSession();

  const undo = () => {
    if (!session) return;
    const e = session.history.undo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
    if (e?.target === 'visibility') syncDisplay(session);
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };
  const redo = () => {
    if (!session) return;
    const e = session.history.redo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
    if (e?.target === 'visibility') syncDisplay(session);
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };

  return (
    <>
      <div className="section">
        <h3>3D sculpting</h3>
        <div className="list">
          {TOOLS.map(([id, label, desc]) => (
            <div key={id} className="list-item" data-active={s.tool === id}
              onClick={() => s.setTool(s.tool === id ? 'navigate' : id)} title={desc}>
              <span className="name">{label}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label>Brush radius</label>
          <input type="range" min={1} max={60} step={0.5} value={s.brushRadiusMm}
            onChange={(e) => s.setBrushRadius(Number(e.target.value))} />
          <span className="val">{s.brushRadiusMm.toFixed(1)} mm</span>
        </div>
        <div className="hint">
          The brush radius is in physical millimetres, so it removes the same amount of tissue
          regardless of zoom. Sculpting writes to a mask; the source volume is untouched.
        </div>
      </div>

      <div className="section">
        <h3>History</h3>
        <div className="grid2">
          <button className="btn sm" onClick={undo} disabled={!s.canUndo}>Undo</button>
          <button className="btn sm" onClick={redo} disabled={!s.canRedo}>Redo</button>
        </div>
        <button className="btn wide" style={{ marginTop: 6 }}
          onClick={() => { if (session) { restoreFullVolume(session); session.history.clear(); s.setHistoryState(false, false, { undo: [], redo: [] }); } }}>
          Reset all sculpting
        </button>
        {s.historyLabels.undo.length > 0 && (
          <div className="kv" style={{ marginTop: 8 }}>
            {s.historyLabels.undo.slice(-8).reverse().map((l, i) => (
              <div key={i}><span>{i === 0 ? 'last' : ''}</span><span>{l}</span></div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h3>Workflow</h3>
        <div className="hint">
          A typical sequence: choose a bone preset, rotate to the view you want to cut from,
          pick <em>Polygon erase</em>, outline the structures in front, press Enter, then rotate
          to inspect what has been exposed. Every step is undoable and nothing is written to the study.
        </div>
      </div>
    </>
  );
}
