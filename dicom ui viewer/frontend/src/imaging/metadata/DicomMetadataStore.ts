/**
 * Centralized DicomMetadataStore Registry & Modules Normalizer
 */

import { IDicomMetadataStore, IEngineContext } from '../types/contracts';
import { Instance } from '../domain/entities/DicomEntities';

export class DicomMetadataStore implements IDicomMetadataStore {
  private engineContext: IEngineContext;
  private instanceMap: Map<string, Instance> = new Map();
  private imageIdMap: Map<string, Instance> = new Map();
  private seriesMap: Map<string, Instance[]> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addInstance(rawOrEntity: Instance | any): void {
    const instance = rawOrEntity instanceof Instance ? rawOrEntity : new Instance(rawOrEntity);

    this.instanceMap.set(instance.sopInstanceUid, instance);

    if (instance.imageId) {
      this.imageIdMap.set(instance.imageId, instance);
    }

    if (!this.seriesMap.has(instance.seriesInstanceUid)) {
      this.seriesMap.set(instance.seriesInstanceUid, []);
    }
    this.seriesMap.get(instance.seriesInstanceUid)!.push(instance);
  }

  public addInstances(instances: any[]): void {
    const start = performance.now();
    instances.forEach((inst) => this.addInstance(inst));
    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordMetadataParseTime(duration);
    this.engineContext.logger.debug('Metadata', `Indexed ${instances.length} instances into DicomMetadataStore in ${Math.round(duration)}ms`);
  }

  public getInstance(sopUid: string): Instance | undefined {
    return this.instanceMap.get(sopUid);
  }

  public getInstanceByImageId(imageId: string): Instance | undefined {
    if (!imageId) return undefined;
    let inst = this.imageIdMap.get(imageId);
    if (!inst) {
      const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
      inst = this.imageIdMap.get(stripped);
    }
    if (!inst) {
      inst = this.imageIdMap.get(`cornerstoneStreamingImageVolume:${imageId}`);
    }
    return inst;
  }

  public getSeriesInstances(seriesUid: string): Instance[] {
    return this.seriesMap.get(seriesUid) || [];
  }

  public clear(): void {
    this.instanceMap.clear();
    this.imageIdMap.clear();
    this.seriesMap.clear();
    this.engineContext.logger.debug('Metadata', 'DicomMetadataStore purged');
  }

  /**
   * Module Provider Lookup for Cornerstone Metadata Registry
   */
  public getModule(type: string, imageId: string): any {
    const instance = this.getInstanceByImageId(imageId);
    if (!instance) return undefined;

    if (type === 'imagePlaneModule') {
      return {
        imageOrientationPatient: instance.orientation.toArray(),
        imagePositionPatient: instance.imagePositionPatient,
        rowCosines: instance.orientation.rowCosines,
        columnCosines: instance.orientation.columnCosines,
        pixelSpacing: instance.pixelSpacing.toArray(),
        columnPixelSpacing: instance.pixelSpacing.columnSpacing,
        rowPixelSpacing: instance.pixelSpacing.rowSpacing,
        frameOfReferenceUID: instance.frameOfReferenceUid,
        columns: instance.columns,
        rows: instance.rows,
        sliceThickness: instance.sliceThickness,
      };
    }

    if (type === 'imagePixelModule') {
      return {
        pixelRepresentation: instance.pixelRepresentation,
        bitsAllocated: instance.bitsAllocated,
        bitsStored: instance.bitsStored,
        highBit: instance.highBit,
        samplesPerPixel: instance.samplesPerPixel,
        photometricInterpretation: instance.photometricInterpretation,
        rows: instance.rows,
        columns: instance.columns,
      };
    }

    if (type === 'modalityLUTModule') {
      return {
        rescaleIntercept: instance.rescaleIntercept,
        rescaleSlope: instance.rescaleSlope,
      };
    }

    if (type === 'voiLutModule') {
      return {
        windowCenter: [instance.windowCenter],
        windowWidth: [instance.windowWidth],
      };
    }

    if (type === 'generalSeriesModule') {
      return {
        modality: 'CT',
        seriesInstanceUID: instance.seriesInstanceUid,
      };
    }

    if (type === 'generalStudyModule') {
      return {
        studyInstanceUID: instance.studyInstanceUid,
      };
    }

    return undefined;
  }
}
