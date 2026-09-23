/**
 * Surface rendering (§22) — a separate mode, never a replacement for volume rendering.
 *
 * Marching cubes runs on the CPU (in a worker in the app) and produces a polygonal
 * isosurface in the same world coordinates as the volume, so surfaces, volume and
 * measurement overlays all compose correctly (§23).
 */
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkWindowedSincPolyDataFilter from '@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter';
import { createImageData } from './imageDataFactory';
import type { VolumeGeometry } from '@/dicom/geometry';

export interface SurfaceOptions {
  readonly isoValue: number;
  readonly color: readonly [number, number, number];
  readonly opacity: number;
  /** Windowed-sinc smoothing iterations; 0 disables smoothing. */
  readonly smoothingIterations?: number;
  readonly smoothingPassBand?: number;
  readonly computeNormals?: boolean;
  readonly specular?: number;
  readonly specularPower?: number;
}

export interface SurfaceResult {
  readonly actor: any;
  readonly mapper: any;
  readonly triangleCount: number;
  readonly pointCount: number;
  /** Total surface area in mm², computed from the triangles in world coordinates. */
  readonly surfaceAreaMm2: number;
}

export function buildSurface(
  scalars: Int16Array | Uint8Array, geometry: VolumeGeometry, opts: SurfaceOptions,
): SurfaceResult {
  const image = createImageData(scalars, geometry, 'Scalars');
  const mc = vtkImageMarchingCubes.newInstance({
    contourValue: opts.isoValue,
    computeNormals: opts.computeNormals ?? true,
    mergePoints: true,
  });
  mc.setInputData(image);
  let polydata = mc.getOutputData();

  const iterations = opts.smoothingIterations ?? 0;
  if (iterations > 0) {
    const smoother = vtkWindowedSincPolyDataFilter.newInstance({
      numberOfIterations: iterations,
      passBand: opts.smoothingPassBand ?? 0.08,
      featureAngle: 60,
      nonManifoldSmoothing: false,
      normalizeCoordinates: true,
    });
    smoother.setInputData(polydata);
    polydata = smoother.getOutputData();
  }

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polydata);
  mapper.setScalarVisibility(false);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(opts.color[0], opts.color[1], opts.color[2]);
  prop.setOpacity(opts.opacity);
  prop.setSpecular(opts.specular ?? 0.25);
  prop.setSpecularPower(opts.specularPower ?? 20);
  prop.setDiffuse(0.85);
  prop.setAmbient(0.18);
  prop.setInterpolationToPhong();

  return {
    actor, mapper,
    triangleCount: polydata.getNumberOfCells?.() ?? 0,
    pointCount: polydata.getNumberOfPoints?.() ?? 0,
    surfaceAreaMm2: computeSurfaceArea(polydata),
  };
}

/** Sum of triangle areas, in mm² (points are already in world millimetres). */
export function computeSurfaceArea(polydata: any): number {
  const points = polydata.getPoints?.()?.getData?.();
  const polys = polydata.getPolys?.()?.getData?.();
  if (!points || !polys) return 0;
  let area = 0;
  for (let i = 0; i < polys.length;) {
    const n = polys[i++];
    if (n !== 3) { i += n; continue; }
    const a = polys[i] * 3, b = polys[i + 1] * 3, c = polys[i + 2] * 3;
    i += 3;
    const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
    const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    area += 0.5 * Math.hypot(cx, cy, cz);
  }
  return area;
}
