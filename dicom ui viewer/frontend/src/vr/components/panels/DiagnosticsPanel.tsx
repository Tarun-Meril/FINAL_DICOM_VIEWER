import { useAppStore } from '@vr/state/store';
import { buildSeriesReport, formatSeriesReport } from '@vr/dicom/diagnostics';
import { logger } from '@3d/core/logger';
import { downloadText } from '@vr/utils/download';
import { getSession } from '@vr/state/session';

export function DiagnosticsPanel(): JSX.Element {
  const s = useAppStore();
  const load = s.load;
  const session = getSession();
  if (!load) return <div className="hint">No dataset loaded.</div>;

  const report = buildSeriesReport(load.series, load.analysis, load.volume.statistics);
  const allIssues = [...load.diagnostics.issues, ...load.volume.issues, ...s.runtimeIssues];

  return (
    <>
      <div className="section">
        <h3>Dataset</h3>
        <div className="kv">
          <div><span>Files supplied</span><span>{load.diagnostics.filesFound}</span></div>
          <div><span>After expansion</span><span>{load.diagnostics.filesAfterArchiveExpansion}</span></div>
          <div><span>Valid DICOM</span><span>{load.diagnostics.validDicomFiles}</span></div>
          <div><span>Rejected</span><span>{load.diagnostics.rejectedFiles.length}</span></div>
          <div><span>Studies</span><span>{load.diagnostics.studyCount}</span></div>
          <div><span>Series</span><span>{load.diagnostics.seriesCount}</span></div>
        </div>
      </div>

      <div className="section">
        <h3>Series in this study</h3>
        <div className="list">
          {load.studies.flatMap((st) => st.series).map((se) => (
            <div key={se.seriesInstanceUID} className="list-item"
              data-active={se.seriesInstanceUID === load.series.seriesInstanceUID}>
              <span className="name">#{se.seriesNumber} {se.seriesDescription}</span>
              <span className="meta">{se.role} · {se.instanceCount}</span>
            </div>
          ))}
        </div>
        <div className="hint">{load.diagnostics.selectionReason}</div>
      </div>

      <div className="section">
        <h3>Geometry conformance</h3>
        <div className="kv">
          {load.conformance.checks.map((c) => (
            <div key={c.name}>
              <span style={{ color: c.pass ? 'var(--ok)' : 'var(--error)' }}>{c.pass ? 'PASS' : 'FAIL'}</span>
              <span>{c.name}<br /><span style={{ color: 'var(--fg-2)' }}>{c.actual}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Issues ({allIssues.length})</h3>
        {allIssues.length === 0 && <div className="note ok">No problems were detected in this dataset.</div>}
        {allIssues.map((i, n) => (
          <div key={n} className={`note ${i.severity === 'info' ? '' : i.severity === 'warning' ? 'warn' : 'error'}`} style={{ marginBottom: 6 }}>
            <b>{i.code}</b><br />{i.message}
            {i.detail && <><br /><span style={{ color: 'var(--fg-2)', fontSize: 10 }}>{i.detail}</span></>}
            {i.mitigation && <><br /><span style={{ color: 'var(--fg-2)', fontSize: 10 }}>→ {i.mitigation}</span></>}
          </div>
        ))}
      </div>

      <div className="section">
        <h3>Provenance</h3>
        <div className="kv">
          <div><span>Strategy</span><span>{load.volume.provenance.reconstructionStrategy}</span></div>
          <div><span>Source slices</span><span>{load.volume.provenance.sourceInstanceCount}</span></div>
          <div><span>Rescale</span><span>slope {load.volume.provenance.rescaleSlope}, intercept {load.volume.provenance.rescaleIntercept}</span></div>
          <div><span>Masked voxels</span><span>{session?.masked ? `${session.hiddenVoxels.toLocaleString()} hidden (rendering exclusion; source unchanged)` : 'none'}</span></div>
        </div>
        {load.volume.provenance.transforms.length === 0
          ? <div className="hint">No resampling was applied; the volume is the acquired grid.</div>
          : load.volume.provenance.transforms.map((t, i) => (
            <div key={i} className="note" style={{ marginTop: 6 }}>{t.description}</div>
          ))}
      </div>

      <div className="section">
        <h3>Timings</h3>
        <div className="kv">
          {Object.entries(load.timings).map(([k, v]) => (
            <div key={k}><span>{k}</span><span>{Math.round(v)} ms</span></div>
          ))}
          <div><span>last render</span><span>{s.lastRenderMs.toFixed(0)} ms</span></div>
        </div>
      </div>

      <div className="section">
        <h3>Export</h3>
        <div className="grid2">
          <button className="btn sm" onClick={() => downloadText(formatSeriesReport(report), 'medview-series-report.txt', 'text/plain')}>Series report</button>
          <button className="btn sm" onClick={() => downloadText(logger.export(), 'medview-log.txt', 'text/plain')}>Diagnostics log</button>
        </div>
        <div className="hint">
          Exports contain technical parameters and UIDs only. Patient identifiers are never
          written to the log.
        </div>
      </div>

      <div className="section">
        <h3>Full series report</h3>
        <pre style={{ fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'pre-wrap', color: 'var(--fg-1)' }}>
          {formatSeriesReport(report)}
        </pre>
      </div>
    </>
  );
}
