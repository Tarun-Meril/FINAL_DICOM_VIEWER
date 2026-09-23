/**
 * OrientationManager Subsystem
 * Computes viewPlaneNormal and viewUp vectors for Axial, Sagittal, and Coronal MPR planes
 */

import { IOrientationManager } from '../types/contracts';

export class OrientationManager implements IOrientationManager {
  public getOrientationVectors(orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL'): {
    viewPlaneNormal: [number, number, number];
    viewUp: [number, number, number];
  } {
    if (orientation === 'SAGITTAL') {
      return {
        viewPlaneNormal: [1, 0, 0], // Sagittal plane normal along X-axis
        viewUp: [0, 0, 1],          // Up along Z-axis (Superior)
      };
    }

    if (orientation === 'CORONAL') {
      return {
        viewPlaneNormal: [0, 1, 0], // Coronal plane normal along Y-axis
        viewUp: [0, 0, 1],          // Up along Z-axis (Superior)
      };
    }

    // Default: AXIAL plane
    return {
      viewPlaneNormal: [0, 0, 1],   // Axial plane normal along Z-axis
      viewUp: [0, -1, 0],           // Up along -Y axis (Anterior)
    };
  }
}
