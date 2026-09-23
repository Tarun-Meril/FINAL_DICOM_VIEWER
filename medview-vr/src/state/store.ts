import { create } from 'zustand';
import { BUILT_IN_PRESETS, chooseInitialPreset, adaptPresetToVolume, emptyCustomPreset } from '@/rendering/presets';
import { PRESET_BONE } from '@/rendering/presets';
import { defaultClipState, defaultCropBox, type ClipPlaneState, type CropBoxState } from '@/rendering/clipping';
import type { TransferFunction, BlendMode } from '@/rendering/transferFunction';
import type { QualityLevel } from '@/rendering/engine';
import type { RenderMode, SurfaceLayerState } from './presentationState';
import type { SegmentationObject } from '@/segmentation/types';
import type { MeasurementBase } from '@/measurement/measurements';
import type { LoadResult } from '@/services/datasetLoader';
import type { DiagnosticIssue } from '@/core/errors';
import type { ProgressEvent } from '@/dicom/ingest';
import type { CameraPresetId } from '@/rendering/camera';

export type Tool =
  | 'navigate' | 'measure-distance' | 'measure-angle' | 'measure-polyline' | 'probe'
  | 'sculpt-brush-erase' | 'sculpt-brush-keep' | 'sculpt-polygon-erase' | 'sculpt-polygon-keep'
  | 'seed-region-grow';

export type PanelId = 'presets' | 'transfer' | 'clip' | 'segment' | 'sculpt' | 'measure' | 'layers' | 'diagnostics';

export interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: ProgressEvent | null;
  error: { message: string; detail?: string; code?: string } | null;
  load: LoadResult | null;

  presets: TransferFunction[];
  transferFunction: TransferFunction;
  presetAdaptationNote: string | null;
  initialPresetReason: string | null;
  blendMode: BlendMode;
  renderMode: RenderMode;
  quality: QualityLevel;
  parallelProjection: boolean;

  clipping: ClipPlaneState[];
  cropBox: CropBoxState;

  segments: SegmentationObject[];
  activeSegmentId: number | null;
  segmentStats: Record<number, { voxelCount: number; volumeMm3: number }>;

  surfaces: SurfaceLayerState[];
  measurements: MeasurementBase[];
  activeMeasurementId: string | null;

  tool: Tool;
  brushRadiusMm: number;
  activePanel: PanelId;
  leftPanel: 'presets' | 'transfer';
  orientationCubeVisible: boolean;
  directionLabelsVisible: boolean;
  showVolume: boolean;

  canUndo: boolean;
  canRedo: boolean;
  historyLabels: { undo: string[]; redo: string[] };

  runtimeIssues: DiagnosticIssue[];
  cameraPreset: CameraPresetId | null;
  fps: number | null;
  lastRenderMs: number;
  qualityNotice: string | null;
}

export interface AppActions {
  setStatus: (s: AppState['status']) => void;
  setProgress: (p: ProgressEvent | null) => void;
  setError: (e: AppState['error']) => void;
  setLoad: (l: LoadResult) => void;
  reset: () => void;

  setTransferFunction: (tf: TransferFunction) => void;
  selectPreset: (id: string) => void;
  addPreset: (tf: TransferFunction) => void;
  duplicateActivePreset: () => void;
  removePreset: (id: string) => void;
  resetActivePreset: () => void;
  importPresetList: (list: TransferFunction[]) => void;

  setBlendMode: (m: BlendMode) => void;
  setRenderMode: (m: RenderMode) => void;
  setQuality: (q: QualityLevel) => void;
  setParallelProjection: (p: boolean) => void;

  setClipping: (c: ClipPlaneState[]) => void;
  updateClipPlane: (id: string, patch: Partial<ClipPlaneState>) => void;
  resetClipping: () => void;
  setCropBox: (c: Partial<CropBoxState>) => void;
  resetCropBox: () => void;

  addSegment: (s: SegmentationObject) => void;
  updateSegment: (id: number, patch: Partial<SegmentationObject>) => void;
  removeSegment: (id: number) => void;
  setActiveSegment: (id: number | null) => void;
  setSegmentStats: (id: number, stats: { voxelCount: number; volumeMm3: number }) => void;

  addSurface: (s: SurfaceLayerState) => void;
  updateSurface: (id: string, patch: Partial<SurfaceLayerState>) => void;
  removeSurface: (id: string) => void;

  addMeasurement: (m: MeasurementBase) => void;
  updateMeasurement: (id: string, patch: Partial<MeasurementBase>) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  setActiveMeasurement: (id: string | null) => void;

  setTool: (t: Tool) => void;
  setBrushRadius: (mm: number) => void;
  setActivePanel: (p: PanelId) => void;
  setLeftPanel: (p: 'presets' | 'transfer') => void;
  setOrientationCubeVisible: (v: boolean) => void;
  setDirectionLabelsVisible: (v: boolean) => void;
  setShowVolume: (v: boolean) => void;

  setHistoryState: (canUndo: boolean, canRedo: boolean, labels: { undo: string[]; redo: string[] }) => void;
  pushRuntimeIssue: (i: DiagnosticIssue) => void;
  clearRuntimeIssues: () => void;
  setCameraPreset: (p: CameraPresetId | null) => void;
  setRenderStats: (fps: number | null, lastRenderMs: number) => void;
  setQualityNotice: (n: string | null) => void;
}

const initial: AppState = {
  status: 'idle', progress: null, error: null, load: null,
  presets: [...BUILT_IN_PRESETS],
  transferFunction: PRESET_BONE,
  presetAdaptationNote: null,
  initialPresetReason: null,
  blendMode: 'composite',
  renderMode: 'volume',
  quality: 'standard',
  parallelProjection: false,
  clipping: defaultClipState(),
  cropBox: defaultCropBox(),
  segments: [], activeSegmentId: null, segmentStats: {},
  surfaces: [], measurements: [], activeMeasurementId: null,
  tool: 'navigate', brushRadiusMm: 12, activePanel: 'clip', leftPanel: 'presets',
  orientationCubeVisible: true, directionLabelsVisible: true, showVolume: true,
  canUndo: false, canRedo: false, historyLabels: { undo: [], redo: [] },
  runtimeIssues: [], cameraPreset: 'anterior', fps: null, lastRenderMs: 0, qualityNotice: null,
};

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initial,

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, status: error ? 'error' : get().status }),
  setLoad: (load) => {
    const { preset, reason } = chooseInitialPreset(load.volume.statistics, load.contrast.likely);
    const { tf, report } = adaptPresetToVolume(preset, load.volume.statistics);
    set({
      load, status: 'ready', transferFunction: tf, blendMode: tf.blendMode,
      initialPresetReason: reason, presetAdaptationNote: report.rationale,
      qualityNotice: load.qualityNotice,
      clipping: defaultClipState(), cropBox: defaultCropBox(),
      segments: [], measurements: [], surfaces: [], segmentStats: {},
    });
  },
  reset: () => set({ ...initial, presets: [...BUILT_IN_PRESETS] }),

  setTransferFunction: (transferFunction) => set({ transferFunction, blendMode: transferFunction.blendMode }),
  selectPreset: (id) => {
    const base = get().presets.find((p) => p.id === id);
    if (!base) return;
    const load = get().load;
    const { tf, report } = load ? adaptPresetToVolume(base, load.volume.statistics) : { tf: base, report: { rationale: null as string | null } };
    set({ transferFunction: tf, blendMode: tf.blendMode, presetAdaptationNote: report.rationale });
  },
  addPreset: (tf) => set((s) => ({ presets: [...s.presets, tf], transferFunction: tf })),
  duplicateActivePreset: () => {
    const copy = emptyCustomPreset(get().transferFunction);
    set((s) => ({ presets: [...s.presets, copy], transferFunction: copy }));
  },
  removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id || p.builtIn) })),
  resetActivePreset: () => {
    const active = get().transferFunction;
    const builtIn = BUILT_IN_PRESETS.find((p) => p.id === active.id);
    if (!builtIn) return;
    const load = get().load;
    const { tf } = load ? adaptPresetToVolume(builtIn, load.volume.statistics) : { tf: builtIn };
    set({ transferFunction: tf, blendMode: tf.blendMode });
  },
  importPresetList: (list) => set((s) => ({ presets: [...s.presets, ...list] })),

  setBlendMode: (blendMode) => set((s) => ({ blendMode, transferFunction: { ...s.transferFunction, blendMode } })),
  setRenderMode: (renderMode) => set({ renderMode }),
  setQuality: (quality) => set({ quality }),
  setParallelProjection: (parallelProjection) => set({ parallelProjection }),

  setClipping: (clipping) => set({ clipping }),
  updateClipPlane: (id, patch) => set((s) => ({ clipping: s.clipping.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  resetClipping: () => set({ clipping: defaultClipState() }),
  setCropBox: (c) => set((s) => ({ cropBox: { ...s.cropBox, ...c } })),
  resetCropBox: () => set({ cropBox: defaultCropBox() }),

  addSegment: (seg) => set((s) => ({ segments: [...s.segments, seg], activeSegmentId: seg.id })),
  updateSegment: (id, patch) => set((s) => ({ segments: s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removeSegment: (id) => set((s) => ({
    segments: s.segments.filter((x) => x.id !== id),
    activeSegmentId: s.activeSegmentId === id ? null : s.activeSegmentId,
  })),
  setActiveSegment: (activeSegmentId) => set({ activeSegmentId }),
  setSegmentStats: (id, stats) => set((s) => ({ segmentStats: { ...s.segmentStats, [id]: stats } })),

  addSurface: (surface) => set((s) => ({ surfaces: [...s.surfaces, surface] })),
  updateSurface: (id, patch) => set((s) => ({ surfaces: s.surfaces.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removeSurface: (id) => set((s) => ({ surfaces: s.surfaces.filter((x) => x.id !== id) })),

  addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, m], activeMeasurementId: m.id })),
  updateMeasurement: (id, patch) => set((s) => ({ measurements: s.measurements.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((x) => x.id !== id) })),
  clearMeasurements: () => set({ measurements: [], activeMeasurementId: null }),
  setActiveMeasurement: (activeMeasurementId) => set({ activeMeasurementId }),

  setTool: (tool) => set({ tool }),
  setBrushRadius: (brushRadiusMm) => set({ brushRadiusMm }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setLeftPanel: (leftPanel) => set({ leftPanel }),
  setOrientationCubeVisible: (orientationCubeVisible) => set({ orientationCubeVisible }),
  setDirectionLabelsVisible: (directionLabelsVisible) => set({ directionLabelsVisible }),
  setShowVolume: (showVolume) => set({ showVolume }),

  setHistoryState: (canUndo, canRedo, historyLabels) => set({ canUndo, canRedo, historyLabels }),
  pushRuntimeIssue: (i) => set((s) => ({ runtimeIssues: [...s.runtimeIssues, i].slice(-50) })),
  clearRuntimeIssues: () => set({ runtimeIssues: [] }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setRenderStats: (fps, lastRenderMs) => set({ fps, lastRenderMs }),
  setQualityNotice: (qualityNotice) => set({ qualityNotice }),
}));
