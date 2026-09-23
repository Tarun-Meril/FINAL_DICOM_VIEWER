class CoordinateServiceImpl {
  // Placeholder for coordinate math (Voxel <-> World <-> Image)
  
  worldToImage(worldPos: number[], imagePosition: number[], imageOrientation: number[], pixelSpacing: number[]): number[] {
    // Math to convert 3D world coordinates to 2D image pixel coordinates
    return [0, 0];
  }

  imageToWorld(imagePos: number[], imagePosition: number[], imageOrientation: number[], pixelSpacing: number[]): number[] {
    // Math to convert 2D image pixel coordinates to 3D world coordinates
    return [0, 0, 0];
  }
}

export const CoordinateService = new CoordinateServiceImpl();
