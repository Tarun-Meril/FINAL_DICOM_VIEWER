import { useCallback, useEffect, useRef, useState } from 'react';
import { Enums as CoreEnums, eventTarget } from '@cornerstonejs/core';
import type { MPRPlane } from '../core/state/planes';
import { PLANE_CAMERAS, PLANE_LABELS, planeScreenRight } from '../core/state/planes';
import type { MPRStateManager, MPRState } from '../core/state/MPRStateManager';
import { VIEWPORT_IDS, type MPRViewportManager } from '../engine/MPRViewportManager';
import type { VolumeDescriptor } from '../core/volume/VolumeBuilder';
import type { PatientStudyInfo } from '../dicom/parseFrames';
import { OrientationMarkers } from './OrientationMarkers';
import { referenceLinesForViewport, reformatPitchMm, stepReferencePoint } from '../core/crosshair/CrosshairManager';
import { sliceInfoForPlane, clampReferenceToVolume } from '../core/state/SliceNavigation';
import { formatWindowLevel } from '../core/wl/WindowLevelManager';
import { unitsLabel } from '../core/volume/modality';
import type { Vec3 } from '../core/math/vec';

const PLANE_COLOUR: Record<MPRPlane, string> = {
  axial: '#ffd400',
  coronal: '#37d67a',
  sagittal: '#ff6b6b',
};

interface Props {
  plane: MPRPlane;
  stateManager: MPRStateManager;
  state: MPRState;
  viewportManager: MPRViewportManager;
  volume: VolumeDescriptor | null;
  patientInfo: PatientStudyInfo;
  focused: boolean;
  onFocus: (plane: MPRPlane) => void;
  registerElement: (plane: MPRPlane, element: HTMLDivElement | null) => void;
}

export function ViewportPanel({
  plane,
  stateManager,
  state,
  viewportManager,
  volume,
  patientInfo,
  focused,
  onFocus,
  registerElement,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraTick, setCameraTick] = useState(0);

  // Stable callback ref: an inline arrow would be a new function on every
  // render, causing React to detach and re-attach the viewport host each time
  // and thrashing the rendering engine's element registration.
  const setHostElement = useCallback(
    (element: HTMLDivElement | null) => {
      hostRef.current = element;
      registerElement(plane, element);
    },
    [plane, registerElement],
  );

  const viewportState = state[plane];

  /* --------------------------------------------------------------- overlay */

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !volume) return;

    const dpr = window.devicePixelRatio || 1;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const reference = state.referencePointWorld;

    if (state.referenceLinesEnabled) {
      const focal = viewportManager.focalPoint(plane);
      const extents = viewportManager.visibleHalfExtentsMm(plane);
      if (focal && extents) {
        const segments = referenceLinesForViewport(plane, reference, {
          centre: focal,
          halfWidthMm: extents[0],
          halfHeightMm: extents[1],
        });
        for (const segment of segments) {
          const a = viewportManager.worldToCanvas(plane, segment.start);
          const b = viewportManager.worldToCanvas(plane, segment.end);
          if (!a || !b) continue;
          ctx.save();
          ctx.strokeStyle = PLANE_COLOUR[segment.sourcePlane];
          ctx.globalAlpha = 0.65;
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    if (state.crosshairEnabled) {
      const centre = viewportManager.worldToCanvas(plane, reference);
      if (centre) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1;
        const gap = 7;
        const arm = 16;
        ctx.beginPath();
        ctx.moveTo(centre[0] - gap - arm, centre[1]);
        ctx.lineTo(centre[0] - gap, centre[1]);
        ctx.moveTo(centre[0] + gap, centre[1]);
        ctx.lineTo(centre[0] + gap + arm, centre[1]);
        ctx.moveTo(centre[0], centre[1] - gap - arm);
        ctx.lineTo(centre[0], centre[1] - gap);
        ctx.moveTo(centre[0], centre[1] + gap);
        ctx.lineTo(centre[0], centre[1] + gap + arm);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [plane, state, viewportManager, volume]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay, cameraTick]);

  /* ------------------------------------------------- camera / resize sync */

  useEffect(() => {
    const bump = () => setCameraTick((t) => t + 1);
    const onVoiModified = (evt: any) => {
      const detail = evt?.detail;
      if (!detail || detail.viewportId !== VIEWPORT_IDS[plane]) return;
      const range = detail.range;
      if (range && Number.isFinite(range.lower) && Number.isFinite(range.upper)) {
        const center = Math.round((range.lower + range.upper) / 2);
        const width = Math.round(Math.max(1, range.upper - range.lower));
        stateManager.setWindowLevel(plane, { center, width });
      }
    };
    eventTarget.addEventListener(CoreEnums.Events.CAMERA_MODIFIED, bump);
    eventTarget.addEventListener(CoreEnums.Events.IMAGE_RENDERED, bump);
    eventTarget.addEventListener(CoreEnums.Events.VOI_MODIFIED, onVoiModified);
    return () => {
      eventTarget.removeEventListener(CoreEnums.Events.CAMERA_MODIFIED, bump);
      eventTarget.removeEventListener(CoreEnums.Events.IMAGE_RENDERED, bump);
      eventTarget.removeEventListener(CoreEnums.Events.VOI_MODIFIED, onVoiModified);
    };
  }, [plane, stateManager]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      viewportManager.resize();
      setCameraTick((t) => t + 1);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [viewportManager]);

  /* ------------------------------------------------------- interactions */

  const pitchMm = volume
    ? reformatPitchMm(
        plane,
        {
          i: volume.transform.rowDirection,
          j: volume.transform.columnDirection,
          k: volume.transform.sliceNormal,
        },
        volume.spacing,
      )
    : 1;

  // React attaches wheel handlers passively at the document root, where
  // preventDefault is ignored and logs an error. Slice scrolling must stop the
  // page from scrolling, so the listener is attached directly to the panel as
  // non-passive.
  const wheelStateRef = useRef({ plane, pitchMm, volume, stateManager, state });
  wheelStateRef.current = { plane, pitchMm, volume, stateManager, state };

  useEffect(() => {
    const host = panelRef.current;
    if (!host) return;
    const onWheelNative = (event: WheelEvent) => {
      const ctx = wheelStateRef.current;
      if (!ctx.volume) return;
      event.preventDefault();

      // Zoom support: active zoom tool OR holding Ctrl / Cmd
      if (ctx.state.activeTool === 'zoom' || event.ctrlKey || event.metaKey) {
        const factor = event.deltaY > 0 ? 1.08 : 0.92;
        viewportManager.zoomViewport(ctx.plane, factor, ctx.state.linkViews);
        return;
      }

      // Default: slice scrolling
      const steps = event.deltaY > 0 ? 1 : -1;
      const next = stepReferencePoint(
        ctx.plane,
        ctx.state.referencePointWorld,
        steps,
        ctx.pitchMm,
      );
      ctx.stateManager.setReferencePoint(
        clampReferenceToVolume(next, ctx.volume.transform),
      );
    };
    host.addEventListener('wheel', onWheelNative, { passive: false });
    return () => host.removeEventListener('wheel', onWheelNative);
  }, [viewportManager]);

  const worldFromEvent = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): Vec3 | null => {
      const host = hostRef.current;
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      return viewportManager.canvasToWorld(plane, [
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
    },
    [plane, viewportManager],
  );

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onFocus(plane);
      if (event.button !== 0) return;
      if (state.activeTool !== 'crosshair') return;
      const world = worldFromEvent(event);
      if (!world || !volume) return;
      stateManager.setReferencePoint(
        clampReferenceToVolume(world, volume.transform),
        { rememberPrevious: true },
      );
    },
    [onFocus, plane, state.activeTool, stateManager, volume, worldFromEvent],
  );

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (state.activeTool !== 'crosshair') return;
      if (event.buttons !== 1) return;
      const world = worldFromEvent(event);
      if (!world || !volume) return;
      stateManager.setReferencePoint(
        clampReferenceToVolume(world, volume.transform),
      );
    },
    [state.activeTool, stateManager, volume, worldFromEvent],
  );

  const onDoubleClick = useCallback(() => {
    stateManager.maximise(state.maximisedPlane === plane ? null : plane);
  }, [plane, state.maximisedPlane, stateManager]);

  // Touch gesture support: 1-finger crosshair/scroll/wl/pan, 2-finger pinch zoom & pan, double-tap maximize
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastDist: number;
    lastTap: number;
    isPinching: boolean;
  }>({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastDist: 0,
    lastTap: 0,
    isPinching: false,
  });

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      onFocus(plane);
      const ts = touchStateRef.current;
      const now = Date.now();

      // Double tap to maximize/restore
      if (e.touches.length === 1 && now - ts.lastTap < 300) {
        stateManager.maximise(state.maximisedPlane === plane ? null : plane);
        ts.lastTap = 0;
        return;
      }
      ts.lastTap = now;

      if (e.touches.length === 1) {
        ts.isPinching = false;
        const t = e.touches[0];
        ts.startX = t.clientX;
        ts.startY = t.clientY;
        ts.lastX = t.clientX;
        ts.lastY = t.clientY;

        if (state.activeTool === 'crosshair') {
          const host = hostRef.current;
          if (host && volume) {
            const rect = host.getBoundingClientRect();
            const world = viewportManager.canvasToWorld(plane, [
              t.clientX - rect.left,
              t.clientY - rect.top,
            ]);
            if (world) {
              stateManager.setReferencePoint(
                clampReferenceToVolume(world, volume.transform),
                { rememberPrevious: true },
              );
            }
          }
        }
      } else if (e.touches.length === 2) {
        ts.isPinching = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        ts.lastDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        ts.lastX = (t1.clientX + t2.clientX) / 2;
        ts.lastY = (t1.clientY + t2.clientY) / 2;
      }
    },
    [onFocus, plane, state.activeTool, state.maximisedPlane, stateManager, viewportManager, volume],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const ts = touchStateRef.current;
      if (!volume) return;

      if (e.touches.length === 1 && !ts.isPinching) {
        const t = e.touches[0];
        const dx = t.clientX - ts.lastX;
        const dy = t.clientY - ts.lastY;
        ts.lastX = t.clientX;
        ts.lastY = t.clientY;

        if (state.activeTool === 'crosshair') {
          const host = hostRef.current;
          if (host) {
            const rect = host.getBoundingClientRect();
            const world = viewportManager.canvasToWorld(plane, [
              t.clientX - rect.left,
              t.clientY - rect.top,
            ]);
            if (world) {
              stateManager.setReferencePoint(
                clampReferenceToVolume(world, volume.transform),
              );
            }
          }
        } else if (state.activeTool === 'windowLevel') {
          const wl = viewportState.windowLevel;
          stateManager.setWindowLevel(plane, {
            width: Math.max(1, Math.round(wl.width + dx * 2)),
            center: Math.round(wl.center - dy * 2),
          });
        } else if (state.activeTool === 'pan') {
          const vp = viewportManager.getViewport(plane);
          if (vp) {
            const cam = vp.getCamera();
            const currentFocal = (cam.focalPoint ?? [0, 0, 0]) as unknown as Vec3;
            const currentPos = (cam.position ?? [0, 0, 0]) as unknown as Vec3;
            const panSens = (cam.parallelScale || 100) / 200;
            vp.setCamera({
              ...cam,
              focalPoint: [currentFocal[0] - dx * panSens, currentFocal[1] + dy * panSens, currentFocal[2]],
              position: [currentPos[0] - dx * panSens, currentPos[1] + dy * panSens, currentPos[2]],
            });
            viewportManager.render();
          }
        } else if (state.activeTool === 'zoom') {
          const factor = dy > 0 ? 1.04 : 0.96;
          viewportManager.zoomViewport(plane, factor, state.linkViews);
        } else {
          // If dragging up/down in default mode, step slices smoothly!
          const totalDy = t.clientY - ts.startY;
          if (Math.abs(totalDy) > 20) {
            const steps = totalDy > 0 ? 1 : -1;
            ts.startY = t.clientY;
            const next = stepReferencePoint(
              plane,
              state.referencePointWorld,
              steps,
              pitchMm,
            );
            stateManager.setReferencePoint(
              clampReferenceToVolume(next, volume.transform),
            );
          }
        }
      } else if (e.touches.length === 2) {
        // 2-finger pinch to zoom & pan
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (ts.lastDist > 0 && Math.abs(dist - ts.lastDist) > 2) {
          const factor = ts.lastDist / dist;
          viewportManager.zoomViewport(plane, factor, state.linkViews);
        }
        ts.lastDist = dist;

        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dx = midX - ts.lastX;
        const dy = midY - ts.lastY;
        ts.lastX = midX;
        ts.lastY = midY;

        const vp = viewportManager.getViewport(plane);
        if (vp && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
          const cam = vp.getCamera();
          const currentFocal = (cam.focalPoint ?? [0, 0, 0]) as unknown as Vec3;
          const currentPos = (cam.position ?? [0, 0, 0]) as unknown as Vec3;
          const panSens = (cam.parallelScale || 100) / 200;
          vp.setCamera({
            ...cam,
            focalPoint: [currentFocal[0] - dx * panSens, currentFocal[1] + dy * panSens, currentFocal[2]],
            position: [currentPos[0] - dx * panSens, currentPos[1] + dy * panSens, currentPos[2]],
          });
          viewportManager.render();
        }
      }
    },
    [pitchMm, plane, state.activeTool, state.linkViews, state.referencePointWorld, stateManager, viewportManager, viewportState.windowLevel, volume],
  );

  const onTouchEnd = useCallback(() => {
    touchStateRef.current.isPinching = false;
    touchStateRef.current.lastDist = 0;
  }, []);

  /* ------------------------------------------------------------ annotations */

  const basis = viewportManager.cameraBasis(plane);
  const viewUp = basis?.viewUp ?? PLANE_CAMERAS[plane].viewUp;
  const viewRight = basis
    ? planeScreenRightFromBasis(basis.viewUp, basis.viewPlaneNormal)
    : planeScreenRight(plane);

  const sliceInfo = volume
    ? sliceInfoForPlane(
        plane,
        state.referencePointWorld,
        volume.transform,
        viewportState.slabThicknessMm,
      )
    : null;

  return (
    <div
      className={`panel ${plane} ${focused ? 'focused' : ''} tool-${state.activeTool} ${
        state.maximisedPlane && state.maximisedPlane !== plane ? 'hidden' : ''
      }`}
      ref={panelRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onDoubleClick={onDoubleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="viewport"
        ref={setHostElement}
      />
      <canvas className="overlay" ref={overlayRef} />
      <div className="focus-ring" />

      {state.showAnnotations && (
        <div className="annotations">
          <div className="corner tl">
            <div className={`plane-tag ${plane}`}>{PLANE_LABELS[plane]}</div>
            <div>{patientInfo.patientName ?? '—'}</div>
            <div className="dim">{patientInfo.patientId ?? ''}</div>
            <div className="dim">
              {[patientInfo.studyDate, patientInfo.studyDescription]
                .filter(Boolean)
                .join('  ')}
            </div>
          </div>

          <div className="corner tr">
            <div>
              {volume?.modality ?? ''} {volume ? `· ${unitsLabel(volume.units)}` : ''}
            </div>
            <div className="dim">{patientInfo.seriesDescription ?? ''}</div>
            {patientInfo.seriesNumber !== undefined && (
              <div className="dim">Series {patientInfo.seriesNumber}</div>
            )}
          </div>

          <div className="corner bl">
            {sliceInfo && (
              <>
                <div>
                  Slice {sliceInfo.index} / {sliceInfo.total}
                </div>
                <div className="dim">
                  Pos {sliceInfo.positionMm.toFixed(1)} mm
                </div>
                <div className="dim">
                  Thk {sliceInfo.thicknessMm.toFixed(2)} mm · Sp{' '}
                  {sliceInfo.pitchMm.toFixed(2)} mm
                </div>
              </>
            )}
          </div>

          <div className="corner br">
            <div>
              {formatWindowLevel(viewportState.windowLevel, volume?.units ?? 'unknown')}
            </div>
            {volume && (
              <div className="dim">
                {volume.spacing.map((v) => v.toFixed(2)).join(' × ')} mm
              </div>
            )}
            <div className="dim">
              {state.referencePointWorld
                .map((v, i) => `${'XYZ'[i]} ${v.toFixed(1)}`)
                .join('  ')}
            </div>
          </div>
        </div>
      )}

      {state.showOrientationMarkers && volume && (
        <OrientationMarkers viewUp={viewUp} viewRight={viewRight} />
      )}
    </div>
  );
}

function planeScreenRightFromBasis(viewUp: Vec3, viewPlaneNormal: Vec3): Vec3 {
  return [
    viewUp[1] * viewPlaneNormal[2] - viewUp[2] * viewPlaneNormal[1],
    viewUp[2] * viewPlaneNormal[0] - viewUp[0] * viewPlaneNormal[2],
    viewUp[0] * viewPlaneNormal[1] - viewUp[1] * viewPlaneNormal[0],
  ];
}
