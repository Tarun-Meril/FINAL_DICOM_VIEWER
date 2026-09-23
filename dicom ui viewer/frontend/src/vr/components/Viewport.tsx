import { useEffect, useRef, useState, useCallback } from 'react';
import { VolumeRenderEngine } from '@3d/rendering/engine';
import { resolveClipPlanes, resolveCropPlanes, cropBoxWorld } from '@3d/rendering/clipping';
import { screenDirections, type CameraState } from '@3d/rendering/camera';
import { anatomicalLabel } from '@3d/dicom/geometry';
import { rayThroughPixel, pickFirstHit, pickMaximum, worldToScreen } from '@3d/measurement/picking';
import { measure, type MeasurementBase, type MeasurementKind } from '@3d/measurement/measurements';
import { sculptSphere, sculptPolygonPrism, regionGrow } from '@3d/segmentation/operations';
import { useAppStore } from '@vr/state/store';
import { getSession, syncDisplay } from '@vr/state/session';
import { OrientationCube } from './OrientationCube';
import { logger, scopedLogger } from '@3d/core/logger';
import { MedViewError } from '@3d/core/errors';
import type { Vec3 } from '@3d/math/vec3';
import { normalize, cross, sub } from '@3d/math/vec3';

const log = scopedLogger('viewport');

/** Tools that build a measurement from N picked points. */
const MEASURE_POINTS: Partial<Record<string, { kind: MeasurementKind; points: number }>> = {
  'measure-distance': { kind: 'distance', points: 2 },
  'measure-angle': { kind: 'angle', points: 3 },
  'measure-polyline': { kind: 'polyline', points: Number.POSITIVE_INFINITY },
  probe: { kind: 'point', points: 1 },
};

export function Viewport(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VolumeRenderEngine | null>(null);
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  const [draft, setDraft] = useState<Vec3[]>([]);
  const [polygon, setPolygon] = useState<Array<[number, number]>>([]);
  const [hover, setHover] = useState<{ hu: number; world: Vec3 } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const s = useAppStore();

  /* ------------------------------------------------------------ engine */
  useEffect(() => {
    if (!hostRef.current || !s.load) return;
    let engine: VolumeRenderEngine;
    try {
      engine = new VolumeRenderEngine(hostRef.current);
    } catch (e) {
      useAppStore.getState().setError({
        message: e instanceof MedViewError ? e.message : String(e),
        detail: e instanceof MedViewError ? e.detail : undefined,
        code: e instanceof MedViewError ? e.code : undefined,
      });
      return;
    }
    engineRef.current = engine;
    const session = getSession();
    if (session) session.engine = engine;

    try {
      engine.setVolume(s.load.volume, session?.display, s.load.qualityNotice);
      engine.setTransferFunction(useAppStore.getState().transferFunction);
      engine.applyCameraPreset('anterior', useAppStore.getState().parallelProjection);
      engine.fitVolume();
      engine.renderNow();
      setCamera(engine.getCameraState());
    } catch (e) {
      useAppStore.getState().setError({
        message: e instanceof MedViewError ? e.message : 'The volume could not be uploaded to the graphics device.',
        detail: e instanceof MedViewError ? e.detail : String(e),
        code: e instanceof MedViewError ? e.code : undefined,
      });
    }

    // Overlays (direction letters, orientation cube, measurement projection) are driven
    // by camera state, so they subscribe to the camera itself rather than to interaction
    // events — a toolbar preset or a restored presentation state moves the camera too.
    let camPending = false;
    const unsubscribeCamera = engine.onCameraChanged((state) => {
      if (camPending) return;
      camPending = true;
      requestAnimationFrame(() => { camPending = false; setCamera(state); });
    });

    const ro = new ResizeObserver(() => {
      engine.resize();
      const el = hostRef.current;
      if (el) setSize([el.clientWidth, el.clientHeight]);
    });
    ro.observe(hostRef.current);
    setSize([hostRef.current.clientWidth, hostRef.current.clientHeight]);

    // Automation bridge used by the E2E suite and the dataset-validation harness.
    // It exposes the same services the UI calls, so a scripted run exercises real code.
    (window as unknown as Record<string, unknown>).__medview = {
      engine,
      store: useAppStore,
      getSession,
      syncDisplay,
      logger,
      services: {
        captureScreenshot: (o?: unknown) => import('@vr/services/exportService').then((m) => m.captureScreenshot(o as never)),
        capturePresentationState: () => import('@vr/services/exportService').then((m) => m.capturePresentationState()),
      },
      ops: {
        segmentation: () => import('@3d/segmentation/operations'),
        boneRemoval: () => import('@3d/segmentation/boneRemoval'),
        measurements: () => import('@3d/measurement/measurements'),
        picking: () => import('@3d/measurement/picking'),
        surface: () => import('@3d/rendering/surface'),
      },
    };

    const statTimer = setInterval(() => {
      useAppStore.getState().setRenderStats(
        engine.stats.lastRenderMs > 0 ? 1000 / engine.stats.lastRenderMs : null, engine.stats.lastRenderMs);
    }, 700);

    return () => {
      clearInterval(statTimer);
      ro.disconnect();
      unsubscribeCamera();
      engine.dispose();
      engineRef.current = null;
      if (session) session.engine = null;
    };
  }, [s.load]);

  /* ------------------------------------------------- reactive settings */
  useEffect(() => { engineRef.current?.setTransferFunction(s.transferFunction); }, [s.transferFunction]);
  useEffect(() => { engineRef.current?.setQuality(s.quality); }, [s.quality]);
  useEffect(() => { engineRef.current?.setVolumeVisible(s.showVolume && s.renderMode !== 'surface'); }, [s.showVolume, s.renderMode]);
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setParallelProjection(s.parallelProjection);
    setCamera(e.getCameraState());
  }, [s.parallelProjection]);
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !s.load) return;
    e.setClippingPlanes([
      ...resolveClipPlanes(s.clipping, s.load.volume.geometry),
      ...resolveCropPlanes(s.cropBox, s.load.volume.geometry),
    ]);
  }, [s.clipping, s.cropBox, s.load]);

  /* --------------------------------------------------------- picking */
  const pickAt = useCallback((clientX: number, clientY: number) => {
    const e = engineRef.current;
    const host = hostRef.current;
    const session = getSession();
    if (!e || !host || !session) return null;
    const rect = host.getBoundingClientRect();
    const cam = e.getCameraState();
    const ray = rayThroughPixel(cam, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    const store = useAppStore.getState();
    const visibility = session.masked ? session.visibility.values : null;
    return store.blendMode === 'mip'
      ? pickMaximum(ray, session.volume.scalars, session.volume.geometry, { visibility })
      : pickFirstHit(ray, session.volume.scalars, session.volume.geometry, store.transferFunction, { visibility });
  }, []);

  const finishMeasurement = useCallback((kind: MeasurementKind, points: Vec3[], hu?: number) => {
    const session = getSession();
    const m: MeasurementBase = {
      id: `m${Date.now().toString(36)}`,
      kind,
      // A probe reads a value rather than a length, so the value is its label — and that
      // keeps the reading after serialisation, when the transfer function may have moved.
      label: kind === 'point' && hu !== undefined ? `${Math.round(hu)} HU` : '',
      color: [0.94, 0.78, 0.29], visible: true,
      createdAt: Date.now(), points,
      spatiallyValid: session ? session.volume.geometry.spacingSource === 'measured' : false,
    };
    useAppStore.getState().addMeasurement(m);
    setDraft([]);
  }, []);

  const onPointerDown = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    const store = useAppStore.getState();
    const session = getSession();
    if (store.tool === 'navigate' || !session) return;
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();

    const host = hostRef.current!;
    const rect = host.getBoundingClientRect();

    if (store.tool === 'sculpt-polygon-erase' || store.tool === 'sculpt-polygon-keep') {
      setPolygon((p) => [...p, [ev.clientX - rect.left, ev.clientY - rect.top]]);
      return;
    }

    const hit = pickAt(ev.clientX, ev.clientY);
    if (!hit) return;

    const mp = MEASURE_POINTS[store.tool];
    if (mp) {
      const next = [...draft, hit.world];
      if (mp.points !== Number.POSITIVE_INFINITY && next.length >= mp.points) {
        finishMeasurement(mp.kind, next, mp.kind === 'point' ? hit.hu : undefined);
      }
      else setDraft(next);
      return;
    }

    if (store.tool === 'sculpt-brush-erase' || store.tool === 'sculpt-brush-keep') {
      const delta = sculptSphere(session.visibility.values, session.volume.geometry, hit.world,
        store.brushRadiusMm, store.tool === 'sculpt-brush-erase' ? 'erase' : 'keep');
      session.history.push({ delta, target: 'visibility', at: Date.now() });
      syncDisplay(session);
      pushHistoryState();
      return;
    }

    if (store.tool === 'seed-region-grow' && store.activeSegmentId !== null) {
      setBusy('Growing region…');
      setTimeout(() => {
        const [nx, ny] = session.volume.geometry.dimensions;
        const seedIndex = hit.index[2] * nx * ny + hit.index[1] * nx + hit.index[0];
        const tol = 120;
        const delta = regionGrow(session.volume, session.labels, store.activeSegmentId!, {
          seedIndex, lower: hit.hu - tol, upper: hit.hu + tol, connectivity: 6,
          withinVisible: session.masked ? session.visibility.values : undefined,
        });
        session.history.push({ delta, target: 'labels', at: Date.now() });
        const stats = session.labels.stats(store.activeSegmentId!, session.volume);
        store.setSegmentStats(store.activeSegmentId!, { voxelCount: stats.voxelCount, volumeMm3: stats.volumeMm3 });
        pushHistoryState();
        setBusy(null);
        log.info('region grow', { seedHU: hit.hu, voxels: stats.voxelCount });
      }, 20);
    }
  }, [draft, pickAt, finishMeasurement]);

  // Picking is a CPU ray cast, so it runs at most once per animation frame; without the
  // throttle a fast mouse move queues dozens of casts and the pointer visibly lags.
  const hoverPending = useRef(false);
  const onPointerMove = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    const store = useAppStore.getState();
    if (store.tool === 'navigate') { if (hover) setHover(null); return; }
    if (hoverPending.current) return;
    hoverPending.current = true;
    const { clientX, clientY } = ev;
    requestAnimationFrame(() => {
      hoverPending.current = false;
      const hit = pickAt(clientX, clientY);
      setHover(hit ? { hu: hit.hu, world: hit.world } : null);
    });
  }, [pickAt, hover]);

  const commitPolygon = useCallback(() => {
    const session = getSession();
    const e = engineRef.current;
    const store = useAppStore.getState();
    if (!session || !e || polygon.length < 3) { setPolygon([]); return; }
    setBusy('Applying polygon cut…');
    setTimeout(() => {
      const cam = e.getCameraState();
      const host = hostRef.current!;
      const rect = host.getBoundingClientRect();
      const dirs = screenDirections(cam);
      const forward = normalize(sub(cam.focalPoint, cam.position));
      const planeOrigin = cam.focalPoint;
      const planeU = normalize(cross(forward, cam.viewUp));
      const planeV = dirs.up;
      // Project each polygon vertex onto the focal plane.
      const world: Vec3[] = polygon.map(([px, py]) => {
        const ray = rayThroughPixel(cam, px, py, rect.width, rect.height);
        const denom = ray.direction[0] * forward[0] + ray.direction[1] * forward[1] + ray.direction[2] * forward[2];
        const t = denom === 0 ? 0 :
          ((planeOrigin[0] - ray.origin[0]) * forward[0] + (planeOrigin[1] - ray.origin[1]) * forward[1] + (planeOrigin[2] - ray.origin[2]) * forward[2]) / denom;
        return [ray.origin[0] + ray.direction[0] * t, ray.origin[1] + ray.direction[1] * t, ray.origin[2] + ray.direction[2] * t];
      });
      const delta = sculptPolygonPrism(session.visibility.values, session.volume.geometry, world,
        planeU, planeV, planeOrigin, store.tool === 'sculpt-polygon-keep' ? 'keep' : 'erase');
      session.history.push({ delta, target: 'visibility', at: Date.now() });
      syncDisplay(session);
      pushHistoryState();
      setPolygon([]);
      setBusy(null);
      log.info('polygon sculpt', { vertices: world.length, changed: delta.changed });
    }, 20);
  }, [polygon]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && polygon.length >= 3) commitPolygon();
      if (ev.key === 'Escape') { setPolygon([]); setDraft([]); }
      if (ev.key === 'Enter' && draft.length >= 2 && useAppStore.getState().tool === 'measure-polyline') {
        finishMeasurement('polyline', draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [polygon, draft, commitPolygon, finishMeasurement]);

  /* --------------------------------------------------------- overlays */
  const dirs = camera ? screenDirections(camera) : null;
  const geometry = s.load?.volume.geometry;
  const cropWorld = geometry && s.cropBox.enabled ? cropBoxWorld(s.cropBox, geometry) : null;

  return (
    <div className="viewport-wrap">
      <div
        ref={hostRef}
        className="viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => { engineRef.current?.fitVolume(); setCamera(engineRef.current?.getCameraState() ?? null); }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: s.tool === 'navigate' ? 'grab' : 'crosshair' }}
      />

      <svg className="measure-svg" width={size[0]} height={size[1]}>
        {camera && s.measurements.filter((m) => m.visible).map((m) => {
          const pts = m.points.map((p) => worldToScreen(camera, p, size[0], size[1]));
          if (pts.some((p) => p.behind || !Number.isFinite(p.x))) return null;
          const v = measure(m, geometry);
          const colour = `rgb(${m.color.map((c) => Math.round(c * 255)).join(',')})`;
          return (
            <g key={m.id}>
              {pts.length > 1 && (
                <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke={colour} strokeWidth={1.4} strokeDasharray={m.kind === 'angle' ? '0' : '0'} />
              )}
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={colour} stroke="#000" strokeWidth={0.8} />)}
              <text x={pts[pts.length - 1].x + 9} y={pts[pts.length - 1].y - 7}
                fill={colour} fontSize={11} fontFamily="ui-monospace, monospace"
                style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>
                {m.label ? `${m.label}: ` : ''}{v.display}
              </text>
            </g>
          );
        })}
        {camera && draft.length > 0 && (
          <g>
            {draft.length > 1 && (
              <polyline points={draft.map((p) => { const q = worldToScreen(camera, p, size[0], size[1]); return `${q.x},${q.y}`; }).join(' ')}
                fill="none" stroke="#f0c84a" strokeWidth={1.2} strokeDasharray="4 3" />
            )}
            {draft.map((p, i) => {
              const q = worldToScreen(camera, p, size[0], size[1]);
              return <circle key={i} cx={q.x} cy={q.y} r={3} fill="#f0c84a" />;
            })}
          </g>
        )}
        {polygon.length > 0 && (
          <polygon points={polygon.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="rgba(214,99,90,0.16)" stroke="#d6635a" strokeWidth={1.3} strokeDasharray="5 3" />
        )}
        {camera && cropWorld && (() => {
          const corners: Vec3[] = [];
          for (let c = 0; c < 8; c++) {
            corners.push([
              c & 1 ? cropWorld.max[0] : cropWorld.min[0],
              c & 2 ? cropWorld.max[1] : cropWorld.min[1],
              c & 4 ? cropWorld.max[2] : cropWorld.min[2],
            ]);
          }
          const p = corners.map((w) => worldToScreen(camera, w, size[0], size[1]));
          const edges: Array<[number, number]> = [[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]];
          if (p.some((q) => q.behind)) return null;
          return <g stroke="#4d9cd6" strokeWidth={1} fill="none" opacity={0.75}>
            {edges.map(([a, b], i) => <line key={i} x1={p[a].x} y1={p[a].y} x2={p[b].x} y2={p[b].y} />)}
          </g>;
        })()}
      </svg>

      <div className="overlay">
        {s.directionLabelsVisible && dirs && (
          <>
            <span className="dir-label dir-n">{anatomicalLabel(dirs.up)}</span>
            <span className="dir-label dir-s">{anatomicalLabel(dirs.down)}</span>
            <span className="dir-label dir-w">{anatomicalLabel(dirs.left)}</span>
            <span className="dir-label dir-e">{anatomicalLabel(dirs.right)}</span>
          </>
        )}
        <div className="corner tl">
          <div>{s.load?.series.modality} · {s.load?.series.seriesDescription}</div>
          <div>Series {s.load?.series.seriesNumber} · {s.load?.volume.geometry.dimensions.join(' × ')}</div>
          <div>{s.load?.volume.geometry.spacing.map((v) => v.toFixed(3)).join(' × ')} mm</div>
        </div>
        <div className="corner tr">
          <div>{s.transferFunction.name}</div>
          <div>{s.blendMode === 'composite' ? 'Volume Rendering' : s.blendMode.toUpperCase()}</div>
          <div>{s.parallelProjection ? 'Orthographic' : 'Perspective'}</div>
          {s.qualityNotice && <div style={{ color: 'var(--warn)' }}>Reduced resolution</div>}
        </div>
        <div className="corner bl">
          {hover && <div>{Math.round(hover.hu)} HU @ {hover.world.map((v) => v.toFixed(0)).join(', ')} (LPS mm)</div>}
          {polygon.length > 0 && <div>Polygon: {polygon.length} points — Enter to apply, Esc to cancel</div>}
          {draft.length > 0 && <div>{draft.length} point(s) placed{s.tool === 'measure-polyline' ? ' — Enter to finish' : ''}</div>}
        </div>
      </div>

      {s.orientationCubeVisible && (
        <div style={{ position: 'absolute', right: 12, bottom: 12, pointerEvents: 'auto' }}>
          <OrientationCube camera={camera} size={104} onPick={(label) => {
            const map = { L: 'left', R: 'right', A: 'anterior', P: 'posterior', S: 'superior', I: 'inferior' } as const;
            engineRef.current?.applyCameraPreset(map[label], s.parallelProjection);
            useAppStore.getState().setCameraPreset(map[label]);
            setCamera(engineRef.current?.getCameraState() ?? null);
          }} />
        </div>
      )}

      {busy && <div className="busy"><div className="box"><div>{busy}</div></div></div>}
    </div>
  );
}

function pushHistoryState(): void {
  const session = getSession();
  if (!session) return;
  useAppStore.getState().setHistoryState(
    session.history.canUndo(), session.history.canRedo(), session.history.labels());
}
