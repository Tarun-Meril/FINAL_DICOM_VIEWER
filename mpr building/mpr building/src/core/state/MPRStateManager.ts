/**
 * MPRStateManager
 * ---------------
 * Centralised, observable state for the MPR workspace.
 *
 * THE INVARIANT: `referencePointWorld` is the single source of truth for
 * "where the radiologist is looking". No viewport keeps its own copy of the
 * anatomical location. Viewports derive their slice from the reference point;
 * they never derive the reference point from their slice index.
 *
 * Consequences enforced by this design:
 *  - moving the crosshair changes one Vec3 and nothing else, so it can never
 *    trigger a volume rebuild;
 *  - synchronisation is exact, because all three cameras are solved from the
 *    same millimetre coordinate rather than from each other's pixel grids.
 */

import type { Vec3 } from '../math/vec';
import type { WindowLevel } from '../wl/WindowLevelManager';
import type { Measurement } from '../measurement/measurement';
import { MPR_PLANES, type MPRPlane } from './planes';

export type MPRTool =
  | 'crosshair'
  | 'windowLevel'
  | 'zoom'
  | 'pan'
  | 'length'
  | 'angle'
  | 'rectangleRoi'
  | 'ellipseRoi'
  | 'probe'
  | 'stackScroll';

export type SlabMode = 'none' | 'average' | 'mip' | 'minip';
export type InterpolationMode = 'nearest' | 'linear';
export type MPRLayout = 'primaryAxial' | 'threeUp' | 'grid' | 'single';

export interface ViewportState {
  readonly plane: MPRPlane;
  /** Independent window/level; ignored while `syncWindowLevel` is on. */
  readonly windowLevel: WindowLevel;
  /** mm. 0 or the voxel pitch means a thin (single-voxel) reformat. */
  readonly slabThicknessMm: number;
  readonly slabMode: SlabMode;
  readonly zoom: number;
  readonly panMm: readonly [number, number];
  readonly rotationDeg: number;
  readonly invert: boolean;
  /**
   * Only meaningful when view linking is OFF: the plane offset this viewport
   * holds independently, expressed as signed millimetres along its own normal.
   */
  readonly independentOffsetMm: number;
}

export interface MPRState {
  readonly activeVolumeId: string | null;
  /** THE source of truth. Patient-space millimetres, LPS. */
  readonly referencePointWorld: Vec3;
  readonly axial: ViewportState;
  readonly coronal: ViewportState;
  readonly sagittal: ViewportState;
  readonly linkViews: boolean;
  readonly crosshairEnabled: boolean;
  readonly referenceLinesEnabled: boolean;
  readonly syncWindowLevel: boolean;
  readonly activeTool: MPRTool;
  readonly layout: MPRLayout;
  /** Plane shown alone in 'single' layout / fullscreen. */
  readonly maximisedPlane: MPRPlane | null;
  readonly interpolation: InterpolationMode;
  readonly showAnnotations: boolean;
  readonly showOrientationMarkers: boolean;
  readonly debugPanelVisible: boolean;
  readonly measurements: readonly Measurement[];
  /** Snapshot for "Restore Previous Position". */
  readonly previousReferencePoint: Vec3 | null;
}

export const DEFAULT_VIEWPORT_STATE = (plane: MPRPlane): ViewportState => ({
  plane,
  windowLevel: { center: 40, width: 400 },
  slabThicknessMm: 0,
  slabMode: 'none',
  zoom: 1,
  panMm: [0, 0],
  rotationDeg: 0,
  invert: false,
  independentOffsetMm: 0,
});

export const INITIAL_STATE: MPRState = {
  activeVolumeId: null,
  referencePointWorld: [0, 0, 0],
  axial: DEFAULT_VIEWPORT_STATE('axial'),
  coronal: DEFAULT_VIEWPORT_STATE('coronal'),
  sagittal: DEFAULT_VIEWPORT_STATE('sagittal'),
  linkViews: true,
  crosshairEnabled: true,
  referenceLinesEnabled: true,
  syncWindowLevel: true,
  activeTool: 'crosshair',
  layout: 'primaryAxial',
  maximisedPlane: null,
  interpolation: 'linear',
  showAnnotations: true,
  showOrientationMarkers: true,
  debugPanelVisible: false,
  measurements: [],
  previousReferencePoint: null,
};

type Listener = (state: MPRState, previous: MPRState) => void;

export class MPRStateManager {
  private state: MPRState;
  private listeners = new Set<Listener>();

  constructor(initial: Partial<MPRState> = {}) {
    this.state = { ...INITIAL_STATE, ...initial };
  }

  getState(): MPRState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: MPRState): void {
    const previous = this.state;
    if (previous === next) return;
    this.state = next;
    for (const l of this.listeners) l(next, previous);
  }

  /* ------------------------------------------------------------------ *
   * Reference point — the only way the anatomical location ever changes *
   * ------------------------------------------------------------------ */

  setReferencePoint(world: Vec3, options: { rememberPrevious?: boolean } = {}): void {
    const s = this.state;
    if (
      s.referencePointWorld[0] === world[0] &&
      s.referencePointWorld[1] === world[1] &&
      s.referencePointWorld[2] === world[2]
    ) {
      return;
    }
    this.commit({
      ...s,
      previousReferencePoint: options.rememberPrevious
        ? s.referencePointWorld
        : s.previousReferencePoint,
      referencePointWorld: world,
    });
  }

  restorePreviousReferencePoint(): void {
    const s = this.state;
    if (!s.previousReferencePoint) return;
    this.commit({
      ...s,
      referencePointWorld: s.previousReferencePoint,
      previousReferencePoint: s.referencePointWorld,
    });
  }

  /* ------------------------------- viewports ------------------------- */

  updateViewport(plane: MPRPlane, patch: Partial<ViewportState>): void {
    const s = this.state;
    this.commit({ ...s, [plane]: { ...s[plane], ...patch } } as MPRState);
  }

  setWindowLevel(plane: MPRPlane, windowLevel: WindowLevel): void {
    const s = this.state;
    if (s.syncWindowLevel) {
      this.commit({
        ...s,
        axial: { ...s.axial, windowLevel },
        coronal: { ...s.coronal, windowLevel },
        sagittal: { ...s.sagittal, windowLevel },
      });
    } else {
      this.updateViewport(plane, { windowLevel });
    }
  }

  setSlab(plane: MPRPlane, slabThicknessMm: number, slabMode?: SlabMode): void {
    const patch: Partial<ViewportState> = { slabThicknessMm };
    if (slabMode) (patch as { slabMode: SlabMode }).slabMode = slabMode;
    if (this.state.linkViews) {
      for (const p of MPR_PLANES) this.updateViewport(p, patch);
    } else {
      this.updateViewport(plane, patch);
    }
  }

  /* --------------------------------- flags --------------------------- */

  set<K extends keyof MPRState>(key: K, value: MPRState[K]): void {
    this.commit({ ...this.state, [key]: value });
  }

  toggle(
    key: 'linkViews' | 'crosshairEnabled' | 'referenceLinesEnabled' | 'syncWindowLevel' | 'showAnnotations' | 'showOrientationMarkers' | 'debugPanelVisible',
  ): void {
    this.commit({ ...this.state, [key]: !this.state[key] });
  }

  setActiveTool(tool: MPRTool): void {
    this.set('activeTool', tool);
  }

  setLayout(layout: MPRLayout, maximisedPlane: MPRPlane | null = null): void {
    this.commit({ ...this.state, layout, maximisedPlane });
  }

  /**
   * Fullscreen a single viewport without disturbing the reference point, so
   * returning to the three-panel layout lands on exactly the same anatomy.
   */
  maximise(plane: MPRPlane | null): void {
    const s = this.state;
    this.commit({
      ...s,
      maximisedPlane: plane,
      layout: plane ? 'single' : s.layout === 'single' ? 'primaryAxial' : s.layout,
    });
  }

  /* ------------------------------ measurements ----------------------- */

  addMeasurement(m: Measurement): void {
    this.commit({ ...this.state, measurements: [...this.state.measurements, m] });
  }

  removeMeasurement(id: string): void {
    this.commit({
      ...this.state,
      measurements: this.state.measurements.filter((m) => m.id !== id),
    });
  }

  clearMeasurements(): void {
    this.commit({ ...this.state, measurements: [] });
  }

  /* --------------------------------- reset --------------------------- */

  resetWindowLevel(defaultWl: WindowLevel): void {
    const s = this.state;
    this.commit({
      ...s,
      axial: { ...s.axial, windowLevel: defaultWl },
      coronal: { ...s.coronal, windowLevel: defaultWl },
      sagittal: { ...s.sagittal, windowLevel: defaultWl },
    });
  }

  /** Reset zoom/pan/rotation for one viewport. Reference point is untouched. */
  resetViewport(plane: MPRPlane): void {
    this.updateViewport(plane, {
      zoom: 1,
      panMm: [0, 0],
      rotationDeg: 0,
      invert: false,
    });
  }

  resetAllViewports(): void {
    for (const p of MPR_PLANES) this.resetViewport(p);
  }

  /** Full reset back to a known-valid patient-space state. */
  resetAll(volumeCentreWorld: Vec3, defaultWl: WindowLevel): void {
    this.commit({
      ...INITIAL_STATE,
      activeVolumeId: this.state.activeVolumeId,
      measurements: this.state.measurements,
      referencePointWorld: volumeCentreWorld,
      axial: { ...DEFAULT_VIEWPORT_STATE('axial'), windowLevel: defaultWl },
      coronal: { ...DEFAULT_VIEWPORT_STATE('coronal'), windowLevel: defaultWl },
      sagittal: { ...DEFAULT_VIEWPORT_STATE('sagittal'), windowLevel: defaultWl },
    });
  }
}
