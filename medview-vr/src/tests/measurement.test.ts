import { describe, it, expect } from 'vitest';
import { measure, formatLength, formatVolume, volumePhysicalDimensions, measurementValidity } from '@/measurement/measurements';
import { rayThroughPixel, pickFirstHit, pickMaximum, worldToScreen } from '@/measurement/picking';
import { placeCamera, cameraPreset } from '@/rendering/camera';
import { PRESET_BONE } from '@/rendering/presets';
import { analyzeGeometry } from '@/dicom/geometry';
import { axialStack } from './fixtures';
import type { MeasurementBase } from '@/measurement/measurements';
import type { Vec3 } from '@/math/vec3';

const m = (kind: MeasurementBase['kind'], points: Vec3[]): MeasurementBase => ({
  id: 'x', kind, label: '', color: [1, 1, 1], visible: true, createdAt: 0, points, spatiallyValid: true,
});

describe('measurement arithmetic', () => {
  it('measures a 3D distance in millimetres', () => {
    const v = measure(m('distance', [[0, 0, 0], [3, 4, 12]]));
    expect(v.primary).toBeCloseTo(13, 9);
    expect(v.display).toBe('13.00 mm');
    expect(v.components!['Δ Sup–Inf']).toBe('12.00 mm');
  });

  it('switches to centimetres above 100 mm', () => {
    expect(formatLength(150)).toBe('15.00 cm');
    expect(formatLength(99.5)).toBe('99.50 mm');
  });

  it('measures an angle at the middle point', () => {
    const v = measure(m('angle', [[1, 0, 0], [0, 0, 0], [0, 1, 0]]));
    expect(v.primary).toBeCloseTo(90, 6);
    expect(v.display).toBe('90.0°');
  });

  it('sums a polyline', () => {
    const v = measure(m('polyline', [[0, 0, 0], [0, 0, 10], [0, 10, 10], [10, 10, 10]]));
    expect(v.primary).toBeCloseTo(30, 9);
    expect(v.components!.Segments).toBe('3');
  });

  it('reports bounding box edge lengths and volume', () => {
    const v = measure(m('bounding-box', [[0, 0, 0], [10, 20, 30]]));
    expect(v.display).toBe('10.0 × 20.0 × 30.0 mm');
    expect(v.primary).toBe(6000);
    expect(v.components!.Volume).toBe('6.00 mL');
  });

  it('formats volumes in mL and mm³', () => {
    expect(formatVolume(2500)).toBe('2.50 mL');
    expect(formatVolume(400)).toBe('400.0 mm³');
  });

  it('reports segment volume with the voxel count that produced it', () => {
    const g = analyzeGeometry(axialStack([0, 1, 2], { pixelSpacing: [0.5, 0.5] })).geometry!;
    const v = measure(m('segment-volume', []), g, { volumeMm3: 1000 });
    expect(v.display).toBe('1.00 mL');
    expect(v.components!['Voxel volume']).toBe('0.2500 mm³');
    expect(v.components!.Voxels).toBe('4000');
  });
});

describe('measurement validity', () => {
  it('accepts measured spacing', () => {
    const g = analyzeGeometry(axialStack([0, 1, 2])).geometry!;
    expect(measurementValidity(g).valid).toBe(true);
  });

  it('rejects assumed spacing and explains why', () => {
    const g = analyzeGeometry(axialStack([0, 1, 2])).geometry!;
    expect(measurementValidity({ ...g, spacingSource: 'assumed-unit' }).valid).toBe(false);
    expect(measurementValidity({ ...g, spacingSource: 'slice-thickness' }).reason).toMatch(/Slice Thickness/);
  });

  it('reports the physical size of the field of view', () => {
    const g = analyzeGeometry(axialStack([0, 1, 2, 3], { rows: 100, columns: 200, pixelSpacing: [0.5, 0.25] })).geometry!;
    const p = volumePhysicalDimensions(g);
    expect(p.mm[0]).toBeCloseTo(200 * 0.25, 9);
    expect(p.mm[1]).toBeCloseTo(100 * 0.5, 9);
    expect(p.mm[2]).toBeCloseTo(4, 9);
  });
});

describe('picking and projection', () => {
  const N = 16;
  const geometry = (() => {
    const g = analyzeGeometry(axialStack(Array.from({ length: N }, (_, k) => k), { rows: N, columns: N, pixelSpacing: [1, 1] })).geometry!;
    return { ...g, dimensions: [N, N, N] as [number, number, number], physicalSize: [N, N, N] as [number, number, number] };
  })();
  // A dense cube in the middle of an air volume.
  const scalars = (() => {
    const s = new Int16Array(N * N * N).fill(-1000);
    for (let k = 5; k < 11; k++) for (let j = 5; j < 11; j++) for (let i = 5; i < 11; i++) s[(k * N + j) * N + i] = 900;
    return s;
  })();
  const centre: Vec3 = [
    geometry.origin[0] + N / 2, geometry.origin[1] + N / 2, geometry.origin[2] + N / 2,
  ];

  it('casts a centre-pixel ray straight down the view axis', () => {
    const cam = placeCamera(cameraPreset('anterior'), centre, 20, false);
    const ray = rayThroughPixel(cam, 400, 400, 800, 800);
    expect(ray.direction[0]).toBeCloseTo(0, 6);
    expect(ray.direction[1]).toBeCloseTo(1, 6);
    expect(ray.direction[2]).toBeCloseTo(0, 6);
  });

  it('hits the dense cube and returns its HU and patient coordinates', () => {
    const cam = placeCamera(cameraPreset('anterior'), centre, 20, false);
    const ray = rayThroughPixel(cam, 400, 400, 800, 800);
    const hit = pickFirstHit(ray, scalars, geometry, PRESET_BONE, { stepMm: 0.25 });
    expect(hit).not.toBeNull();
    expect(hit!.hu).toBe(900);
    // The anterior-most face of the cube is voxel row j = 5, whose extent runs from
    // origin.y + 4.5 to origin.y + 5.5; the hit must land on that leading face.
    expect(hit!.world[1]).toBeGreaterThanOrEqual(geometry.origin[1] + 4.4);
    expect(hit!.world[1]).toBeLessThanOrEqual(geometry.origin[1] + 5.6);
    expect(hit!.index[1]).toBe(5);
  });

  it('returns null when the ray misses the volume', () => {
    const cam = placeCamera(cameraPreset('anterior'), centre, 20, false);
    const ray = { origin: [1e5, 1e5, 1e5] as Vec3, direction: [0, 0, 1] as Vec3 };
    expect(pickFirstHit(ray, scalars, geometry, PRESET_BONE)).toBeNull();
    void cam;
  });

  it('pickMaximum finds the densest sample along the ray', () => {
    const cam = placeCamera(cameraPreset('anterior'), centre, 20, false);
    const ray = rayThroughPixel(cam, 400, 400, 800, 800);
    expect(pickMaximum(ray, scalars, geometry, { stepMm: 0.25 })!.hu).toBe(900);
  });

  it('honours the visibility mask when picking', () => {
    const cam = placeCamera(cameraPreset('anterior'), centre, 20, false);
    const ray = rayThroughPixel(cam, 400, 400, 800, 800);
    const visibility = new Uint8Array(N * N * N).fill(0);
    expect(pickFirstHit(ray, scalars, geometry, PRESET_BONE, { visibility })).toBeNull();
  });

  it('projects a world point back to the pixel the ray came from (perspective)', () => {
    const cam = placeCamera(cameraPreset('ant-left-45'), centre, 20, false);
    for (const [px, py] of [[400, 400], [250, 600], [700, 180]]) {
      const ray = rayThroughPixel(cam, px, py, 800, 800);
      const world: Vec3 = [
        ray.origin[0] + ray.direction[0] * 50,
        ray.origin[1] + ray.direction[1] * 50,
        ray.origin[2] + ray.direction[2] * 50,
      ];
      const s = worldToScreen(cam, world, 800, 800);
      expect(s.x).toBeCloseTo(px, 4);
      expect(s.y).toBeCloseTo(py, 4);
    }
  });

  it('projects a world point back to the pixel the ray came from (orthographic)', () => {
    const cam = placeCamera(cameraPreset('superior'), centre, 20, true);
    for (const [px, py] of [[400, 400], [120, 700]]) {
      const ray = rayThroughPixel(cam, px, py, 900, 700);
      const world: Vec3 = [
        ray.origin[0] + ray.direction[0] * 1e4,
        ray.origin[1] + ray.direction[1] * 1e4,
        ray.origin[2] + ray.direction[2] * 1e4,
      ];
      const s = worldToScreen(cam, world, 900, 700);
      expect(s.x).toBeCloseTo(px, 4);
      expect(s.y).toBeCloseTo(py, 4);
    }
  });
});
