import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { directionFlat } from '@3d/math/vec3';
import type { VolumeGeometry } from '@3d/dicom/geometry';

/**
 * Build the vtkImageData that the GPU mapper consumes.
 *
 * The direction matrix is laid out as [iAxis, jAxis, kAxis] because vtkImageData
 * copies direction[0..2] into column 0 of its column-major index→world matrix, i.e.
 * direction[0..2] is the world direction of increasing index i. Getting this wrong is
 * exactly how a viewer silently mirrors a patient, so it is asserted in the test suite.
 */
export function createImageData(
  scalars: Int16Array | Uint8Array | Float32Array, geometry: VolumeGeometry, name = 'HU',
): vtkImageData {
  const image = vtkImageData.newInstance();
  image.setDimensions(geometry.dimensions[0], geometry.dimensions[1], geometry.dimensions[2]);
  image.setSpacing([geometry.spacing[0], geometry.spacing[1], geometry.spacing[2]]);
  image.setOrigin([geometry.origin[0], geometry.origin[1], geometry.origin[2]]);
  image.setDirection(...directionFlat(geometry.iAxis, geometry.jAxis, geometry.kAxis));
  image.getPointData().setScalars(vtkDataArray.newInstance({
    name, numberOfComponents: 1, values: scalars,
  }));
  return image;
}

/** Replace the scalar array in place (used after a sculpt/mask change) without
 *  rebuilding the geometry, so the GPU only re-uploads the texture. */
export function updateScalars(image: vtkImageData, scalars: Int16Array | Uint8Array): void {
  const arr = image.getPointData().getScalars();
  arr.setData(scalars as unknown as Float32Array);
  arr.modified();
  image.modified();
}

/** World-space bounds of the volume, [xmin,xmax,ymin,ymax,zmin,zmax]. */
export function worldBounds(geometry: VolumeGeometry): [number, number, number, number, number, number] {
  const b: [number, number, number, number, number, number] = [
    Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  const [nx, ny, nz] = geometry.dimensions;
  for (let c = 0; c < 8; c++) {
    const i = (c & 1 ? nx - 1 : 0), j = (c & 2 ? ny - 1 : 0), k = (c & 4 ? nz - 1 : 0);
    const w = [
      geometry.origin[0] + geometry.iAxis[0] * i * geometry.spacing[0] + geometry.jAxis[0] * j * geometry.spacing[1] + geometry.kAxis[0] * k * geometry.spacing[2],
      geometry.origin[1] + geometry.iAxis[1] * i * geometry.spacing[0] + geometry.jAxis[1] * j * geometry.spacing[1] + geometry.kAxis[1] * k * geometry.spacing[2],
      geometry.origin[2] + geometry.iAxis[2] * i * geometry.spacing[0] + geometry.jAxis[2] * j * geometry.spacing[1] + geometry.kAxis[2] * k * geometry.spacing[2],
    ];
    for (let a = 0; a < 3; a++) {
      b[a * 2] = Math.min(b[a * 2], w[a]);
      b[a * 2 + 1] = Math.max(b[a * 2 + 1], w[a]);
    }
  }
  return b;
}

export function worldCentre(geometry: VolumeGeometry): [number, number, number] {
  const b = worldBounds(geometry);
  return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
}
