/**
 * Mutable session objects that must NOT live in reactive state: the volume, the derived
 * masks, the edit history and the render engine. React sees only the small, cheap
 * summaries in `store.ts`; these buffers are shared by reference.
 *
 * The separation is deliberate and enforces §28: `volume.scalars` is the SOURCE and is
 * never written to after construction. `display` is the DERIVED array uploaded to the
 * GPU, rebuilt from source + visibility whenever a mask changes.
 */
import { LabelVolume, VisibilityMask, applyVisibility } from '@/segmentation/labelVolume';
import { EditHistory } from '@/segmentation/history';
import { BACKGROUND_HU } from '@/volume/construction';
import type { VolumeData } from '@/volume/types';
import type { VolumeRenderEngine } from '@/rendering/engine';
import type { LoadResult } from '@/services/datasetLoader';

export interface Session {
  load: LoadResult;
  /** Immutable source HU volume. */
  readonly volume: VolumeData;
  /** Derived array uploaded to the GPU. */
  readonly display: Int16Array;
  readonly labels: LabelVolume;
  readonly visibility: VisibilityMask;
  readonly history: EditHistory;
  engine: VolumeRenderEngine | null;
  /** Set when any voxel has been hidden, so the UI can offer "restore full volume". */
  masked: boolean;
  hiddenVoxels: number;
}

let current: Session | null = null;

export function createSession(load: LoadResult): Session {
  const volume = load.volume;
  const n = volume.scalars.length;
  const session: Session = {
    load,
    volume,
    display: new Int16Array(volume.scalars),
    labels: new LabelVolume(volume.geometry.dimensions),
    visibility: new VisibilityMask(n),
    history: new EditHistory(),
    engine: null,
    masked: false,
    hiddenVoxels: 0,
  };
  current = session;
  return session;
}

export function getSession(): Session | null { return current; }

export function clearSession(): void {
  current?.engine?.dispose();
  current = null;
}

/**
 * Recompute the derived display array from source + visibility and push it to the GPU.
 * One pass over the volume produces both the array and the hidden-voxel count.
 */
export function syncDisplay(session: Session): number {
  const { hidden } = applyVisibility(session.volume.scalars, session.visibility.values, session.display, BACKGROUND_HU);
  session.masked = hidden > 0;
  session.hiddenVoxels = hidden;
  session.engine?.refreshScalars(session.display);
  return hidden;
}

/** Restore the full volume: clears every sculpt/crop/bone-removal exclusion. */
export function restoreFullVolume(session: Session): void {
  session.visibility.reset();
  session.masked = false;
  session.hiddenVoxels = 0;
  session.display.set(session.volume.scalars);
  session.engine?.refreshScalars(session.display);
}
