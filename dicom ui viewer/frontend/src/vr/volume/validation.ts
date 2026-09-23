/**
 * Geometry conformance checks (§38): compare what the DICOM headers describe with
 * what the constructed volume actually is. Any mismatch is a defect, not a warning.
 */
import { indexToWorld, distance, angleDeg, isOrthonormalBasis, det3, type Vec3 } from '@3d/math/vec3';
import { issue, ErrorCode, type DiagnosticIssue } from '@3d/core/errors';
import { orientationConfidence } from '@3d/dicom/geometry';
import type { GeometryAnalysis, VolumeGeometry } from '@3d/dicom/geometry';

export interface ConformanceCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly toleranceNote?: string;
}

export interface ConformanceReport {
  readonly checks: readonly ConformanceCheck[];
  readonly issues: readonly DiagnosticIssue[];
  readonly allPassed: boolean;
}

const POSITION_TOLERANCE_MM = 0.01;

export function verifyVolumeGeometry(
  geometry: VolumeGeometry, analysis: GeometryAnalysis,
): ConformanceReport {
  const checks: ConformanceCheck[] = [];
  const issues: DiagnosticIssue[] = [];
  const add = (name: string, pass: boolean, expected: string, actual: string, toleranceNote?: string) =>
    checks.push({ name, pass, expected, actual, toleranceNote });

  // 1. Origin must equal the ImagePositionPatient of the first sorted slice.
  const first = analysis.slices[0];
  if (first) {
    const d = distance(geometry.origin, first.position);
    add('Volume origin equals first slice Image Position (Patient)', d <= POSITION_TOLERANCE_MM,
      `[${first.position.map((v) => v.toFixed(4)).join(', ')}]`,
      `[${geometry.origin.map((v) => v.toFixed(4)).join(', ')}]`,
      `Δ = ${d.toExponential(2)} mm, tolerance ${POSITION_TOLERANCE_MM} mm`);
  }

  // 2. The direction basis must be orthonormal and right-handed.
  const ortho = isOrthonormalBasis(geometry.iAxis, geometry.jAxis, geometry.kAxis);
  add('Direction basis is orthonormal', ortho, 'orthonormal 3×3', ortho ? 'orthonormal' : 'NOT orthonormal');
  const detv = det3(geometry.iAxis, geometry.jAxis, geometry.kAxis);
  add('Direction basis is right-handed (no axis flip)', detv > 0.999,
    'det = +1', `det = ${detv.toFixed(6)}`,
    'A negative determinant would mirror the patient left/right.');
  if (detv <= 0.999) {
    issues.push(issue(ErrorCode.ORIENTATION_UNCERTAIN, 'fatal',
      'The volume basis is not right-handed; rendering would mirror the patient.',
      { detail: `determinant = ${detv}` }));
  }

  // 3. k axis must equal cross(i, j) — i.e. the slice normal, not the stack direction.
  const kFromIj: Vec3 = [
    geometry.iAxis[1] * geometry.jAxis[2] - geometry.iAxis[2] * geometry.jAxis[1],
    geometry.iAxis[2] * geometry.jAxis[0] - geometry.iAxis[0] * geometry.jAxis[2],
    geometry.iAxis[0] * geometry.jAxis[1] - geometry.iAxis[1] * geometry.jAxis[0],
  ];
  const kAngle = angleDeg(kFromIj, geometry.kAxis);
  add('k axis equals cross(rowCosines, columnCosines)', kAngle < 0.01,
    '0.000°', `${kAngle.toFixed(6)}°`);

  // 4. Round-trip every acquired slice: its world position must land on its grid index.
  let worstResidual = 0; let worstIndex = -1;
  for (const s of analysis.slices) {
    const k = Math.round((s.coordinate - analysis.slices[0].coordinate) / geometry.spacing[2]);
    const world = indexToWorld([0, 0, k], geometry.origin, geometry.spacing, geometry.iAxis, geometry.jAxis, geometry.kAxis);
    // Compare only along the slice axis; in-plane shear is corrected separately.
    const residual = Math.abs(
      (world[0] - s.position[0]) * geometry.kAxis[0] +
      (world[1] - s.position[1]) * geometry.kAxis[1] +
      (world[2] - s.position[2]) * geometry.kAxis[2]);
    if (residual > worstResidual) { worstResidual = residual; worstIndex = k; }
  }
  const roundTripTol = Math.max(POSITION_TOLERANCE_MM, geometry.spacing[2] * 0.02);
  add('Every slice maps back to its grid index', worstResidual <= roundTripTol,
    `≤ ${roundTripTol.toFixed(4)} mm`, `worst residual ${worstResidual.toFixed(5)} mm at k=${worstIndex}`);

  // 5. Physical extent must equal dimensions × spacing.
  const expectedSize: Vec3 = [
    geometry.dimensions[0] * geometry.spacing[0],
    geometry.dimensions[1] * geometry.spacing[1],
    geometry.dimensions[2] * geometry.spacing[2],
  ];
  const sizeOk = expectedSize.every((v, i) => Math.abs(v - geometry.physicalSize[i]) < 1e-6);
  add('Physical size equals dimensions × spacing', sizeOk,
    `[${expectedSize.map((v) => v.toFixed(3)).join(', ')}] mm`,
    `[${geometry.physicalSize.map((v) => v.toFixed(3)).join(', ')}] mm`);

  // 6. Slice count must cover the acquired range.
  const acquiredRange = analysis.slices.length > 1
    ? analysis.slices[analysis.slices.length - 1].coordinate - analysis.slices[0].coordinate : 0;
  const gridRange = (geometry.dimensions[2] - 1) * geometry.spacing[2];
  add('Grid extent covers the acquired slice range', Math.abs(gridRange - acquiredRange) <= geometry.spacing[2] * 0.51,
    `${acquiredRange.toFixed(3)} mm acquired`, `${gridRange.toFixed(3)} mm grid`);

  // 7. Anatomical orientation must be determinable.
  const oc = orientationConfidence(geometry.iAxis, geometry.jAxis, geometry.kAxis);
  add('Anatomical orientation is unambiguous', oc.confident,
    'obliquity < 20° from a cardinal axis', `${oc.code}, max obliquity ${oc.maxObliquityDeg.toFixed(2)}°`);
  if (!oc.confident) {
    issues.push(issue(ErrorCode.ORIENTATION_UNCERTAIN, 'warning',
      `The acquisition is strongly oblique (${oc.maxObliquityDeg.toFixed(1)}° from the nearest anatomical axis); direction labels are approximate.`,
      { mitigation: 'The orientation cube shows the true axes; treat R/L/A/P/S/I markers as indicative only.' }));
  }

  for (const c of checks) {
    if (!c.pass) {
      issues.push(issue(ErrorCode.GEOMETRY_MISSING, 'error',
        `Geometry conformance check failed: ${c.name}.`,
        { detail: `expected ${c.expected}, got ${c.actual}${c.toleranceNote ? ` (${c.toleranceNote})` : ''}` }));
    }
  }

  return { checks, issues, allPassed: checks.every((c) => c.pass) };
}
