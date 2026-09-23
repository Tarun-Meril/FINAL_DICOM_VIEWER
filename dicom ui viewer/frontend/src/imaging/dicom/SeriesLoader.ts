/**
 * SeriesLoader Subsystem
 * Loads series hierarchies, instantiates Series domain entities, and invokes DisplaySetBuilder
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { Series } from '../domain/entities/DicomEntities';
import { InstanceLoader } from './InstanceLoader';
import { DisplaySetBuilder } from './DisplaySetBuilder';

export class SeriesLoader {
  private engineContext: IEngineContext;
  private instanceLoader: InstanceLoader;
  private displaySetBuilder: DisplaySetBuilder;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.instanceLoader = new InstanceLoader(context);
    this.displaySetBuilder = new DisplaySetBuilder(context);
  }

  public async loadSeries(studyUid: string, rawSeriesData: any): Promise<Series> {
    const seriesUid = rawSeriesData.series_instance_uid || rawSeriesData.seriesInstanceUid || rawSeriesData.SeriesInstanceUID;
    const seriesNum = rawSeriesData.series_number ?? rawSeriesData.seriesNumber ?? rawSeriesData.SeriesNumber ?? 1;
    const modality = rawSeriesData.modality || rawSeriesData.Modality || 'CT';
    const description = rawSeriesData.series_description || rawSeriesData.seriesDescription || rawSeriesData.SeriesDescription || 'DICOM Series';

    this.engineContext.eventBus.emit(EngineEvents.SERIES_LOADING, { seriesInstanceUid: seriesUid, studyInstanceUid: studyUid });
    const start = performance.now();

    try {
      const series = new Series({
        seriesInstanceUid: seriesUid,
        studyInstanceUid: studyUid,
        seriesNumber: seriesNum,
        modality,
        seriesDescription: description,
      });

      const instances = await this.instanceLoader.loadSeriesInstances(studyUid, seriesUid);
      instances.forEach((inst) => series.addInstance(inst));

      const displaySets = this.displaySetBuilder.buildDisplaySetsForSeries(seriesUid, modality, instances);
      series.displaySets = displaySets;

      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordInitMetric('seriesLoadTimeMs', duration);
      this.engineContext.logger.info('Loader', `Loaded series ${seriesUid} (${instances.length} slices) in ${Math.round(duration)}ms`);
      
      this.engineContext.eventBus.emit(EngineEvents.SERIES_LOADED, {
        seriesInstanceUid: seriesUid,
        studyInstanceUid: studyUid,
        modality,
        seriesNumber: seriesNum,
        seriesDescription: description,
        numberOfInstances: instances.length,
      });

      return series;
    } catch (err: any) {
      this.engineContext.logger.error('Loader', `Failed loading series ${seriesUid}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'SeriesLoader',
        message: err.message || 'Series load failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }
}
