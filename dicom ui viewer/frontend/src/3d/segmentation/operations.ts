/**
 * Segmentation algorithms (§12) and sculpting primitives (§13).
 *
 * Every operation returns a `MaskDelta` describing exactly which voxels changed and
 * what they held before, which is what makes undo/redo exact and cheap.
 */
import type { VolumeData } from '@3d/volume/types';
import type { LabelVolume } from './labelVolume';
import type { MaskDelta, LabelId } from './types';
import { rleEncode, rleDecodeInto } from './rle';
import { worldToIndex, type Vec3 } from '@3d/math/vec3';
import type { VolumeGeometry } from '@3d/dicom/geometry';

/**
 * Records an edit as it happens.
 *
 * Sparse mode stores changed indices in growable typed arrays (not JS number arrays,
 * which cost ~24 bytes per entry). When an edit turns out to touch more than
 * `SNAPSHOT_THRESHOLD` of the mask, the recorder reconstructs the original array from the
 * changes recorded so far and switches to snapshot mode, where the cost is bounded by the
 * RLE size of the mask rather than by the number of voxels touched.
 */
const SNAPSHOT_THRESHOLD = 1 / 12;

class DeltaRecorder {
  private idx: Int32Array;
  private prev: Uint8Array;
  private next: Uint8Array;
  private n = 0;
  private snapshotBefore: Uint8Array | null = null;
  private readonly limit: number;

  constructor(private readonly target: Uint8Array, readonly label: string) {
    const initial = Math.max(1024, Math.min(target.length >> 6, 1 << 20));
    this.idx = new Int32Array(initial);
    this.prev = new Uint8Array(initial);
    this.next = new Uint8Array(initial);
    this.limit = Math.max(4096, Math.floor(target.length * SNAPSHOT_THRESHOLD));
  }

  private grow(): void {
    const cap = this.idx.length * 2;
    const i = new Int32Array(cap); i.set(this.idx); this.idx = i;
    const p = new Uint8Array(cap); p.set(this.prev); this.prev = p;
    const x = new Uint8Array(cap); x.set(this.next); this.next = x;
  }

  /** Rebuild the pre-edit array from the current target plus the changes recorded so far. */
  private switchToSnapshot(): void {
    const before = this.target.slice();
    for (let k = 0; k < this.n; k++) before[this.idx[k]] = this.prev[k];
    this.snapshotBefore = before;
    // The sparse buffers are no longer needed.
    this.idx = new Int32Array(0);
    this.prev = new Uint8Array(0);
    this.next = new Uint8Array(0);
  }

  set(i: number, value: number): void {
    const before = this.target[i];
    if (before === value) return;
    if (this.snapshotBefore === null) {
      if (this.n === this.idx.length) this.grow();
      this.idx[this.n] = i;
      this.prev[this.n] = before;
      this.next[this.n] = value;
      this.n++;
      if (this.n >= this.limit) this.switchToSnapshot();
    } else {
      this.n++;
    }
    this.target[i] = value;
  }

  finish(): MaskDelta {
    if (this.snapshotBefore !== null) {
      return {
        kind: 'snapshot',
        before: rleEncode(this.snapshotBefore),
        after: rleEncode(this.target),
        length: this.target.length,
        label: this.label,
        changed: this.n,
      };
    }
    return {
      kind: 'sparse',
      indices: this.idx.slice(0, this.n),
      previous: this.prev.slice(0, this.n),
      next: this.next.slice(0, this.n),
      label: this.label,
      changed: this.n,
    };
  }

  get changed(): number { return this.n; }
}

export function applyDelta(target: Uint8Array, delta: MaskDelta, direction: 'redo' | 'undo'): void {
  if (delta.kind === 'snapshot') {
    rleDecodeInto(direction === 'redo' ? delta.after : delta.before, target);
    return;
  }
  const src = direction === 'redo' ? delta.next : delta.previous;
  for (let n = 0; n < delta.indices.length; n++) target[delta.indices[n]] = src[n];
}

/* ------------------------------------------------------------------ threshold */

export interface ThresholdOptions {
  readonly lower: number;
  readonly upper: number;
  /** Restrict to voxels currently visible (so sculpting constrains the threshold). */
  readonly withinVisible?: Uint8Array;
  /** Restrict to an index-space box. */
  readonly box?: readonly [number, number, number, number, number, number];
}

export function thresholdSegment(
  volume: VolumeData, labels: LabelVolume, id: LabelId, opts: ThresholdOptions,
): MaskDelta {
  const rec = new DeltaRecorder(labels.labels, `Threshold ${opts.lower}…${opts.upper} HU`);
  const [nx, ny, nz] = labels.dims;
  const b = opts.box ?? [0, nx - 1, 0, ny - 1, 0, nz - 1];
  const sxy = nx * ny;
  for (let k = b[4]; k <= b[5]; k++) {
    for (let j = b[2]; j <= b[3]; j++) {
      const row = k * sxy + j * nx;
      for (let i = b[0]; i <= b[1]; i++) {
        const p = row + i;
        if (opts.withinVisible && !opts.withinVisible[p]) continue;
        const hu = volume.scalars[p];
        if (hu >= opts.lower && hu <= opts.upper) rec.set(p, id);
      }
    }
  }
  return rec.finish();
}

/* --------------------------------------------------------------- region growing */

export interface RegionGrowOptions {
  readonly seedIndex: number;
  readonly lower: number;
  readonly upper: number;
  /** 6 = face neighbours, 26 = full neighbourhood. */
  readonly connectivity?: 6 | 26;
  readonly maxVoxels?: number;
  readonly withinVisible?: Uint8Array;
}

const NEIGH6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

function neighbourOffsets(connectivity: 6 | 26, nx: number, ny: number): number[] {
  const offs: number[] = [];
  if (connectivity === 6) {
    for (const [dx, dy, dz] of NEIGH6) offs.push(dz * nx * ny + dy * nx + dx);
    return offs;
  }
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0 && dz === 0) continue;
    offs.push(dz * nx * ny + dy * nx + dx);
  }
  return offs;
}

export function regionGrow(
  volume: VolumeData, labels: LabelVolume, id: LabelId, opts: RegionGrowOptions,
): MaskDelta {
  const rec = new DeltaRecorder(labels.labels, `Region grow from voxel ${opts.seedIndex}`);
  const [nx, ny, nz] = labels.dims;
  const sxy = nx * ny;
  const total = sxy * nz;
  const conn = opts.connectivity ?? 6;
  const max = opts.maxVoxels ?? total;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(Math.min(total, 1 << 22));
  let sp = 0, grown = 0;

  const inRange = (p: number) => {
    const hu = volume.scalars[p];
    return hu >= opts.lower && hu <= opts.upper && (!opts.withinVisible || opts.withinVisible[p] === 1);
  };

  if (!inRange(opts.seedIndex)) return rec.finish();
  stack[sp++] = opts.seedIndex;
  visited[opts.seedIndex] = 1;

  while (sp > 0 && grown < max) {
    const p = stack[--sp];
    rec.set(p, id);
    grown++;
    const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sxy) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      if (conn === 6 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) continue;
      const x = i + dx, y = j + dy, z = k + dz;
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const q = z * sxy + y * nx + x;
      if (visited[q]) continue;
      visited[q] = 1;
      if (inRange(q) && sp < stack.length) stack[sp++] = q;
    }
  }
  void neighbourOffsets;
  return rec.finish();
}

/* ----------------------------------------------------- connected components */

export interface ComponentInfo { readonly seed: number; readonly size: number; readonly componentId: number; }

/**
 * Label connected components of the voxels currently carrying `id`, then keep only
 * those satisfying `keep`. Used by bone-removal to drop small dense fragments
 * (clips, calcifications) or to keep only the largest structure.
 */
export function filterConnectedComponents(
  labels: LabelVolume, id: LabelId,
  keep: (info: ComponentInfo, all: readonly ComponentInfo[]) => boolean,
  connectivity: 6 | 26 = 26,
): { delta: MaskDelta; components: ComponentInfo[] } {
  const [nx, ny, nz] = labels.dims;
  const sxy = nx * ny;
  const total = sxy * nz;
  const comp = new Int32Array(total).fill(-1);
  const components: ComponentInfo[] = [];
  const stack = new Int32Array(Math.min(total, 1 << 22));

  for (let start = 0; start < total; start++) {
    if (labels.labels[start] !== id || comp[start] !== -1) continue;
    const cid = components.length;
    let sp = 0, size = 0;
    stack[sp++] = start; comp[start] = cid;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const i = p % nx, j = ((p / nx) | 0) % ny, k = (p / sxy) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (connectivity === 6 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== 1) continue;
        const x = i + dx, y = j + dy, z = k + dz;
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        const q = z * sxy + y * nx + x;
        if (comp[q] !== -1 || labels.labels[q] !== id) continue;
        comp[q] = cid;
        if (sp < stack.length) stack[sp++] = q;
      }
    }
    components.push({ seed: start, size, componentId: cid });
  }

  const keepSet = new Set(components.filter((c) => keep(c, components)).map((c) => c.componentId));
  const rec = new DeltaRecorder(labels.labels, `Connected-component filter (${keepSet.size}/${components.length} kept)`);
  for (let p = 0; p < total; p++) {
    if (labels.labels[p] === id && !keepSet.has(comp[p])) rec.set(p, 0);
  }
  return { delta: rec.finish(), components };
}

/* --------------------------------------------------------------- sculpting */

export type SculptMode = 'erase' | 'keep';

export interface WorldBox { readonly min: Vec3; readonly max: Vec3; }

function indexBoundsForWorldBox(box: WorldBox, g: VolumeGeometry): [number, number, number, number, number, number] {
  // Transform all 8 corners and take the index-space AABB.
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let c = 0; c < 8; c++) {
    const w: Vec3 = [c & 1 ? box.max[0] : box.min[0], c & 2 ? box.max[1] : box.min[1], c & 4 ? box.max[2] : box.min[2]];
    const idx = worldToIndex(w, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], idx[a]); hi[a] = Math.max(hi[a], idx[a]); }
  }
  return [
    Math.max(0, Math.floor(lo[0])), Math.min(g.dimensions[0] - 1, Math.ceil(hi[0])),
    Math.max(0, Math.floor(lo[1])), Math.min(g.dimensions[1] - 1, Math.ceil(hi[1])),
    Math.max(0, Math.floor(lo[2])), Math.min(g.dimensions[2] - 1, Math.ceil(hi[2])),
  ];
}

/** Box cut in world coordinates. `mode: 'keep'` removes everything OUTSIDE the box. */
export function sculptBox(
  mask: Uint8Array, g: VolumeGeometry, box: WorldBox, mode: SculptMode,
): MaskDelta {
  const rec = new DeltaRecorder(mask, mode === 'erase' ? 'Box erase' : 'Box keep');
  const b = indexBoundsForWorldBox(box, g);
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  if (mode === 'erase') {
    for (let k = b[4]; k <= b[5]; k++) for (let j = b[2]; j <= b[3]; j++) {
      const row = k * sxy + j * nx;
      for (let i = b[0]; i <= b[1]; i++) rec.set(row + i, 0);
    }
  } else {
    for (let k = 0; k < nz; k++) {
      const inK = k >= b[4] && k <= b[5];
      for (let j = 0; j < ny; j++) {
        const inJ = inK && j >= b[2] && j <= b[3];
        const row = k * sxy + j * nx;
        if (!inJ) { for (let i = 0; i < nx; i++) rec.set(row + i, 0); continue; }
        for (let i = 0; i < nx; i++) if (i < b[0] || i > b[1]) rec.set(row + i, 0);
      }
    }
  }
  return rec.finish();
}

/** Half-space cut: removes (or keeps) everything on the positive side of a plane. */
export function sculptPlane(
  mask: Uint8Array, g: VolumeGeometry, origin: Vec3, normal: Vec3, mode: SculptMode,
): MaskDelta {
  const rec = new DeltaRecorder(mask, mode === 'erase' ? 'Plane cut' : 'Plane keep');
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  // Plane value is affine in index space; evaluate incrementally for speed.
  const di = normal[0] * g.iAxis[0] * g.spacing[0] + normal[1] * g.iAxis[1] * g.spacing[0] + normal[2] * g.iAxis[2] * g.spacing[0];
  const dj = normal[0] * g.jAxis[0] * g.spacing[1] + normal[1] * g.jAxis[1] * g.spacing[1] + normal[2] * g.jAxis[2] * g.spacing[1];
  const dk = normal[0] * g.kAxis[0] * g.spacing[2] + normal[1] * g.kAxis[1] * g.spacing[2] + normal[2] * g.kAxis[2] * g.spacing[2];
  const base = normal[0] * (g.origin[0] - origin[0]) + normal[1] * (g.origin[1] - origin[1]) + normal[2] * (g.origin[2] - origin[2]);
  for (let k = 0; k < nz; k++) {
    const vk = base + dk * k;
    for (let j = 0; j < ny; j++) {
      const vj = vk + dj * j;
      const row = k * sxy + j * nx;
      for (let i = 0; i < nx; i++) {
        const v = vj + di * i;
        const positive = v > 0;
        if (mode === 'erase' ? positive : !positive) rec.set(row + i, 0);
      }
    }
  }
  return rec.finish();
}

/** Spherical brush in world space (the 3D equivalent of a paint brush). */
export function sculptSphere(
  mask: Uint8Array, g: VolumeGeometry, centre: Vec3, radiusMm: number, mode: SculptMode,
): MaskDelta {
  const rec = new DeltaRecorder(mask, mode === 'erase' ? 'Brush erase' : 'Brush keep');
  const c = worldToIndex(centre, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
  const ri = radiusMm / g.spacing[0], rj = radiusMm / g.spacing[1], rk = radiusMm / g.spacing[2];
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  const i0 = Math.max(0, Math.floor(c[0] - ri)), i1 = Math.min(nx - 1, Math.ceil(c[0] + ri));
  const j0 = Math.max(0, Math.floor(c[1] - rj)), j1 = Math.min(ny - 1, Math.ceil(c[1] + rj));
  const k0 = Math.max(0, Math.floor(c[2] - rk)), k1 = Math.min(nz - 1, Math.ceil(c[2] + rk));
  const r2 = radiusMm * radiusMm;
  for (let k = k0; k <= k1; k++) {
    const dz = (k - c[2]) * g.spacing[2];
    for (let j = j0; j <= j1; j++) {
      const dy = (j - c[1]) * g.spacing[1];
      const row = k * sxy + j * nx;
      for (let i = i0; i <= i1; i++) {
        const dx = (i - c[0]) * g.spacing[0];
        if (dx * dx + dy * dy + dz * dz <= r2) rec.set(row + i, mode === 'erase' ? 0 : 1);
      }
    }
  }
  return rec.finish();
}

/**
 * Polygon cut: an extruded prism defined by a screen-space polygon projected through
 * the volume along the view direction. The polygon is supplied as world-space points
 * on a plane plus the extrusion direction.
 */
export function sculptPolygonPrism(
  mask: Uint8Array, g: VolumeGeometry, polygonWorld: readonly Vec3[], planeU: Vec3, planeV: Vec3,
  planeOrigin: Vec3, mode: SculptMode,
): MaskDelta {
  const rec = new DeltaRecorder(mask, mode === 'erase' ? 'Polygon erase' : 'Polygon keep');
  if (polygonWorld.length < 3) return rec.finish();
  // Project the polygon into (u,v) on the given plane.
  const poly2 = polygonWorld.map((p) => {
    const d: Vec3 = [p[0] - planeOrigin[0], p[1] - planeOrigin[1], p[2] - planeOrigin[2]];
    return [d[0] * planeU[0] + d[1] * planeU[1] + d[2] * planeU[2], d[0] * planeV[0] + d[1] * planeV[1] + d[2] * planeV[2]] as const;
  });
  const inside = (u: number, v: number): boolean => {
    let c = false;
    for (let a = 0, b = poly2.length - 1; a < poly2.length; b = a++) {
      const [ua, va] = poly2[a], [ub, vb] = poly2[b];
      if ((va > v) !== (vb > v) && u < ((ub - ua) * (v - va)) / (vb - va) + ua) c = !c;
    }
    return c;
  };
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const row = k * sxy + j * nx;
    for (let i = 0; i < nx; i++) {
      const wx = g.origin[0] + g.iAxis[0] * i * g.spacing[0] + g.jAxis[0] * j * g.spacing[1] + g.kAxis[0] * k * g.spacing[2];
      const wy = g.origin[1] + g.iAxis[1] * i * g.spacing[0] + g.jAxis[1] * j * g.spacing[1] + g.kAxis[1] * k * g.spacing[2];
      const wz = g.origin[2] + g.iAxis[2] * i * g.spacing[0] + g.jAxis[2] * j * g.spacing[1] + g.kAxis[2] * k * g.spacing[2];
      const dx = wx - planeOrigin[0], dy = wy - planeOrigin[1], dz = wz - planeOrigin[2];
      const u = dx * planeU[0] + dy * planeU[1] + dz * planeU[2];
      const v = dx * planeV[0] + dy * planeV[1] + dz * planeV[2];
      const isIn = inside(u, v);
      if (mode === 'erase' ? isIn : !isIn) rec.set(row + i, 0);
    }
  }
  return rec.finish();
}

/** Remove (or keep) every voxel carrying a given label — the bone-removal primitive. */
export function applyLabelToVisibility(
  mask: Uint8Array, labels: LabelVolume, id: LabelId, mode: SculptMode,
): MaskDelta {
  const rec = new DeltaRecorder(mask, mode === 'erase' ? `Remove segment ${id}` : `Keep only segment ${id}`);
  for (let p = 0; p < mask.length; p++) {
    const isLabel = labels.labels[p] === id;
    if (mode === 'erase' ? isLabel : !isLabel) rec.set(p, 0);
  }
  return rec.finish();
}

/** Morphological dilation of a label by `radiusVoxels`, used to widen a bone mask so
 *  that partial-volume rim voxels are removed with the bone they belong to. */
export function dilateLabel(labels: LabelVolume, id: LabelId, radiusVoxels: number): MaskDelta {
  const rec = new DeltaRecorder(labels.labels, `Dilate segment ${id} by ${radiusVoxels} voxels`);
  if (radiusVoxels <= 0) return rec.finish();
  const [nx, ny, nz] = labels.dims;
  const sxy = nx * ny;
  const src = labels.labels.slice();
  const r = Math.ceil(radiusVoxels);
  const r2 = radiusVoxels * radiusVoxels;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const row = k * sxy + j * nx;
    for (let i = 0; i < nx; i++) {
      if (src[row + i] !== id) continue;
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        const x = i + dx, y = j + dy, z = k + dz;
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        const q = z * sxy + y * nx + x;
        if (labels.labels[q] === 0) rec.set(q, id);
      }
    }
  }
  return rec.finish();
}
