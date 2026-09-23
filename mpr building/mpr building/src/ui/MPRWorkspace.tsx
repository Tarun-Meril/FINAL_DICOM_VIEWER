import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MPRStateManager } from '../core/state/MPRStateManager';
import { MPRViewportManager } from '../engine/MPRViewportManager';
import { MPR_PLANES, type MPRPlane } from '../core/state/planes';
import { useMPRState } from './useMPRState';
import { ViewportPanel } from './ViewportPanel';
import { MPRToolbar } from './MPRToolbar';
import { DebugPanel } from './DebugPanel';
import { SeriesSelector } from './SeriesSelector';
import {
  describeGeometryForLog,
  loadStudyFromFiles,
  loadStudyFromPacs,
  prepareVolume,
  type LoadedStudy,
} from '../app/loadStudy';
import type { SpatialGroup } from '../core/volume/SeriesValidator';
import type { SeriesGeometry } from '../core/geometry/types';
import type { VolumeDescriptor } from '../core/volume/VolumeBuilder';
import { initialiseEngine } from '../engine/init';
import { createToolGroup, setActiveTool } from '../engine/tools';
import { volumeCentreWorld } from '../core/geometry/DICOMGeometry';
import { defaultWindowForModality } from '../core/wl/WindowLevelManager';
import { reformatPitchMm, stepReferencePoint } from '../core/crosshair/CrosshairManager';
import {
  clampReferenceToVolume,
  resolveNavigation,
  sliceInfoForPlane,
  type NavigationCommand,
} from '../core/state/SliceNavigation';
import type { PatientStudyInfo } from '../dicom/parseFrames';
import { readAnnotationsForQA } from '../engine/annotations';

export function MPRWorkspace() {
  const stateManager = useMemo(() => new MPRStateManager(), []);
  const viewportManager = useMemo(() => new MPRViewportManager(), []);
  const state = useMPRState(stateManager);

  const elementsRef = useRef<Partial<Record<MPRPlane, HTMLDivElement>>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [study, setStudy] = useState<LoadedStudy | null>(null);
  const [geometry, setGeometry] = useState<SeriesGeometry | null>(null);
  const [volume, setVolume] = useState<VolumeDescriptor | null>(null);
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [focusedPlane, setFocusedPlane] = useState<MPRPlane>('axial');
  const [patientInfo, setPatientInfo] = useState<PatientStudyInfo>({});
  const [pendingGroup, setPendingGroup] = useState<SpatialGroup | null>(null);
  /** Fraction of the series whose pixel data has arrived; 1 when complete. */
  const [loadedFraction, setLoadedFraction] = useState(1);
  const [loadedCount, setLoadedCount] = useState<[number, number]>([0, 0]);
  // Becomes true once all three viewport hosts are in the DOM. Volume
  // preparation waits for this instead of assuming render order.
  const [elementsReady, setElementsReady] = useState(false);
  const [pacsRequest, setPacsRequest] = useState<{
    studyUid: string;
    seriesUid?: string;
    apiBase: string;
  } | null>(null);

  /* ------------------------------------------------------------- bootstrap */

  useEffect(() => {
    let cancelled = false;
    initialiseEngine()
      .then(() => {
        if (!cancelled) setEngineReady(true);
      })
      .catch((error) => {
        console.error('[MPR] engine init failed', error);
        setBlockingMessage(
          'The rendering engine failed to start: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      });
    return () => {
      cancelled = true;
      viewportManager.destroy();
    };
  }, [viewportManager]);

  const registerElement = useCallback((plane: MPRPlane, element: HTMLDivElement | null) => {
    if (element) elementsRef.current[plane] = element;
    else delete elementsRef.current[plane];
    const ready = MPR_PLANES.every((p) => Boolean(elementsRef.current[p]));
    setElementsReady((current) => (current === ready ? current : ready));
  }, []);

  /* ----------------------------------------------------------- study load */

  const openFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBlockingMessage(null);
      setProgress({ label: 'Reading DICOM geometry', value: 0 });
      const loaded = await loadStudyFromFiles(Array.from(files), (done, total) =>
        setProgress({ label: 'Reading DICOM geometry', value: done / total }),
      );
      setProgress(null);
      setPatientInfo(loaded.patientInfo);
      setStudy(loaded);

      if (loaded.candidates.length === 0) {
        setBlockingMessage(
          'MPR cannot be generated from this selection because no volumetric series was found. ' +
            'Localiser, scout and non-image objects are excluded automatically.',
        );
        return;
      }
      if (loaded.candidates.length === 1) {
        setPendingGroup(loaded.candidates[0]);
      }
    },
    [],
  );

  const loadPacsStudy = useCallback(
    async (studyUid: string, seriesUid?: string, apiBase?: string) => {
      try {
        setBlockingMessage(null);
        setProgress({ label: 'Connecting to PACS...', value: 0 });
        const result = await loadStudyFromPacs(
          studyUid,
          seriesUid,
          apiBase || 'http://localhost:8000',
          (done, total, msg) => {
            setProgress({
              label: msg || 'Loading PACS data',
              value: total > 0 ? done / total : 0,
            });
          },
        );
        setProgress(null);
        setPatientInfo(result.study.patientInfo);
        setStudy(result.study);

        if (result.study.candidates.length === 0) {
          setBlockingMessage(
            'MPR cannot be generated from this selection because no volumetric series was found. ' +
              'Localiser, scout and non-image objects are excluded automatically.',
          );
          return;
        }

        const match = result.study.candidates.find(
          (c) => c.seriesInstanceUID === result.selectedSeriesUid,
        );
        if (match) {
          setPendingGroup(match);
        } else if (result.study.candidates.length > 0) {
          setPendingGroup(result.study.candidates[0]);
        }
      } catch (err) {
        console.error('[MPR] Failed to load PACS study', err);
        setProgress(null);
        setBlockingMessage(
          'Failed to load study from PACS: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    },
    [],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studyUid = params.get('studyUID') || params.get('studyUid');
    const seriesUid = params.get('seriesUID') || params.get('seriesUid');
    const apiBase = params.get('api') || 'http://localhost:8000';

    if (studyUid) {
      setPacsRequest({ studyUid, seriesUid: seriesUid || undefined, apiBase });
      void loadPacsStudy(studyUid, seriesUid || undefined, apiBase);
    }
  }, [loadPacsStudy]);

  /* ------------------------------------------------- volume preparation */

  useEffect(() => {
    if (!pendingGroup || !engineReady || !elementsReady) return;
    let cancelled = false;

    (async () => {
      try {
      const prepared = prepareVolume(pendingGroup);
      setGeometry(prepared.geometry);
      // Developer log — always written, never shown in clinical mode.
      console.info('[MPR geometry]\n' + describeGeometryForLog(prepared.geometry));

      if (!prepared.descriptor) {
        setVolume(null);
        setBlockingMessage(prepared.blockingMessage);
        return;
      }
      setBlockingMessage(null);

      const elements = elementsRef.current;
      if (!elements.axial || !elements.coronal || !elements.sagittal) {
        setBlockingMessage(
          'Internal error: the viewport hosts are not available. MPR was not started.',
        );
        return;
      }

      viewportManager.setup({
        axial: elements.axial,
        coronal: elements.coronal,
        sagittal: elements.sagittal,
      });
      createToolGroup(viewportManager.viewportIds, 'merilview-mpr-engine');
      setActiveTool(stateManager.getState().activeTool);

      // The modal notice covers the viewports, so it is dismissed as soon as
      // the volume is attached. The remaining frames stream in behind the live
      // images, and the toolbar keeps showing how much has arrived — an
      // incomplete reformat must never be mistaken for complete anatomy.
      let attached = false;
      setLoadedFraction(0);
      setLoadedCount([0, prepared.imageIds.length]);
      setProgress({ label: 'Building volume', value: 0 });
      await viewportManager.loadVolume(
        prepared.descriptor,
        prepared.imageIds,
        (loaded, total) => {
          if (!attached) setProgress({ label: 'Building volume', value: loaded / total });
          setLoadedFraction(loaded / total);
          setLoadedCount([loaded, total]);
        },
      );
      attached = true;
      if (cancelled) return;
      setProgress(null);
      setVolume(prepared.descriptor);

      // Snap the opening reference point to a real voxel centre. The geometric
      // centre of an even-numbered stack falls between two slices, which would
      // leave the axial view half a slice away from the reference point.
      const transform = prepared.descriptor.transform;
      const centre = transform.indexToWorld(
        transform.worldToNearestVoxel(volumeCentreWorld(prepared.geometry)),
      );
      const wl = defaultWindowForModality(
        prepared.descriptor.modality,
        prepared.descriptor.units,
      );
      stateManager.resetAll(centre, wl);
      stateManager.set('activeVolumeId', prepared.descriptor.volumeId);
      viewportManager.setWindowLevel('all', wl);
      viewportManager.resetAllCameras(centre);

      // The engine finishes attaching the volume asynchronously and may move
      // the cameras once more. Re-apply the reference point on the next frames
      // so the three planes are exactly coincident from the first image shown.
      requestAnimationFrame(() => {
        if (cancelled) return;
        viewportManager.jumpToWorld(centre, false);
        requestAnimationFrame(() => {
          if (!cancelled) viewportManager.jumpToWorld(centre, false);
        });
      });
      } catch (error) {
        // Any failure here is a hard stop: the operator is told, and the
        // technical cause is logged for the developer.
        console.error('[MPR] volume preparation failed', error);
        setProgress(null);
        setBlockingMessage(
          'MPR could not be started for this series.\n\n' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroup, engineReady, elementsReady]);

  /* --------------------------------------- state -> renderer projections */

  // Reference point: camera-only update. Never rebuilds the volume.
  useEffect(() => {
    if (!volume) return;
    const planes = state.linkViews ? MPR_PLANES : [focusedPlane];
    viewportManager.jumpToWorld(state.referencePointWorld, false, planes);
  }, [state.referencePointWorld, state.linkViews, volume, viewportManager, focusedPlane]);

  useEffect(() => {
    if (!volume) return;
    for (const plane of MPR_PLANES) {
      viewportManager.setWindowLevel(plane, state[plane].windowLevel);
      viewportManager.setInvert(plane, state[plane].invert);
      viewportManager.setSlab(
        plane,
        state[plane].slabThicknessMm > 0
          ? state[plane].slabThicknessMm
          : reformatPitchMm(
              plane,
              {
                i: volume.transform.rowDirection,
                j: volume.transform.columnDirection,
                k: volume.transform.sliceNormal,
              },
              volume.spacing,
            ),
        state[plane].slabMode,
      );
    }
  }, [
    state.axial,
    state.coronal,
    state.sagittal,
    volume,
    viewportManager,
  ]);

  useEffect(() => {
    if (!volume) return;
    viewportManager.setInterpolation(state.interpolation);
  }, [state.interpolation, volume, viewportManager]);

  useEffect(() => {
    setActiveTool(state.activeTool);
  }, [state.activeTool]);

  useEffect(() => {
    // Layout changes resize the canvases; the reference point is untouched, so
    // the same anatomy is on screen afterwards.
    // resize() restores the reference point itself, so the anatomy on screen is
    // unchanged by a layout switch.
    const id = window.setTimeout(() => viewportManager.resize(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layout, state.maximisedPlane]);

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const navigate = (command: NavigationCommand) => {
      if (!volume) return;
      const info = sliceInfoForPlane(
        focusedPlane,
        stateManager.getState().referencePointWorld,
        volume.transform,
        0,
      );
      const steps = resolveNavigation(command, info);
      if (steps === 0) return;
      const next = stepReferencePoint(
        focusedPlane,
        stateManager.getState().referencePointWorld,
        steps,
        info.pitchMm,
      );
      stateManager.setReferencePoint(clampReferenceToVolume(next, volume.transform));
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      switch (event.key) {
        case 'ArrowDown':
          navigate({ type: 'step', steps: 1 });
          break;
        case 'ArrowUp':
          navigate({ type: 'step', steps: -1 });
          break;
        case 'PageDown':
          navigate({ type: 'page', pages: 1 });
          break;
        case 'PageUp':
          navigate({ type: 'page', pages: -1 });
          break;
        case 'Home':
          navigate({ type: 'first' });
          break;
        case 'End':
          navigate({ type: 'last' });
          break;
        case 'c':
          navigate({ type: 'centre' });
          break;
        case 'l':
          stateManager.toggle('linkViews');
          break;
        case 'r':
          stateManager.toggle('referenceLinesEnabled');
          break;
        case 'd':
          stateManager.toggle('debugPanelVisible');
          break;
        case 'Escape':
          stateManager.maximise(null);
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedPlane, stateManager, volume]);

  /* -------------------------------------------------------------- actions */

  const onResetView = useCallback(() => {
    if (state.linkViews) {
      stateManager.resetAllViewports();
      viewportManager.resetAllCameras(state.referencePointWorld);
    } else {
      stateManager.resetViewport(focusedPlane);
      viewportManager.resetCamera(focusedPlane, state.referencePointWorld);
    }
  }, [focusedPlane, state.linkViews, state.referencePointWorld, stateManager, viewportManager]);

  const onResetAll = useCallback(() => {
    if (!geometry || !volume) return;
    const centre = volumeCentreWorld(geometry);
    const wl = defaultWindowForModality(volume.modality, volume.units);
    stateManager.resetAll(centre, wl);
    viewportManager.setWindowLevel('all', wl);
    viewportManager.resetAllCameras(centre);
  }, [geometry, stateManager, viewportManager, volume]);

  const onFit = useCallback(() => {
    viewportManager.fit(focusedPlane, state.referencePointWorld, state.linkViews);
  }, [focusedPlane, state.linkViews, state.referencePointWorld, viewportManager]);

  const onActualSize = useCallback(() => {
    if (!volume) return;
    const targets = state.linkViews ? MPR_PLANES : [focusedPlane];
    for (const p of targets) {
      const pitch = reformatPitchMm(
        p,
        {
          i: volume.transform.rowDirection,
          j: volume.transform.columnDirection,
          k: volume.transform.sliceNormal,
        },
        volume.spacing,
      );
      viewportManager.actualSize(p, pitch);
    }
  }, [focusedPlane, state.linkViews, viewportManager, volume]);

  /* ----------------------------------------------- automation / QA handle */

  // A stable, documented handle for automated verification (end-to-end tests,
  // acceptance runs and field diagnostics). It exposes state and geometry for
  // READING; it is not a control surface and the application never depends on
  // it. Nothing here alters clinical behaviour.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__MERILVIEW_MPR__ = {
      getState: () => stateManager.getState(),
      getGeometry: () => geometry,
      getVolume: () => volume,
      getCamera: (plane: MPRPlane) => viewportManager.cameraBasis(plane),
      getFocalPoint: (plane: MPRPlane) => viewportManager.focalPoint(plane),
      worldToCanvas: (plane: MPRPlane, world: [number, number, number]) =>
        viewportManager.worldToCanvas(plane, world),
      canvasToWorld: (plane: MPRPlane, point: [number, number]) =>
        viewportManager.canvasToWorld(plane, point),
      setReferencePoint: (world: [number, number, number]) =>
        stateManager.setReferencePoint(world),
      isVolumeLoaded: () => volume !== null,
      getLoadedFraction: () => viewportManager.getLoadedFraction(),
      isFullyLoaded: () => viewportManager.isFullyLoaded(),
      getAnnotations: () => readAnnotationsForQA(),
      sampleValueAtWorld: (world: [number, number, number]) =>
        volume ? viewportManager.sampleValueAtWorld(volume, world) : null,
      intensityStatistics: () => viewportManager.intensityStatistics(),
      blockingMessage: () => blockingMessage,
    };
  }, [blockingMessage, geometry, stateManager, viewportManager, volume]);

  /* ---------------------------------------------------------------- render */

  const layoutClass = state.maximisedPlane ? 'single' : state.layout;
  const warnings = geometry?.issues.filter((i) => i.severity !== 'info') ?? [];

  const showSeriesPicker =
    study !== null && study.candidates.length > 1 && pendingGroup === null;

  return (
    <div className="app">
      <MPRToolbar
        stateManager={stateManager}
        state={state}
        volume={volume}
        focusedPlane={focusedPlane}
        onResetView={onResetView}
        onResetAll={onResetAll}
        onFit={onFit}
        onActualSize={onActualSize}
        onOpenStudy={() => fileInputRef.current?.click()}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".dcm,.DCM,application/dicom"
        style={{ display: 'none' }}
        onChange={(e) => {
          void openFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {loadedFraction < 1 && (
        <div className="banner">
          <span className="code">STREAMING</span>
          <span>
            {loadedCount[0]} of {loadedCount[1]} images loaded — coronal and
            sagittal reformats are incomplete until loading finishes.
          </span>
          <div className="progress" style={{ width: 200, marginLeft: 12 }}>
            <div style={{ width: `${Math.round(loadedFraction * 100)}%` }} />
          </div>
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className={`banner ${w.severity === 'error' ? 'error' : ''}`}>
          <span className="code">{w.code}</span>
          <span>{w.message}</span>
        </div>
      ))}

      {!study && (
        <div className="startup">
          <div className="title">MerilView PRO — MPR</div>
          <div className="hint">
            Load a CT or MRI series to build axial, coronal and sagittal
            reformats from true DICOM patient-space geometry. Localiser and
            scout images are excluded automatically, and a series whose spatial
            geometry cannot be verified is refused rather than approximated.
          </div>
          {blockingMessage && (
            <div
              style={{
                margin: '16px auto',
                padding: '12px 18px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '6px',
                color: '#fca5a5',
                maxWidth: '520px',
                fontSize: '13px',
                lineHeight: '1.5',
                textAlign: 'center',
              }}
            >
              <div style={{ marginBottom: pacsRequest ? '12px' : '0' }}>{blockingMessage}</div>
              {pacsRequest && (
                <button
                  type="button"
                  style={{
                    padding: '8px 18px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  }}
                  onClick={() =>
                    void loadPacsStudy(
                      pacsRequest.studyUid,
                      pacsRequest.seriesUid,
                      pacsRequest.apiBase,
                    )
                  }
                >
                  Retry Loading from PACS
                </button>
              )}
            </div>
          )}
          <label className="file">
            Select DICOM files
            <input
              type="file"
              multiple
              accept=".dcm,.DCM,application/dicom"
              onChange={(e) => void openFiles(e.target.files)}
            />
          </label>
          {progress && (
            <>
              <div>{progress.label}</div>
              <div className="progress">
                <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
            </>
          )}
          {!engineReady && <div className="hint">Starting rendering engine…</div>}
        </div>
      )}

      {showSeriesPicker && study && (
        <SeriesSelector study={study} onSelect={(g) => setPendingGroup(g)} />
      )}

      <div
        className={`workspace ${layoutClass}`}
        style={{ display: study && !showSeriesPicker ? 'grid' : 'none' }}
      >
        {MPR_PLANES.map((plane) => (
          <ViewportPanel
            key={plane}
            plane={plane}
            stateManager={stateManager}
            state={state}
            viewportManager={viewportManager}
            volume={volume}
            patientInfo={patientInfo}
            focused={focusedPlane === plane}
            onFocus={setFocusedPlane}
            registerElement={registerElement}
          />
        ))}

        {blockingMessage && (
          <div className="notice">
            <h3>MPR unavailable for this series</h3>
            {blockingMessage}
          </div>
        )}

        {progress && (
          <div className="notice" style={{ borderColor: 'var(--border-strong)' }}>
            <h3 style={{ color: 'var(--accent)' }}>{progress.label}</h3>
            <div className="progress">
              <div style={{ width: `${Math.round(progress.value * 100)}%` }} />
            </div>
          </div>
        )}

        {state.debugPanelVisible && (
          <DebugPanel geometry={geometry} volume={volume} state={state} />
        )}
      </div>
    </div>
  );
}
