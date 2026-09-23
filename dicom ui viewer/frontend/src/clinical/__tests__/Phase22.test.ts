import { Vector3 } from '../../3d/math/Vector3';
import { SegmentationEngine } from '../segmentation/SegmentationEngine';
import { LabelManager } from '../segmentation/labels/LabelMap';
import { ThresholdSegmentation } from '../segmentation/algorithms/ThresholdSegmentation';
import { RegionGrowing } from '../segmentation/algorithms/RegionGrowing';
import { BrushEditor } from '../segmentation/editing/BrushEditor';
import { MarchingCubes, SurfaceGenerator } from '../segmentation/surface/SurfaceGenerator';
import { MeshMeasurements, MeshExporter } from '../segmentation/mesh/MeshExporter';
import { HUAnalysis, QuantificationEngine } from '../segmentation/quantification/QuantificationEngine';
import { SegmentationValidator } from '../segmentation/validation/SegmentationValidator';
import { ExtendedClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 22 Enterprise Segmentation, Surface Modeling & Quantification Platform ---');

const dims = new Vector3(32, 32, 32);
const mockScalarData = new Int16Array(32 * 32 * 32).fill(-100);

// Set sphere of HU 300 (Kidney organ tissue simulation)
const centerIdx = 16 * 32 * 32 + 16 * 32 + 16;
mockScalarData[centerIdx] = 300;
mockScalarData[centerIdx + 1] = 300;
mockScalarData[centerIdx - 1] = 300;

// 1. Master Segmentation Engine & Label Map Test
const engine = new SegmentationEngine();
const labelMap = engine.createLabelMap(dims);
assert(labelMap.segments.size === 2, 'LabelMap segment initialization failed');
assert(labelMap.segments.get(1)?.name === 'Left Kidney', 'LabelMap segment metadata failed');
console.log('✓ Master SegmentationEngine & Label Map test passed');

// 2. Threshold Segmentation Test
const countThreshold = ThresholdSegmentation.applyThreshold(mockScalarData, dims, 200, 400, labelMap, 1);
assert(countThreshold === 3, 'ThresholdSegmentation voxel count failed');
console.log('✓ Threshold Segmentation algorithm test passed');

// 3. 3D Region Growing Algorithm Test
const countRegion = RegionGrowing.grow3D(mockScalarData, dims, new Vector3(16, 16, 16), 50, labelMap, 2);
assert(countRegion >= 1, 'RegionGrowing voxel count failed');
console.log('✓ 3D Region Growing algorithm test passed');

// 4. Interactive Brush Editor Test
BrushEditor.paintSphere(labelMap, new Vector3(10, 10, 10), 3, 1);
assert(labelMap.getVoxel(10, 10, 10) === 1, 'BrushEditor paintSphere failed');
BrushEditor.eraseSphere(labelMap, new Vector3(10, 10, 10), 3);
assert(labelMap.getVoxel(10, 10, 10) === 0, 'BrushEditor eraseSphere failed');
console.log('✓ Interactive Mask Brush & Eraser Editor test passed');

// 5. Marching Cubes Isosurface Generation Test
const mesh = SurfaceGenerator.generateSurfaceMesh(labelMap, 1);
assert(mesh.vertices.length > 0 && mesh.indices.length > 0, 'MarchingCubes isosurface generation failed');
console.log('✓ Marching Cubes Isosurface Generation test passed');

// 6. Mesh Measurements & Exporter Test
const metrics = MeshMeasurements.computeMetrics(mesh);
assert(metrics.surfaceAreaCm2 > 0 && metrics.volumeCm3 > 0, 'MeshMeasurements area & volume calculation failed');

const objStr = MeshExporter.exportToOBJ(mesh);
assert(objStr.includes('v ') && objStr.includes('f '), 'MeshExporter exportToOBJ failed');
const stlBytes = MeshExporter.exportToSTL(mesh);
assert(stlBytes.length > 0, 'MeshExporter exportToSTL failed');
console.log('✓ Mesh Measurements & STL/OBJ Exporter test passed');

// 7. Quantitative HU Analysis & Statistics Test
const huStats = HUAnalysis.computeHU(mockScalarData, dims, labelMap, 1);
assert(huStats.count >= 0, 'HUAnalysis computation failed');

const quantStats = QuantificationEngine.computeSegmentStatistics(mockScalarData, dims, new Vector3(1, 1, 1), labelMap, 1);
assert(quantStats.segmentName === 'Left Kidney', 'QuantificationEngine stats generation failed');
console.log('✓ Quantitative HU Analysis & Statistics test passed');

// 8. Segmentation Validation Test
const valResult = SegmentationValidator.validateMask(labelMap);
assert(valResult.valid === true, 'SegmentationValidator validation failed');
console.log('✓ Segmentation Validator test passed');

// 9. Extended Public Facade Test
const facade = new ExtendedClinicalFacade();
const map = facade.createSegmentation(dims);
assert(map !== null, 'ExtendedClinicalFacade createSegmentation failed');
console.log('✓ ExtendedClinicalFacade public API test passed');
