/**
 * Read-only access to the measurement annotations held by the tool layer.
 *
 * Used by the acceptance runs to verify the invariant that matters: a
 * measurement's reported value must equal the distance between its own handle
 * positions IN PATIENT SPACE. That check is independent of where the pointer
 * happened to land, so it tests the tool rather than the mouse.
 */

import { annotation } from '@cornerstonejs/tools';

export interface QAAnnotation {
  readonly toolName: string;
  /** Handle positions in patient-space millimetres. */
  readonly points: number[][];
  /** Distance between the first two handles, mm. */
  readonly worldLengthMm: number | null;
  /** Whatever the tool itself cached (length, area, mean HU, ...). */
  readonly cachedStats: unknown;
}

export function readAnnotationsForQA(): QAAnnotation[] {
  const all = annotation.state.getAllAnnotations() ?? [];
  return all.map((a: unknown) => {
    const entry = a as {
      metadata?: { toolName?: string };
      data?: {
        handles?: { points?: number[][] };
        cachedStats?: unknown;
      };
    };
    const points = entry.data?.handles?.points ?? [];
    const worldLengthMm =
      points.length >= 2
        ? Math.hypot(
            points[1][0] - points[0][0],
            points[1][1] - points[0][1],
            points[1][2] - points[0][2],
          )
        : null;
    return {
      toolName: entry.metadata?.toolName ?? 'unknown',
      points,
      worldLengthMm,
      cachedStats: entry.data?.cachedStats ?? null,
    };
  });
}
