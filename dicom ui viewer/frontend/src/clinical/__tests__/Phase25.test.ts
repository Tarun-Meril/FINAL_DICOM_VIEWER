import { Vector3 } from '../../3d/math/Vector3';
import { EnterpriseClinicalFacade } from '../index';
import { CinematicRenderingEngine } from '../rendering/CinematicRenderingEngine';
import { LightStudio } from '../rendering/LightStudio';
import { ClippingWorkspace } from '../rendering/ClippingWorkspace';
import { CroppingBox3D } from '../rendering/CroppingBox3D';
import { TransferFunctionEditor } from '../rendering/TransferFunctionEditor';
import { TissueExplorer } from '../rendering/TissueExplorer';
import { LayerRenderingManager } from '../rendering/LayerRenderingManager';
import { CameraController } from '../../3d/camera/CameraController';
import { DynamicRenderer } from '../rendering/DynamicRenderer';
import { InspectionTools } from '../rendering/InspectionTools';
import { RenderExporter } from '../rendering/RenderExporter';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 25 Enterprise Cinematic Rendering & Real-Time Interaction ---');

const facade = new EnterpriseClinicalFacade();

// 1. Cinematic Rendering Engine Test
const cinematic = facade.cinematicEngine;
assert(cinematic.isCinematicActive() === true, 'Cinematic rendering mode should be active by default');
cinematic.setCinematicMode(true);

const shadedColor = cinematic.evaluateVoxelShading(
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, 1),
  new Vector3(0.5, 0.8, 1.0).normalize(),
  [1.0, 1.0, 1.0],
  1.0,
  (pos) => 0.5
);
assert(shadedColor.length === 3 && shadedColor[0] >= 0 && shadedColor[0] <= 1, 'Cinematic voxel shading calculation failed');
console.log('✓ Cinematic rendering engine test passed');

// 2. Ambient Occlusion & Soft Shadows Test
assert(cinematic.ambientOcclusion.settings.enabled === true, 'Ambient occlusion should be enabled');
assert(cinematic.softShadows.settings.enabled === true, 'Soft shadow renderer should be enabled');
const aoValue = cinematic.ambientOcclusion.computeAO(new Vector3(0, 0, 0), new Vector3(0, 0, 1), () => 0.3);
assert(aoValue >= 0 && aoValue <= 1, 'Ambient occlusion compute failed');
const shadowVal = cinematic.softShadows.computeSoftShadow(new Vector3(0, 0, 0), new Vector3(0, 1, 0), () => 0.2);
assert(shadowVal >= 0 && shadowVal <= 1, 'Soft shadow compute failed');
console.log('✓ Ambient occlusion & Soft shadows test passed');

// 3. Light Studio Test
const lightStudio = facade.lightStudio;
assert(lightStudio.activePreset === 'Studio', 'Default light preset should be Studio');
assert(lightStudio.getAllActiveLights().length > 0, 'LightStudio should contain active lights');

lightStudio.applyPreset('Surgical Headlamp');
assert(lightStudio.activePreset === 'Surgical Headlamp', 'Failed to apply Surgical Headlamp light preset');

lightStudio.setLightIntensity('headlamp', 2.0);
assert(lightStudio.getLight('headlamp')?.intensity === 2.0, 'Failed to update light intensity');
console.log('✓ Advanced Light Studio test passed');

// 4. Interactive Clipping Workspace Test
const clipping = facade.clippingWorkspace;
clipping.setMode('Six-Plane');
assert(clipping.planes.size === 6, 'Six-Plane clipping mode should initialize 6 cutting planes');

clipping.setMode('Axial');
assert(clipping.planes.has('axial-top'), 'Axial clipping plane missing');
clipping.updatePlaneDistance('axial-top', 45);
assert(clipping.getActivePlanes().length === 1, 'Active clipping planes count mismatch');
console.log('✓ Interactive Clipping Workspace test passed');

// 5. ROI Cropping Box Test
const cropBox = facade.croppingBox;
cropBox.enable();
assert(cropBox.enabled === true, 'CroppingBox3D should be enabled');
cropBox.setBounds(new Vector3(-50, -50, -50), new Vector3(50, 50, 50));
cropBox.move(new Vector3(10, 0, 0));
const bounds = cropBox.getBounds();
assert(bounds.min.x === -40 && bounds.max.x === 60, 'CroppingBox3D move translation failed');
console.log('✓ ROI Cropping Box test passed');

// 6. Advanced Transfer Function Editor Test
const tfEditor = facade.transferFunctionEditor;
tfEditor.applyPreset('Bone');
assert(tfEditor.activePreset === 'Bone', 'Transfer function preset Bone failed');

tfEditor.applyPreset('Lung');
assert(tfEditor.activePreset === 'Lung', 'Transfer function preset Lung failed');
assert(tfEditor.histogramData.length === 256, 'Histogram data generation failed');

const lungOpacity = tfEditor.evaluateOpacity(-900);
assert(lungOpacity > 0, 'Opacity evaluation for lung HU failed');
console.log('✓ Advanced Transfer Function Editor test passed');

// 7. Tissue Explorer Test
const tissue = facade.tissueExplorer;
assert(tissue.tissues.size === 6, 'TissueExplorer should contain 6 anatomical tissue channels');
tissue.setTissueVisibility('Skin', false);
assert(tissue.tissues.get('Skin')?.visible === false, 'Tissue visibility toggle failed');
tissue.setTissueOpacity('Bone', 0.8);
assert(tissue.tissues.get('Bone')?.opacityScale === 0.8, 'Tissue opacity adjustment failed');
const boneCat = tissue.getTissueForHU(500);
assert(boneCat === 'Bone', 'Tissue classification from HU failed');
console.log('✓ Tissue Explorer test passed');

// 8. Multi-Layer Rendering Test
const layerManager = facade.layerManager;
layerManager.addLayer({
  id: 'pet-layer',
  name: 'PET SUV Layer',
  modality: 'PET',
  volumeId: 'vol-pet-02',
  visible: true,
  opacity: 0.7,
  lut: 'Thermal',
  blendMode: 'PET Overlay'
});
assert(layerManager.layers.size === 2, 'LayerRenderingManager layer count mismatch');
const blended = layerManager.blendColors([0.5, 0.5, 0.5], [1.0, 0.0, 0.0], 0.5, 'PET Overlay');
assert(blended.length === 3, 'Layer blending failed');
console.log('✓ Multi-Layer Rendering test passed');

// 9. Advanced Camera Studio Test
const camera = facade.cameraStudio;
camera.reset(600);
assert(camera.camera.position.z === 600, 'Camera reset failed');
camera.setPresetView('Isometric', 500);
camera.update();
camera.saveBookmark('bm-1', 'Anterior View');
assert(camera.bookmarks.has('bm-1'), 'Save camera bookmark failed');
console.log('✓ Advanced Camera Studio test passed');

// 10. Real-Time Rendering Optimization Test
const dynamicRenderer = facade.dynamicRenderer;
dynamicRenderer.beginInteraction();
assert(dynamicRenderer.isInteracting === true && dynamicRenderer.currentQuality === 'LOW', 'DynamicRenderer interaction begin failed');
dynamicRenderer.endInteraction();
assert(dynamicRenderer.isInteracting === false && dynamicRenderer.currentQuality === 'HIGH', 'DynamicRenderer interaction end failed');
console.log('✓ Real-Time Rendering Optimization test passed');

// 11. Volume Inspection Tools Test
const inspector = facade.inspectionTools;
inspector.setActiveTool('Probe');
const probed = inspector.probeVoxel(new Vector3(10, 10, 10), (pos) => 450);
assert(probed.huValue === 450 && probed.tissueCategory.includes('Bone'), 'Probe tool HU lookup failed');
console.log('✓ Volume Inspection Tools test passed');

// 12. High Resolution Export Test
const exporter = facade.renderExporter;
async function testExport() {
  const result = await exporter.exportHighResRender(null, { format: 'PNG', resolution: '4K' });
  assert(result.width === 3840 && result.height === 2160, 'High resolution 4K render export dimension mismatch');
  assert(result.dataUrl.startsWith('data:image/png'), 'High resolution render export data URL invalid');
  console.log('✓ High Resolution Export test passed');
}
testExport().then(() => {
  console.log('\n=============================================================');
  console.log('ALL PHASE 25 ENTERPRISE CINEMATIC RENDERING TESTS PASSED!');
  console.log('=============================================================\n');
});
