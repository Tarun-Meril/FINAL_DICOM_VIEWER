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
