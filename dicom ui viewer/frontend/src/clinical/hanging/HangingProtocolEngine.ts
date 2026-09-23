export interface ProtocolRule {
  id: string;
  name: string;
  modalityPattern: string; // e.g. 'CT', 'MR', 'DX'
  descriptionPattern?: string;
  suggestedLayout: '1x1' | '1x2' | '2x2' | '3D+MPR';
  viewportAssignments: { viewportId: string; seriesMatching: string }[];
}

export class HangingProtocolEngine {
  private rules: ProtocolRule[] = [
    {
      id: 'ct-chest-protocol',
      name: 'CT Chest Diagnostic Protocol',
      modalityPattern: 'CT',
      suggestedLayout: '2x2',
      viewportAssignments: [
        { viewportId: 'vp-1', seriesMatching: 'axial' },
        { viewportId: 'vp-2', seriesMatching: 'coronal' },
        { viewportId: 'vp-3', seriesMatching: 'sagittal' },
        { viewportId: 'vp-4', seriesMatching: '3d' }
      ]
    },
    {
      id: 'mri-brain-protocol',
      name: 'MRI Brain Protocol',
      modalityPattern: 'MR',
      suggestedLayout: '1x2',
      viewportAssignments: [
        { viewportId: 'vp-1', seriesMatching: 't1' },
        { viewportId: 'vp-2', seriesMatching: 't2' }
      ]
    }
  ];

  public matchProtocol(modality: string, description = ''): ProtocolRule {
    const matched = this.rules.find(r => modality.toUpperCase().includes(r.modalityPattern));
    return matched || {
      id: 'default-protocol',
      name: 'Default Single Viewport Protocol',
      modalityPattern: modality,
      suggestedLayout: '1x1',
      viewportAssignments: [{ viewportId: 'vp-1', seriesMatching: 'default' }]
    };
  }
}

export class ClinicalPresetManager {
  public defaultPresets = ['Soft Tissue', 'Bone', 'Lung', 'Brain', 'Angio'];
}
