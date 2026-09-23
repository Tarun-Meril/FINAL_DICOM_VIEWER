import { RenderingManager } from './RenderingManager';
import { LayoutManager } from './LayoutManager';
import { RenderScheduler } from '../../rendering/RenderScheduler';
import { Logger, LogCategory } from '../../shared/Logger';

export type VRPresetName = 'bone' | 'lung' | 'soft' | 'vascular' | 'brain' | 'cardiac' | 'msk' | 'abdomen';

import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

class PresetManagerImpl {
  private preset: VRPresetName = 'bone';
  private threshold = 160;
  private opacity = 0.85;

  applyPreset(preset: VRPresetName) {
    this.preset = preset;
    const re = RenderingManager.getEngine();
    if (!re) return;

    const vp = re.getViewport(LayoutManager.VR_ID) as any;
    if (!vp) return;

    try {
      const actor = vp.getActors()[0].actor;
      const property = actor.getProperty();

      const cfun = vtkColorTransferFunction.newInstance();
      const ofun = vtkPiecewiseFunction.newInstance();

      // Direct Volume Rendering (Shade disabled for WebGL stability)
      property.setShade(false);
      property.setInterpolationTypeToLinear();

      const addOpacity = (value: number, opacity: number) => {
        if (value < this.threshold) return;
        ofun.addPoint(value, opacity * this.opacity);
      };

      ofun.addPoint(-1000, 0);
      ofun.addPoint(this.threshold, 0);

      if (preset === 'bone' || preset === 'msk') {
        // Cinematic Bone / Skin (Matches Radiant/Horos Reference)
        // Hounsfield Unit Mapping

        // Color Map (Skin -> Muscle -> Bone)
        cfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
        cfun.addRGBPoint(-500, 1.0, 0.7, 0.6); // Skin tone
        cfun.addRGBPoint(100, 0.9, 0.4, 0.3);  // Muscle / Soft tissue
        cfun.addRGBPoint(200, 0.9, 0.8, 0.7);  // Cartilage
        cfun.addRGBPoint(400, 1.0, 0.95, 0.85); // Light Bone
        cfun.addRGBPoint(1000, 1.0, 1.0, 1.0);  // Hard Bone
        cfun.addRGBPoint(3000, 1.0, 1.0, 1.0);

        // Opacity Map (Transparent air/fat, semi-transparent skin, opaque bone)
        addOpacity(-300, 0);
        addOpacity(-100, 0.3);
        addOpacity(150, 0.5);
        addOpacity(300, 0.7);
        addOpacity(600, 0.95);
        addOpacity(3000, 1.0);

        // High gloss for bone
        property.setAmbient(0.2);
        property.setDiffuse(0.7);
        property.setSpecular(0.4);
        property.setSpecularPower(20.0);

      } else if (preset === 'vascular' || preset === 'cardiac') {
        // Angio / Vascular
        cfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
        cfun.addRGBPoint(100, 0.8, 0.1, 0.1); // Vessels (Red)
        cfun.addRGBPoint(300, 0.9, 0.2, 0.2);
        cfun.addRGBPoint(1000, 1.0, 0.9, 0.8); // Calcification

        addOpacity(100, 0);
        addOpacity(200, 0.6);
        addOpacity(500, 0.9);
        addOpacity(3000, 1.0);

        property.setAmbient(0.1);
        property.setDiffuse(0.9);
        property.setSpecular(0.2);
        property.setSpecularPower(10.0);

      } else if (preset === 'lung') {
        // Lung Parenchyma & Airway Volume Rendering
        // Emphasizes negative HU range (-900 to -400)
        cfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
        cfun.addRGBPoint(-900, 0.3, 0.3, 0.7);  // Air/Parenchyma boundary (deep blue)
        cfun.addRGBPoint(-700, 0.4, 0.7, 0.9);  // Parenchyma (light blue)
        cfun.addRGBPoint(-500, 0.9, 0.8, 0.8);  // Infiltrates/vessels (pale pink)
        cfun.addRGBPoint(100, 0.8, 0.2, 0.2);   // Thoracic wall/vessels (red)
        cfun.addRGBPoint(500, 0.9, 0.9, 0.9);   // Ribs/spine (white)

        addOpacity(-950, 0.0);
        addOpacity(-800, 0.25);
        addOpacity(-600, 0.45);
        addOpacity(-400, 0.1);                  // Suppress high-density chest wall to see inside lungs
        addOpacity(100, 0.05);
        addOpacity(400, 0.2);

        property.setAmbient(0.3);
        property.setDiffuse(0.7);
        property.setSpecular(0.1);
        property.setSpecularPower(8.0);

      } else if (preset === 'brain') {
        // Brain Tissue / Neurological VR
        cfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
        cfun.addRGBPoint(0, 0.2, 0.2, 0.3);     // CSF (dark bluish)
        cfun.addRGBPoint(30, 0.8, 0.65, 0.55);  // Gray/White matter (flesh tone)
        cfun.addRGBPoint(50, 0.85, 0.7, 0.6);
        cfun.addRGBPoint(100, 0.8, 0.2, 0.2);   // Intracranial vessels (crimson)
        cfun.addRGBPoint(800, 1.0, 1.0, 1.0);   // Calvarium / Bone

        addOpacity(0, 0.0);
        addOpacity(20, 0.2);
        addOpacity(40, 0.6);
        addOpacity(60, 0.75);
        addOpacity(100, 0.3);                   // Lower opacity for calvarium to permit viewing intracranial structures
        addOpacity(800, 0.15);

        property.setAmbient(0.25);
        property.setDiffuse(0.75);
        property.setSpecular(0.2);
        property.setSpecularPower(12.0);

      } else {
        // Soft Tissue / Abdomen
        cfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
        cfun.addRGBPoint(-100, 0.8, 0.7, 0.5);  // Fat/Adipose (yellowish)
        cfun.addRGBPoint(40, 0.85, 0.45, 0.35); // Muscle/Organ Parenchyma (red-brown)
        cfun.addRGBPoint(120, 0.9, 0.6, 0.5);   // Contrast-enhanced tissue
        cfun.addRGBPoint(300, 1.0, 0.9, 0.8);   // Cortical bone
        cfun.addRGBPoint(1000, 1.0, 1.0, 1.0);

        addOpacity(-120, 0.0);
        addOpacity(-50, 0.2);
        addOpacity(30, 0.55);
        addOpacity(80, 0.8);
        addOpacity(300, 0.95);
        addOpacity(1000, 1.0);

        property.setAmbient(0.25);
        property.setDiffuse(0.75);
        property.setSpecular(0.2);
        property.setSpecularPower(10.0);
      }

      // Apply functions to actor
      property.setRGBTransferFunction(0, cfun);
      property.setScalarOpacity(0, ofun);

      // DISABLED: Gradient Opacity crashes vtk.js on some systems with "isAttributeUsed"
      property.setUseGradientOpacity(0, false);
      // property.setGradientOpacityMinimumValue(0, 2);
      // property.setGradientOpacityMinimumOpacity(0, 0.0);
      // property.setGradientOpacityMaximumValue(0, 20);
      // property.setGradientOpacityMaximumOpacity(0, 1.0);

      RenderScheduler.queueRenderViewport(LayoutManager.VR_ID);
      Logger.info(LogCategory.RENDER, `[PresetManager] Applied High-Fidelity Cinematic Preset: ${preset}`);
    } catch (e) {
      Logger.error(LogCategory.RENDER, `[PresetManager] Failed to apply VR preset`, e);
    }
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    this.applyPreset(this.preset);
  }

  setThreshold(threshold: number) {
    this.threshold = threshold;
    this.applyPreset(this.preset);
  }
}

export const PresetManager = new PresetManagerImpl();
