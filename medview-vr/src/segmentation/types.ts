export type LabelId = number; // 1..255, 0 = background

export interface SegmentationObject {
  readonly id: LabelId;
  name: string;
  /** sRGB 0..1 */
  color: readonly [number, number, number];
  opacity: number;
  visible: boolean;
  /** True when the object was produced by a reproducible algorithm rather than by hand. */
  readonly origin: 'threshold' | 'region-grow' | 'connected-component' | 'bounding-box' | 'manual' | 'imported';
  readonly createdAt: number;
  /** Parameters that produced it, so the result is reproducible (§29). */
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface LabelStats {
  readonly voxelCount: number;
  /** Physical volume in mm³. */
  readonly volumeMm3: number;
  /** Index-space bounds [iMin,iMax,jMin,jMax,kMin,kMax], or null when empty. */
  readonly bounds: readonly [number, number, number, number, number, number] | null;
  readonly meanHU: number;
  readonly minHU: number;
  readonly maxHU: number;
}

/**
 * A reversible edit.
 *
 * Most edits touch a small fraction of the volume, so the default form lists the voxel
 * indices that changed together with their previous and next values. Whole-volume
 * operations — "keep only this segment" touches every voxel outside it — would make that
 * form larger than the volume itself, so past a threshold the recorder switches to a
 * run-length-coded snapshot of the whole mask, which for a runny mask is a few kilobytes.
 */
export type MaskDelta =
  | {
    readonly kind: 'sparse';
    readonly indices: Int32Array;
    readonly previous: Uint8Array;
    readonly next: Uint8Array;
    readonly label: string;
    readonly changed: number;
  }
  | {
    readonly kind: 'snapshot';
    /** RLE-coded mask before and after the edit. */
    readonly before: Uint8Array;
    readonly after: Uint8Array;
    readonly length: number;
    readonly label: string;
    readonly changed: number;
  };

export function deltaByteLength(d: MaskDelta): number {
  return d.kind === 'sparse'
    ? d.indices.byteLength + d.previous.byteLength + d.next.byteLength
    : d.before.byteLength + d.after.byteLength;
}
