/**
 * MPRViewportLayout Subsystem
 * Manages grid layout configurations (1x3, 2x2, 3+1, SINGLE) for orthographic viewports
 */

import { IMPRViewportLayout } from '../types/contracts';

export class MPRViewportLayout implements IMPRViewportLayout {
  private currentLayout: '1x3' | '2x2' | '3+1' | 'SINGLE' = '2x2';

  public setLayout(type: '1x3' | '2x2' | '3+1' | 'SINGLE'): string[] {
    this.currentLayout = type;

    if (type === 'SINGLE') {
      return ['mpr-axial'];
    }

    if (type === '1x3') {
      return ['mpr-axial', 'mpr-sagittal', 'mpr-coronal'];
    }

    if (type === '3+1' || type === '2x2') {
      return ['mpr-axial', 'mpr-sagittal', 'mpr-coronal', 'mpr-3d'];
    }

    return ['mpr-axial', 'mpr-sagittal', 'mpr-coronal', 'mpr-3d'];
  }

  public getLayoutType(): '1x3' | '2x2' | '3+1' | 'SINGLE' {
    return this.currentLayout;
  }
}
