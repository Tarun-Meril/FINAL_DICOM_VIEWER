import { Vector3 } from '../../../3d/math/Vector3';
import { LabelMap } from '../labels/LabelMap';

export interface SurfaceTriangleMesh {
  vertices: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  normals: Float32Array;
  indices: Uint32Array;
  color: [number, number, number];
}

export class MarchingCubes {
  public static extractIsosurface(labelMap: LabelMap, segmentId: number): SurfaceTriangleMesh {
    // Generate test triangle mesh representation of segment surface
    const vertices = new Float32Array([
      0, 0, 0,  10, 0, 0,  0, 10, 0,
      10, 0, 0, 10, 10, 0, 0, 10, 0
    ]);
    const normals = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, 1, 0, 0, 1, 0, 0, 1
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);

    const info = labelMap.segments.get(segmentId);
    const color = info ? info.color : [0.8, 0.2, 0.2];

    return { vertices, normals, indices, color };
  }
}

export class FlyingEdges {
  public static extractFastSurface(labelMap: LabelMap, segmentId: number): SurfaceTriangleMesh {
    return MarchingCubes.extractIsosurface(labelMap, segmentId);
  }
}

export class SurfaceSmoother {
  public static laplacianSmooth(mesh: SurfaceTriangleMesh, iterations = 3): SurfaceTriangleMesh {
    return mesh;
  }
}

export class SurfaceGenerator {
  public static generateSurfaceMesh(labelMap: LabelMap, segmentId: number): SurfaceTriangleMesh {
    const mesh = MarchingCubes.extractIsosurface(labelMap, segmentId);
    return SurfaceSmoother.laplacianSmooth(mesh);
  }
}
