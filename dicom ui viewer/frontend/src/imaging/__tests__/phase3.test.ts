/**
 * Phase 3 Enterprise DICOM Pipeline Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { ImageOrientation, Instance, PixelSpacing } from '../domain/entities/DicomEntities';
import { DisplaySetBuilder } from '../dicom/DisplaySetBuilder';
import { ImageIdBuilder } from '../dicom/ImageIdBuilder';
import { DicomMetadataStore } from '../metadata/DicomMetadataStore';
import { StudyRepository } from '../dicom/StudyRepository';
import { StudyLoader } from '../dicom/StudyLoader';
import { EngineEvents } from '../types/events';

export async function runPhase3UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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
    const metadataStore = new DicomMetadataStore(context);
    context.metadataStore = metadataStore;

    // 1. Test Domain Entities & Spatial Vector Normal Calculation
    const orientation = new ImageOrientation([1, 0, 0], [0, 1, 0]);
    const normal = orientation.getNormalVector();
    assert(normal[0] === 0 && normal[1] === 0 && normal[2] === 1, 'ImageOrientation normal vector for Axial plane should be [0, 0, 1]');

    const spacing = new PixelSpacing(0.68, 0.68);
    assert(spacing.rowSpacing === 0.68 && spacing.columnSpacing === 0.68, 'PixelSpacing value object should store row and column spacing');

    // 2. Test Dot-Product Projection Spatial Slice Sorting Algorithm
    const inst1 = new Instance({
      sopInstanceUid: 'sop-1',
      seriesInstanceUid: 'series-1',
      studyInstanceUid: 'study-1',
      instanceNumber: 3,
      imagePositionPatient: [0, 0, 30.0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    });
    const inst2 = new Instance({
      sopInstanceUid: 'sop-2',
      seriesInstanceUid: 'series-1',
      studyInstanceUid: 'study-1',
      instanceNumber: 1,
      imagePositionPatient: [0, 0, 10.0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    });
    const inst3 = new Instance({
      sopInstanceUid: 'sop-3',
      seriesInstanceUid: 'series-1',
      studyInstanceUid: 'study-1',
      instanceNumber: 2,
      imagePositionPatient: [0, 0, 20.0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    });

    const displaySetBuilder = new DisplaySetBuilder(context);
    const sorted = displaySetBuilder.sortInstancesSpatially([inst1, inst2, inst3]);

    assert(
      sorted[0].sopInstanceUid === 'sop-2' &&
      sorted[1].sopInstanceUid === 'sop-3' &&
      sorted[2].sopInstanceUid === 'sop-1',
      'Spatial Slice Sorting should order instances by physical Z-position (10.0 -> 20.0 -> 30.0) regardless of InstanceNumber'
    );

    // 3. Test ImageIdBuilder
    const uriImageId = ImageIdBuilder.buildWadoUriImageId('http://localhost:8000', 'sop-123');
    assert(uriImageId === 'wadouri:http://localhost:8000/api/instances/sop-123/file', 'ImageIdBuilder should format valid wadouri imageIds');

    const rsImageId = ImageIdBuilder.buildWadoRsImageId('http://localhost:8000', 'st-1', 'se-1', 'sop-123', 0);
    assert(rsImageId === 'wadors:http://localhost:8000/studies/st-1/series/se-1/instances/sop-123', 'ImageIdBuilder should format valid wadors imageIds');

    // 4. Test DisplaySet Building
    inst1.imageId = uriImageId;
    inst2.imageId = ImageIdBuilder.buildWadoUriImageId('http://localhost:8000', 'sop-2');
    inst3.imageId = ImageIdBuilder.buildWadoUriImageId('http://localhost:8000', 'sop-3');

    const displaySets = displaySetBuilder.buildDisplaySetsForSeries('series-1', 'CT', [inst1, inst2, inst3]);
    assert(displaySets.length === 1, 'DisplaySetBuilder should generate 1 DisplaySet');
    assert(displaySets[0].isVolumeEligible === true, 'CT series with 3+ slices should be volume eligible');
    assert(displaySets[0].imageIds.length === 3, 'DisplaySet should contain 3 sorted imageIds');

    // 5. Test DicomMetadataStore Indexing & Module Providers
    metadataStore.addInstances([inst1, inst2, inst3]);
    const fetchedInst = metadataStore.getInstance('sop-1');
    assert(fetchedInst?.sopInstanceUid === 'sop-1', 'DicomMetadataStore should retrieve instance by SOPInstanceUID');

    const planeModule = metadataStore.getModule('imagePlaneModule', uriImageId);
    assert(planeModule && planeModule.columns === 512, 'DicomMetadataStore getModule should return Cornerstone imagePlaneModule');

    // 6. Test StudyRepository
    const repo = new StudyRepository(context);
    repo.addStudy({ studyInstanceUid: 'study-1', seriesList: [] } as any);
    assert(repo.getStudy('study-1') !== undefined, 'StudyRepository should cache and retrieve Study entity');
    repo.clear();
    assert(repo.getStudy('study-1') === undefined, 'StudyRepository clear should flush cached studies');

    // 7. Test Mocked StudyLoader Pipeline Execution
    const mockWadoClient = {
      fetchStudyMetadata: async () => [{ series_instance_uid: 'se-100', modality: 'CT', series_number: 1, series_description: 'Chest CT' }],
      fetchSeriesMetadata: async () => [
        { sop_instance_uid: 'sop-201', series_instance_uid: 'se-100', study_instance_uid: 'st-999', rows: 512, columns: 512, image_position: [0, 0, 0] },
        { sop_instance_uid: 'sop-202', series_instance_uid: 'se-100', study_instance_uid: 'st-999', rows: 512, columns: 512, image_position: [0, 0, 1.25] },
        { sop_instance_uid: 'sop-203', series_instance_uid: 'se-100', study_instance_uid: 'st-999', rows: 512, columns: 512, image_position: [0, 0, 2.5] },
      ],
    };

    context.wadoClient = mockWadoClient as any;
    const studyLoader = new StudyLoader(context);

    let studyLoadedEmitted = false;
    let pipelineReadyEmitted = false;

    context.eventBus.on(EngineEvents.STUDY_LOADED, () => { studyLoadedEmitted = true; });
    context.eventBus.on(EngineEvents.DICOM_PIPELINE_READY, () => { pipelineReadyEmitted = true; });

    const study = await studyLoader.loadStudy('st-999');
    assert(study.studyInstanceUid === 'st-999', 'StudyLoader should return loaded Study domain entity');
    assert(study.seriesList.length === 1, 'Study should contain 1 loaded series');
    assert(study.seriesList[0].instances.length === 3, 'Loaded series should contain 3 normalized instances');
    assert(studyLoadedEmitted === true, 'StudyLoader should emit STUDY_LOADED event');
    assert(pipelineReadyEmitted === true, 'StudyLoader should emit DICOM_PIPELINE_READY event');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 3 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase3UnitTests = runPhase3UnitTests;
}
