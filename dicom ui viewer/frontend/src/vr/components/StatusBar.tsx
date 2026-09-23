import { useAppStore } from '@vr/state/store';
import { getSession } from '@vr/state/session';
import { orientationCode } from '@3d/dicom/geometry';

export function StatusBar(): JSX.Element {
  const s = useAppStore();
  const session = getSession();
  const g = s.load?.volume.geometry;
  const caps = session?.engine?.capabilities;
  const issueCount = (s.load?.volume.issues.length ?? 0) + s.runtimeIssues.length;
  const worst = [...(s.load?.volume.issues ?? []), ...s.runtimeIssues]
    .reduce<'info' | 'warning' | 'error' | 'fatal'>((a, i) =>
      (['info', 'warning', 'error', 'fatal'].indexOf(i.severity) > ['info', 'warning', 'error', 'fatal'].indexOf(a) ? i.severity : a), 'info');

  return (
    <div className="statusbar">
      {g && <span><b>{g.dimensions.join('×')}</b> voxels</span>}
      {g && <span><b>{g.physicalSize.map((v) => v.toFixed(0)).join('×')}</b> mm</span>}
      {g && <span title="World space is DICOM patient space (LPS)">axes <b>{orientationCode(g.iAxis, g.jAxis, g.kAxis)}</b></span>}
      {g && <span>build <b>{s.load?.volume.provenance.reconstructionStrategy}</b></span>}
      {s.load && <span>HU <b>{s.load.volume.statistics.min}…{s.load.volume.statistics.max}</b></span>}
      <span title="Time spent in the render call. On a software rasteriser the GPU work is deferred until a readback, so this under-reports the true frame cost.">
        render call <b>{s.lastRenderMs ? `${s.lastRenderMs.toFixed(0)} ms` : '—'}</b>
      </span>
      <span>quality <b>{s.quality}</b></span>
      {s.qualityNotice && <span className="pill warn" title={s.qualityNotice}>reduced resolution</span>}
      {session?.masked && (
        <span className="pill warn" title="Hidden by sculpting, cropping or bone removal — the source volume is unchanged">
          {session.hiddenVoxels.toLocaleString()} voxels hidden
        </span>
      )}
      {issueCount > 0 && (
        <span className={`pill ${worst === 'info' ? '' : worst === 'warning' ? 'warn' : 'error'}`}>
          {issueCount} diagnostic{issueCount === 1 ? '' : 's'}
        </span>
      )}
      <span className="spacer" style={{ flex: 1 }} />
      {caps && <span title={caps.renderer}>GPU <b>{caps.renderer.slice(0, 46)}</b></span>}
    </div>
  );
}
