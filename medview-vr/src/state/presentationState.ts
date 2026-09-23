/**
 * 3D presentation state (§29) — a versioned, serialisable snapshot of everything that
 * affects what is on screen, excluding the source pixel data itself.
 *
 * The schema is deliberately close in shape to a DICOM Presentation State object so a
 * future DICOM-conformant implementation can map onto it without restructuring.
 */
import type { TransferFunction, BlendMode } from '@/rendering/transferFunction';
import type { CameraState } from '@/rendering/camera';
import type { ClipPlaneState, CropBoxState } from '@/rendering/clipping';
import type { SegmentationObject } from '@/segmentation/types';
import type { MeasurementBase } from '@/measurement/measurements';
import type { QualityLevel } from '@/rendering/engine';
import type { Vec3 } from '@/math/vec3';
import { rleEncode, rleDecode } from '@/segmentation/rle';

export const PRESENTATION_STATE_SCHEMA = 'medview.presentationstate' as const;
export const PRESENTATION_STATE_VERSION = 1;

export type RenderMode = 'volume' | 'surface' | 'hybrid';

export interface SurfaceLayerState {
  readonly id: string;
  name: string;
  /** Iso value in HU when built from the volume, or 0.5 for a binary mask. */
  isoValue: number;
  source: { kind: 'volume' } | { kind: 'segment'; labelId: number };
  color: readonly [number, number, number];
  opacity: number;
  visible: boolean;
  smoothingIterations: number;
}

export interface DatasetIdentity {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly frameOfReferenceUID?: string;
  readonly volumeId: string;
  readonly dimensions: readonly [number, number, number];
  readonly spacing: Vec3;
  readonly origin: Vec3;
  /** Flat [iAxis, jAxis, kAxis]. */
  readonly direction: readonly number[];
}

export interface PresentationState {
  readonly schema: typeof PRESENTATION_STATE_SCHEMA;
  readonly version: number;
  readonly createdAt: string;
  readonly application: { name: string; version: string };
  readonly dataset: DatasetIdentity;
  readonly camera: CameraState;
  readonly renderMode: RenderMode;
  readonly transferFunction: TransferFunction;
  readonly blendMode: BlendMode;
  readonly quality: QualityLevel;
  readonly clipping: readonly ClipPlaneState[];
  readonly cropBox: CropBoxState;
  readonly segmentation: {
    readonly objects: readonly SegmentationObject[];
    /** Run-length encoded, base64. Absent when nothing is segmented. */
    readonly labelsRle?: string;
    readonly visibilityRle?: string;
  };
  readonly measurements: readonly MeasurementBase[];
  readonly surfaces: readonly SurfaceLayerState[];
  readonly ui: {
    readonly orientationCubeVisible: boolean;
    readonly directionLabelsVisible: boolean;
    readonly backgroundColor: readonly [number, number, number];
  };
  /** Optional: what the volume pipeline did to the source data, for reproducibility. */
  readonly provenanceDigest?: string;
}

/* ------------------------------------------------------------------ mask RLE */

/** Compact run-length encoding of a byte mask, then base64. Masks are highly runny,
 *  so this is typically 100–1000× smaller than the raw array. */
export function encodeMaskRle(mask: Uint8Array): string {
  return bytesToBase64(rleEncode(mask));
}

export function decodeMaskRle(b64: string, expectedLength: number): Uint8Array {
  return rleDecode(base64ToBytes(b64), expectedLength);
}

/** Node exposes Buffer; browsers do not. Both paths are exercised by the test suite. */
const nodeBuffer = (globalThis as { Buffer?: { from(d: Uint8Array | string, enc?: string): { toString(e: string): string } & Uint8Array } }).Buffer;

function bytesToBase64(bytes: Uint8Array): string {
  if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64');
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ validate */

export class PresentationStateError extends Error {}

export function parsePresentationState(json: string): PresentationState {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new PresentationStateError('This file is not valid JSON.'); }
  const p = parsed as Partial<PresentationState>;
  if (p?.schema !== PRESENTATION_STATE_SCHEMA) {
    throw new PresentationStateError('This file is not a MedView 3D presentation state.');
  }
  if (typeof p.version !== 'number' || p.version > PRESENTATION_STATE_VERSION) {
    throw new PresentationStateError(
      `This presentation state was written by a newer version (v${p.version}) of MedView and cannot be read.`);
  }
  if (!p.dataset?.seriesInstanceUID) {
    throw new PresentationStateError('The presentation state does not name a series.');
  }
  return parsed as PresentationState;
}

/** Does a saved state belong to the volume currently loaded? */
export function matchesVolume(
  state: PresentationState, seriesInstanceUID: string, dimensions: readonly [number, number, number],
): { matches: boolean; reason?: string } {
  if (state.dataset.seriesInstanceUID !== seriesInstanceUID) {
    return { matches: false, reason: `The saved state belongs to a different series (${state.dataset.seriesInstanceUID}).` };
  }
  const d = state.dataset.dimensions;
  if (d[0] !== dimensions[0] || d[1] !== dimensions[1] || d[2] !== dimensions[2]) {
    return {
      matches: false,
      reason: `The saved state was made on a ${d.join('×')} volume, but the loaded volume is ${dimensions.join('×')}. ` +
        'Segmentation masks and crop boxes cannot be transferred.',
    };
  }
  return { matches: true };
}
