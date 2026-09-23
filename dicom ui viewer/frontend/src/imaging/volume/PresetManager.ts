/**
 * PresetManager Subsystem
 * Enterprise DICOM Window/Level and 3D Volume Preset Manager
 */

import { IPresetManager, IVolumePreset } from '../types/contracts';

export class PresetManager implements IPresetManager {
  private presets: Map<string, IVolumePreset> = new Map();

  constructor() {
    this.registerDefaultPresets();
  }

  private registerDefaultPresets(): void {
    const defaultPresets: IVolumePreset[] = [
      { name: 'CT-SoftTissue', windowWidth: 400, windowLevel: 40, description: 'CT Soft Tissue' },
      { name: 'CT-Bone', windowWidth: 2000, windowLevel: 500, description: 'CT Bone Window' },
      { name: 'CT-Lung', windowWidth: 1500, windowLevel: -600, description: 'CT Lung Window' },
      { name: 'CT-Brain', windowWidth: 80, windowLevel: 40, description: 'CT Brain Window' },
      { name: 'CT-Angio', windowWidth: 600, windowLevel: 200, description: 'CT Angiography' },
      { name: 'MR-T1', windowWidth: 500, windowLevel: 250, description: 'MRI T1 Weighted' },
      { name: 'MR-T2', windowWidth: 800, windowLevel: 400, description: 'MRI T2 Weighted' },
      { name: 'MR-FLAIR', windowWidth: 700, windowLevel: 350, description: 'MRI FLAIR Sequence' },
      { name: 'PET', windowWidth: 5, windowLevel: 2.5, description: 'PET SUV Standard' },
    ];

    defaultPresets.forEach((p) => this.registerPreset(p));
  }

  public registerPreset(preset: IVolumePreset): void {
    if (!preset || !preset.name) return;
    this.presets.set(preset.name.toUpperCase(), preset);
  }

  public getPreset(name: string): IVolumePreset | undefined {
    return this.presets.get(name.toUpperCase());
  }

  public getDefaultPresetForModality(modality: string): IVolumePreset {
    const mod = modality ? modality.toUpperCase() : 'CT';
    if (mod === 'MR') return this.getPreset('MR-T1')!;
    if (mod === 'PT' || mod === 'PET') return this.getPreset('PET')!;
    return this.getPreset('CT-SoftTissue')!;
  }
}
