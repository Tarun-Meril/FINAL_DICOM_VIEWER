import { useEffect } from 'react';
import { useAppStore, type PanelId } from '@vr/state/store';
import { Toolbar } from '@vr/components/Toolbar';
import { StatusBar } from '@vr/components/StatusBar';
import { Viewport } from '@vr/components/Viewport';
import { LoadScreen } from '@vr/components/LoadScreen';
import { PresetsPanel } from '@vr/components/panels/PresetsPanel';
import { MaterialPanel } from '@vr/components/panels/MaterialPanel';
import { ClipPanel } from '@vr/components/panels/ClipPanel';
import { SegmentPanel } from '@vr/components/panels/SegmentPanel';
import { SculptPanel } from '@vr/components/panels/SculptPanel';
import { MeasurePanel } from '@vr/components/panels/MeasurePanel';
import { LayersPanel } from '@vr/components/panels/LayersPanel';
import { DiagnosticsPanel } from '@vr/components/panels/DiagnosticsPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { getSession } from '@vr/state/session';

const RIGHT_TABS: Array<[PanelId, string]> = [
  ['clip', 'Clip / VOI'],
  ['segment', 'Segment'],
  ['sculpt', 'Sculpt'],
  ['measure', 'Measure'],
  ['layers', 'Layers'],
  ['diagnostics', 'Diag'],
];

/**
 * Shared MedView VR workstation body.
 *
 * Route-agnostic: study identity arrives as props and is forwarded to
 * LoadScreen. The embedded VR mode in the main 2D viewer and the standalone
 * /vr page both mount THIS component, so rendering, state, presets and volume
 * loading are never duplicated.
 */
export interface VRWorkspaceProps {
  studyUID?: string;
  seriesUID?: string;
  apiBase?: string;
  /** Rendered as "Back to 2D" when supplied; omitted on the standalone page. */
  onClose?: () => void;
  variant?: 'embedded' | 'standalone';
}

export function VRWorkspace({ studyUID, seriesUID, apiBase, onClose, variant = 'standalone' }: VRWorkspaceProps = {}): JSX.Element {
  const s = useAppStore();

  /* Keyboard shortcuts (§16). Configurable in a later iteration; documented in the README. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const engine = getSession()?.engine;
      const store = useAppStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); document.querySelector<HTMLButtonElement>('[title^="Undo"]')?.click(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); document.querySelector<HTMLButtonElement>('[title="Redo"]')?.click(); return; }
      if (mod) return;
      switch (e.key.toLowerCase()) {
        case 'a': engine?.applyCameraPreset('anterior', store.parallelProjection); store.setCameraPreset('anterior'); break;
        case 'p': engine?.applyCameraPreset('posterior', store.parallelProjection); store.setCameraPreset('posterior'); break;
        case 'l': engine?.applyCameraPreset('left', store.parallelProjection); store.setCameraPreset('left'); break;
        case 'r': engine?.applyCameraPreset('right', store.parallelProjection); store.setCameraPreset('right'); break;
        case 's': engine?.applyCameraPreset('superior', store.parallelProjection); store.setCameraPreset('superior'); break;
        case 'i': engine?.applyCameraPreset('inferior', store.parallelProjection); store.setCameraPreset('inferior'); break;
        case 'f': engine?.fitVolume(); break;
        case 'o': store.setParallelProjection(!store.parallelProjection); break;
        case 'escape': store.setTool('navigate'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (s.status !== 'ready' || !s.load) {
    return <LoadScreen studyUID={studyUID} seriesUID={seriesUID} apiBase={apiBase} />;
  }

  return (
    <div className="app">
      <Toolbar onClose={onClose} variant={variant} />
      <div className="app-body">
        <aside className="panel">
          <div className="panel-tabs">
            <button className="panel-tab" data-active={s.leftPanel === 'presets'} onClick={() => s.setLeftPanel('presets')}>Presets &amp; TF</button>
            <button className="panel-tab" data-active={s.leftPanel === 'transfer'} onClick={() => s.setLeftPanel('transfer')}>Material &amp; light</button>
          </div>
          <div className="panel-body">
            <ErrorBoundary fallbackTitle="This panel could not be rendered.">
              {s.leftPanel === 'transfer' ? <MaterialPanel /> : <PresetsPanel />}
            </ErrorBoundary>
          </div>
        </aside>

        <ErrorBoundary fallbackTitle="The 3D viewport failed.">
          <Viewport />
        </ErrorBoundary>

        <aside className="panel right">
          <div className="panel-tabs">
            {RIGHT_TABS.map(([id, label]) => (
              <button key={id} className="panel-tab" data-active={s.activePanel === id}
                onClick={() => s.setActivePanel(id)}>{label}</button>
            ))}
          </div>
          <div className="panel-body">
            <ErrorBoundary fallbackTitle="This panel could not be rendered.">
              {s.activePanel === 'clip' && <ClipPanel />}
              {s.activePanel === 'segment' && <SegmentPanel />}
              {s.activePanel === 'sculpt' && <SculptPanel />}
              {s.activePanel === 'measure' && <MeasurePanel />}
              {s.activePanel === 'layers' && <LayersPanel />}
              {s.activePanel === 'diagnostics' && <DiagnosticsPanel />}
            </ErrorBoundary>
          </div>
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
