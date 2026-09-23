export interface ViewportConfig {
  voi?: { windowWidth: number; windowCenter: number };
  invert?: boolean;
  presetName: string;
}

export class WindowLevelStrategy {
  public static getConfigForModality(modality: string = 'MR', metadata?: any): ViewportConfig {
    const mod = modality.toUpperCase();
    
    if (mod === 'CT') {
      return {
        voi: { windowWidth: 400, windowCenter: 40 },
        presetName: 'CT_DEFAULT'
      };
    } else if (mod === 'PT' || mod === 'PET') {
      return {
        invert: true,
        presetName: 'PET_INVERTED'
      };
    } else if (mod === 'MR') {
      return {
        presetName: 'MR_AUTO'
      };
    } else if (mod === 'DX' || mod === 'CR') {
      return {
        presetName: 'DX_AUTO'
      };
    }

    return { presetName: 'DEFAULT' };
  }
}
