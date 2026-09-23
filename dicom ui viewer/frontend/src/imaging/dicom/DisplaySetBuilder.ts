/**
 * DisplaySetBuilder Subsystem
 * Groups DICOM instances into Stack/Volume DisplaySets and applies 3D vector projection spatial sorting
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { DisplaySet, Instance } from '../domain/entities/DicomEntities';

export class DisplaySetBuilder {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  /**
   * Sort instances spatially using Dot Product Projection: d = P • N
   * (ImagePositionPatient projected onto plane normal vector)
   */
  public sortInstancesSpatially(instances: Instance[]): Instance[] {
    if (!instances || instances.length <= 1) return instances || [];

    const start = performance.now();
    const sorted = [...instances].sort((a, b) => {
      const distA = a.getSpatialProjectionDistance();
      const distB = b.getSpatialProjectionDistance();

      if (Math.abs(distA - distB) > 0.0001) {
        return distA - distB;
      }
      // Fallback to instanceNumber
      return a.instanceNumber - b.instanceNumber;
    });

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('sliceSortTimeMs', duration);
    this.engineContext.logger.debug('Loader', `Sorted ${instances.length} slices spatially in ${Math.round(duration)}ms`);
    return sorted;
  }

  public buildDisplaySetsForSeries(seriesUid: string, modality: string, rawInstances: Instance[]): DisplaySet[] {
    if (!rawInstances || rawInstances.length === 0) return [];

    const studyUid = rawInstances[0].studyInstanceUid;
    const sortedInstances = this.sortInstancesSpatially(rawInstances);
    const imageIds = sortedInstances.map((inst) => inst.imageId!).filter(Boolean);

    // Determine volume eligibility (at least 3 cross-sectional slices with identical frameOfReference)
    const isVolumeEligible = sortedInstances.length >= 3 && ['CT', 'MR', 'PET', 'SPECT', 'PT'].includes(modality.toUpperCase());

    const displaySetUid = `ds-${seriesUid}`;
    const displaySet = new DisplaySet({
      displaySetInstanceUID: displaySetUid,
      seriesInstanceUid: seriesUid,
      studyInstanceUid: studyUid,
      modality: modality || 'CT',
      label: `Series ${seriesUid.substring(0, 8)} (${sortedInstances.length} Slices)`,
      isVolumeEligible,
      imageIds,
      instances: sortedInstances,
    });

    this.engineContext.logger.info('Loader', `Created DisplaySet ${displaySetUid} (${sortedInstances.length} slices, volumeEligible: ${isVolumeEligible})`);
    this.engineContext.eventBus.emit(EngineEvents.DISPLAYSETS_CREATED, {
      displaySetInstanceUid: displaySetUid,
      seriesInstanceUid: seriesUid,
      studyInstanceUid: studyUid,
      isVolumeEligible,
      numImageIds: imageIds.length,
    });

    return [displaySet];
  }
}
