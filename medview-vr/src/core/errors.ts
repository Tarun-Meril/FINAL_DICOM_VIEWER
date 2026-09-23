/**
 * Human-readable, code-tagged errors (§27).
 *
 * Every failure surfaced to the user must carry:
 *  - `code`      stable machine identifier (used by tests + telemetry)
 *  - `message`   plain clinical language, no stack traces
 *  - `detail`    technical text, shown only in the diagnostics panel
 *  - `severity`  whether the pipeline may continue
 */

export type Severity = 'info' | 'warning' | 'error' | 'fatal';

export const ErrorCode = {
  ARCHIVE_UNREADABLE: 'ARCHIVE_UNREADABLE',
  ARCHIVE_EMPTY: 'ARCHIVE_EMPTY',
  NO_DICOM_FOUND: 'NO_DICOM_FOUND',
  DICOM_PARSE_FAILED: 'DICOM_PARSE_FAILED',
  UNSUPPORTED_TRANSFER_SYNTAX: 'UNSUPPORTED_TRANSFER_SYNTAX',
  PIXEL_DATA_MISSING: 'PIXEL_DATA_MISSING',
  PIXEL_DATA_INVALID: 'PIXEL_DATA_INVALID',
  NO_VOLUMETRIC_SERIES: 'NO_VOLUMETRIC_SERIES',
  GEOMETRY_MISSING: 'GEOMETRY_MISSING',
  GEOMETRY_INCONSISTENT_ORIENTATION: 'GEOMETRY_INCONSISTENT_ORIENTATION',
  GEOMETRY_IRREGULAR_SPACING: 'GEOMETRY_IRREGULAR_SPACING',
  GEOMETRY_DUPLICATE_POSITIONS: 'GEOMETRY_DUPLICATE_POSITIONS',
  GEOMETRY_MISSING_SLICES: 'GEOMETRY_MISSING_SLICES',
  GEOMETRY_GANTRY_TILT: 'GEOMETRY_GANTRY_TILT',
  GEOMETRY_MIXED_MATRIX: 'GEOMETRY_MIXED_MATRIX',
  GEOMETRY_MIXED_PIXEL_SPACING: 'GEOMETRY_MIXED_PIXEL_SPACING',
  MULTIFRAME_UNSUPPORTED: 'MULTIFRAME_UNSUPPORTED',
  VOLUME_TOO_LARGE: 'VOLUME_TOO_LARGE',
  MEMORY_EXHAUSTED: 'MEMORY_EXHAUSTED',
  WEBGL2_UNAVAILABLE: 'WEBGL2_UNAVAILABLE',
  GPU_TEXTURE_LIMIT: 'GPU_TEXTURE_LIMIT',
  RENDER_FAILED: 'RENDER_FAILED',
  ORIENTATION_UNCERTAIN: 'ORIENTATION_UNCERTAIN',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCodeT = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface DiagnosticIssue {
  readonly code: ErrorCodeT;
  readonly severity: Severity;
  /** Plain-language, clinician-facing. Never a stack trace. */
  readonly message: string;
  /** Technical text for the diagnostics panel. */
  readonly detail?: string;
  /** What the pipeline did about it, if anything. */
  readonly mitigation?: string;
  readonly context?: Record<string, unknown>;
}

export class MedViewError extends Error {
  readonly code: ErrorCodeT;
  readonly severity: Severity;
  readonly detail?: string;
  readonly context?: Record<string, unknown>;

  constructor(issue: Omit<DiagnosticIssue, 'severity'> & { severity?: Severity }) {
    super(issue.message);
    this.name = 'MedViewError';
    this.code = issue.code;
    this.severity = issue.severity ?? 'error';
    this.detail = issue.detail;
    this.context = issue.context;
  }

  toIssue(): DiagnosticIssue {
    return { code: this.code, severity: this.severity, message: this.message, detail: this.detail, context: this.context };
  }
}

export function issue(
  code: ErrorCodeT, severity: Severity, message: string,
  extra?: { detail?: string; mitigation?: string; context?: Record<string, unknown> },
): DiagnosticIssue {
  return { code, severity, message, ...extra };
}

export function worstSeverity(issues: readonly DiagnosticIssue[]): Severity {
  const rank: Record<Severity, number> = { info: 0, warning: 1, error: 2, fatal: 3 };
  return issues.reduce<Severity>((acc, i) => (rank[i.severity] > rank[acc] ? i.severity : acc), 'info');
}
