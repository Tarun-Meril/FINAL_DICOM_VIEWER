/** Message contracts for the worker pool. Kept in one place so both sides stay in sync. */
import type { DicomInstanceMeta } from '@/dicom/types';
import type { RescaleInfo } from '@/dicom/types';
import type { ProgressEvent } from '@/dicom/ingest';

export interface ScanRequest {
  readonly kind: 'scan';
  readonly files: ReadonlyArray<{ path: string; buffer: ArrayBuffer }>;
}
export interface ScanResponse {
  readonly kind: 'scan:done';
  readonly instances: readonly DicomInstanceMeta[];
  readonly rejected: ReadonlyArray<{ path: string; reason: string }>;
  readonly files: ReadonlyArray<{ path: string; buffer: ArrayBuffer }>;
  readonly extractMs: number;
  readonly scanMs: number;
}

export interface DecodeRequest {
  readonly kind: 'decode';
  readonly id: number;
  readonly buffer: ArrayBuffer;
  readonly frameIndex: number;
  readonly rescale: RescaleInfo;
}
export interface DecodeResponse {
  readonly kind: 'decode:done';
  readonly id: number;
  readonly hu: Int16Array;
  readonly rows: number;
  readonly columns: number;
  readonly min: number;
  readonly max: number;
  readonly decodeMs: number;
}

export interface StatsRequest { readonly kind: 'stats'; readonly scalars: Int16Array }
export interface StatsResponse {
  readonly kind: 'stats:done';
  readonly scalars: Int16Array;
  readonly statistics: unknown;
}

export interface SegmentRequest {
  readonly kind: 'segment';
  readonly op: 'threshold' | 'region-grow' | 'components' | 'bone';
  readonly payload: unknown;
}

export interface ProgressMessage { readonly kind: 'progress'; readonly event: ProgressEvent }
export interface ErrorMessage {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  readonly detail?: string;
}

export type WorkerRequest = ScanRequest | DecodeRequest | StatsRequest | SegmentRequest;
export type WorkerResponse = ScanResponse | DecodeResponse | StatsResponse | ProgressMessage | ErrorMessage;
