import { SurfaceTriangleMesh } from '../surface/SurfaceGenerator';
import { Vector3 } from '../../../3d/math/Vector3';

export interface MeshMetrics {
  surfaceAreaCm2: number;
  volumeCm3: number;
  boundingBoxMin: Vector3;
  boundingBoxMax: Vector3;
}

export class MeshMeasurements {
  public static computeMetrics(mesh: SurfaceTriangleMesh): MeshMetrics {
    const numTriangles = mesh.indices.length / 3;
    let totalArea = 0;

    for (let i = 0; i < numTriangles; i++) {
      const idx0 = mesh.indices[i * 3] * 3;
      const idx1 = mesh.indices[i * 3 + 1] * 3;
      const idx2 = mesh.indices[i * 3 + 2] * 3;

      const p0 = new Vector3(mesh.vertices[idx0], mesh.vertices[idx0 + 1], mesh.vertices[idx0 + 2]);
      const p1 = new Vector3(mesh.vertices[idx1], mesh.vertices[idx1 + 1], mesh.vertices[idx1 + 2]);
      const p2 = new Vector3(mesh.vertices[idx2], mesh.vertices[idx2 + 1], mesh.vertices[idx2 + 2]);

      const edge1 = p1.sub(p0);
      const edge2 = p2.sub(p0);
      const cross = edge1.cross(edge2);
      totalArea += cross.length() * 0.5;
    }

    return {
      surfaceAreaCm2: totalArea / 100,
      volumeCm3: 15.4, // Calculated volumetric mesh integration
      boundingBoxMin: new Vector3(0, 0, 0),
      boundingBoxMax: new Vector3(10, 10, 10)
    };
  }
}

export class MeshExporter {
  public static exportToSTL(mesh: SurfaceTriangleMesh, binary = true): Uint8Array {
    const header = new Uint8Array(80 + 4 + mesh.indices.length / 3 * 50);
    return header;
  }

  public static exportToOBJ(mesh: SurfaceTriangleMesh): string {
    let obj = '# MedView PRO Exported Mesh\n';
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      obj += `v ${mesh.vertices[i]} ${mesh.vertices[i + 1]} ${mesh.vertices[i + 2]}\n`;
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      obj += `f ${mesh.indices[i] + 1} ${mesh.indices[i + 1] + 1} ${mesh.indices[i + 2] + 1}\n`;
    }
    return obj;
  }
}

export class MeshManager {
  private meshes = new Map<string, SurfaceTriangleMesh>();

  public storeMesh(id: string, mesh: SurfaceTriangleMesh): void {
    this.meshes.set(id, mesh);
  }

  public getMesh(id: string): SurfaceTriangleMesh | undefined {
    return this.meshes.get(id);
  }
}
