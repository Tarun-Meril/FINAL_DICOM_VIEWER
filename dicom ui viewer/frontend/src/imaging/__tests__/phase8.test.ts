/**
 * Phase 8 Enterprise Segmentation & Clinical Tooling Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { SegmentationManager } from '../segmentation/SegmentationManager';
import { LabelMapManager } from '../segmentation/LabelMapManager';
import { RTStructManager } from '../segmentation/RTStructManager';
import { DicomSegManager } from '../segmentation/DicomSegManager';
import { BrushToolController } from '../segmentation/BrushToolController';
import { ThresholdTool } from '../segmentation/ThresholdTool';
import { RegionGrowingTool } from '../segmentation/RegionGrowingTool';
import { LivewireToolController } from '../segmentation/LivewireToolController';
import { MeasurementManager } from '../clinical/MeasurementManager';
import { AnnotationManager } from '../clinical/AnnotationManager';
import { ClinicalSessionManager } from '../clinical/ClinicalSessionManager';
import { MeasurementExporter } from '../clinical/MeasurementExporter';
import { EngineEvents } from '../types/events';

export async function runPhase8UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      passed++;
      logs.push(`✅ PASS: ${testName}`);
    } else {
      failed++;
      logs.push(`❌ FAIL: ${testName}`);
    }
  };

  try {
    const context = new EngineContext(false);

    // 1. Test SegmentationManager Multi-Segmentation Creation & Events
    const segManager = new SegmentationManager(context);
    context.segmentationManager = segManager;

    let segCreatedEmitted = false;
    context.eventBus.on(EngineEvents.SEGMENTATION_CREATED, () => { segCreatedEmitted = true; });

    const seg1 = segManager.createSegmentation('Tumor Lesion', 'vol-1');
    assert(seg1 && seg1.label === 'Tumor Lesion' && seg1.segments.length === 1, 'SegmentationManager should create segmentation object with default segment');
    assert(segCreatedEmitted === true, 'SegmentationManager should emit SEGMENTATION_CREATED event');

    // 2. Test LabelMapManager Voxel Buffer Allocation
    const labelMapManager = new LabelMapManager(context);
    const buffer = labelMapManager.createLabelMapVolume(seg1.segmentationId, [512, 512, 10]);
    assert(buffer instanceof Uint8Array && buffer.length === 512 * 512 * 10, 'LabelMapManager should allocate 3D Uint8Array voxel labelmap buffer');

    // 3. Test RTStructManager & DicomSegManager Import/Export
    const rtManager = new RTStructManager(context);
    const rtImport = rtManager.importRTStruct(new ArrayBuffer(100));
    assert(rtImport.structureSetLabel === 'IMPORTED_RTSTRUCT', 'RTStructManager should parse RTSTRUCT dataset structure');

    const segExportManager = new DicomSegManager(context);
    const segExport = segExportManager.exportDicomSeg(seg1.segmentationId);
    assert(segExport.byteLength > 0, 'DicomSegManager should export DICOM SEG ArrayBuffer');

    // 4. Test Interactive Segmentation Tools (Brush, Threshold, Region Growing, Livewire)
    const brushTool = new BrushToolController(context);
    brushTool.setRadius(15);
    assert(brushTool.getRadius() === 15, 'BrushToolController should update radius');

    const thresholdTool = new ThresholdTool(context);
    thresholdTool.setRange(300, 1500);
    thresholdTool.applyThreshold(seg1.segmentationId, 'vol-1');

    const regionTool = new RegionGrowingTool(context);
    regionTool.growRegion([100, 100, 5], 'vol-1');

    const livewireTool = new LivewireToolController(context);
    const path = livewireTool.computePath([10, 10], [50, 50]);
    assert(path.length > 0, 'LivewireToolController should compute contour path');

    // 5. Test MeasurementManager & AnnotationManager
    const measManager = new MeasurementManager(context);
    context.measurementManager = measManager;

    let measEmitted = false;
    context.eventBus.on(EngineEvents.MEASUREMENT_CREATED, () => { measEmitted = true; });

    measManager.addMeasurement({
      measurementId: 'm-1',
      type: 'LENGTH',
      viewportId: 'vp-1',
      label: 'Lesion Width',
      value: 24.5,
      unit: 'mm',
      points: [[0, 0, 0], [24.5, 0, 0]],
      stats: { mean: 24.5 },
    });

    assert(measManager.getMeasurementsForViewport('vp-1').length === 1, 'MeasurementManager should store measurement by viewportId');
    assert(measEmitted === true, 'MeasurementManager should emit MEASUREMENT_CREATED event');

    const jsonExport = MeasurementExporter.exportToJson(measManager);
    assert(jsonExport.includes('24.5'), 'MeasurementExporter should format measurement data to JSON');

    const annotManager = new AnnotationManager(context);
    annotManager.addAnnotation({
      annotationId: 'a-1',
      type: 'TEXT',
      viewportId: 'vp-1',
      text: 'Suspicious nodule',
      points: [[10, 10, 0]],
    });

    assert(annotManager.getAnnotationsForViewport('vp-1').length === 1, 'AnnotationManager should store annotation by viewportId');

    // 6. Test ClinicalSessionManager Tool History
    const sessionManager = new ClinicalSessionManager(context);
    sessionManager.setActiveTool('Length');
    assert(sessionManager.getActiveTool() === 'Length', 'ClinicalSessionManager should update active tool');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 8 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase8UnitTests = runPhase8UnitTests;
}
