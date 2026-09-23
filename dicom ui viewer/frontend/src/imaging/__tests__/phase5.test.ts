/**
 * Phase 5 Enterprise Volume Engine & MPR Foundation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { DisplaySet, Instance } from '../domain/entities/DicomEntities';
import { VolumeBuilder } from '../volume/VolumeBuilder';
import { VolumeRepository } from '../volume/VolumeRepository';
import { VolumeCacheManager } from '../volume/VolumeCacheManager';
import { PresetManager } from '../volume/PresetManager';
import { VolumeFactory } from '../volume/VolumeFactory';
import { OrthographicViewportController } from '../viewport/OrthographicViewportController';
import { EngineEvents } from '../types/events';

export async function runPhase5UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // Mock instances for 3D Volume Descriptor
    const inst1 = new Instance({
      sopInstanceUid: 'sop-1',
      seriesInstanceUid: 'se-volume-1',
      studyInstanceUid: 'st-volume-1',
      instanceNumber: 1,
      rows: 512,
      columns: 512,
      imagePositionPatient: [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.75, 0.75],
      sliceThickness: 1.25,
      bitsAllocated: 16,
    });
    const inst2 = new Instance({
      sopInstanceUid: 'sop-2',
      seriesInstanceUid: 'se-volume-1',
      studyInstanceUid: 'st-volume-1',
      instanceNumber: 2,
      rows: 512,
      columns: 512,
      imagePositionPatient: [0, 0, 1.25],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.75, 0.75],
      sliceThickness: 1.25,
      bitsAllocated: 16,
    });
    const inst3 = new Instance({
      sopInstanceUid: 'sop-3',
      seriesInstanceUid: 'se-volume-1',
      studyInstanceUid: 'st-volume-1',
      instanceNumber: 3,
      rows: 512,
      columns: 512,
      imagePositionPatient: [0, 0, 2.50],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.75, 0.75],
      sliceThickness: 1.25,
      bitsAllocated: 16,
    });

    const displaySet = new DisplaySet({
      displaySetInstanceUID: 'ds-vol-1',
      seriesInstanceUid: 'se-volume-1',
      studyInstanceUid: 'st-volume-1',
      modality: 'CT',
      label: 'CT Volume Series',
      isVolumeEligible: true,
      imageIds: ['wadouri:sop-1', 'wadouri:sop-2', 'wadouri:sop-3'],
      instances: [inst1, inst2, inst3],
    });

    // 1. Test VolumeBuilder & Spatial 3D Grid Metadata Calculation
    const volumeBuilder = new VolumeBuilder(context);
    const descriptor = volumeBuilder.buildVolumeDescriptor(displaySet);

    assert(descriptor.volumeId.includes('se-volume-1'), 'VolumeBuilder should generate volumeId containing seriesInstanceUid');
    assert(descriptor.dimensions[0] === 512 && descriptor.dimensions[1] === 512 && descriptor.dimensions[2] === 3, 'VolumeBuilder should calculate [512, 512, 3] voxel grid dimensions');
    assert(descriptor.voxelCount === 512 * 512 * 3, 'VolumeBuilder should compute correct total voxel count');
    assert(descriptor.sizeMB > 0, 'VolumeBuilder should calculate size in MB');

    // 2. Test VolumeRepository Storage & Retrieval
    const repo = new VolumeRepository(context);
    repo.addVolume(descriptor);
    assert(repo.getVolume(descriptor.volumeId) !== undefined, 'VolumeRepository should store and retrieve VolumeDescriptor');
    assert(repo.getAllVolumes().length === 1, 'VolumeRepository should list all active volumes');

    // 3. Test PresetManager Resolution
    const presetManager = new PresetManager();
    const bonePreset = presetManager.getPreset('CT-Bone');
    assert(bonePreset !== undefined && bonePreset.windowWidth === 2000 && bonePreset.windowLevel === 500, 'PresetManager should resolve CT-Bone preset with WW: 2000, WL: 500');

    const defaultMrPreset = presetManager.getDefaultPresetForModality('MR');
    assert(defaultMrPreset.name === 'MR-T1', 'PresetManager should return MR-T1 as default preset for MR modality');

    // 4. Test VolumeCacheManager LRU Eviction Strategy
    const cacheManager = new VolumeCacheManager(context, 2); // Set low 2MB threshold
    context.volumeRepository = repo;

    let evictedEmitted = false;
    context.eventBus.on(EngineEvents.VOLUME_EVICTED, () => { evictedEmitted = true; });

    cacheManager.trackVolumeUsage('vol-1', 1.5);
    cacheManager.trackVolumeUsage('vol-2', 1.5); // Total 3.0MB > 2.0MB threshold -> triggers eviction

    assert(evictedEmitted === true, 'VolumeCacheManager should trigger LRU eviction when memory threshold is exceeded');

    // 5. Test VolumeFactory Streaming Volume Creation
    const factory = new VolumeFactory(context);
    const streamingVol = factory.createStreamingVolume(displaySet);
    assert(streamingVol.type === 'STREAMING', 'VolumeFactory should produce STREAMING type volume descriptor');

    // 6. Test OrthographicViewportController Initialization
    const orthoController = new OrthographicViewportController('vp-ortho-axial', 'container-ortho', 'AXIAL', context);
    assert(orthoController.viewportId === 'vp-ortho-axial' && orthoController.orientation === 'AXIAL', 'OrthographicViewportController should initialize AXIAL orientation');

    orthoController.setOrientation('CORONAL');
    assert(orthoController.orientation === 'CORONAL', 'OrthographicViewportController setOrientation should update orientation to CORONAL');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 5 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase5UnitTests = runPhase5UnitTests;
}
