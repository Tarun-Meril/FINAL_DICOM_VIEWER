/**
 * StudyLoader Subsystem Orchestrator
 * Fetches DICOM study metadata, orchestrates SeriesLoader, populates DicomMetadataStore & StudyRepository
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { Study } from '../domain/entities/DicomEntities';
import { SeriesLoader } from './SeriesLoader';

export class StudyLoader {
  private engineContext: IEngineContext;
  private seriesLoader: SeriesLoader;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.seriesLoader = new SeriesLoader(context);
  }

  public async loadStudy(studyUid: string): Promise<Study> {
    if (!studyUid) {
      throw new Error('[StudyLoader] Invalid StudyInstanceUID provided');
    }

    // Check repository cache first
    const cached = this.engineContext.studyRepository!.getStudy(studyUid);
    if (cached) {
      this.engineContext.logger.info('Loader', `Returning cached Study ${studyUid} from StudyRepository`);
      return cached;
    }

    this.engineContext.eventBus.emit(EngineEvents.STUDY_LOADING, { studyInstanceUid: studyUid });
    const start = performance.now();
    this.engineContext.logger.info('Loader', `Initiating study pipeline load for UID: ${studyUid}`);

    try {
      const rawSeriesList = await this.engineContext.wadoClient!.fetchStudyMetadata(studyUid);
      
      const study = new Study({
        studyInstanceUid: studyUid,
        modalitiesInStudy: Array.from(new Set(rawSeriesList.map((s: any) => s.modality || s.Modality || 'CT'))),
      });

      // Load all series in parallel / sequence
      for (const rawSeries of rawSeriesList) {
        const series = await this.seriesLoader.loadSeries(studyUid, rawSeries);
        study.addSeries(series);
      }

      // Cache study in repository
      this.engineContext.studyRepository!.addStudy(study);
      this.engineContext.eventBus.emit(EngineEvents.STUDY_CACHED, { studyInstanceUid: studyUid });

      // Update engine state
      const currentLoaded = this.engineContext.stateStore.getState().loadedStudies;
      if (!currentLoaded.includes(studyUid)) {
        this.engineContext.stateStore.updateState({ loadedStudies: [...currentLoaded, studyUid] });
      }

      const totalDuration = performance.now() - start;
      this.engineContext.performanceMonitor.recordInitMetric('studyLoadTimeMs', totalDuration);
      this.engineContext.logger.info('Loader', `Study DICOM pipeline complete for ${studyUid} (${study.seriesList.length} series) in ${Math.round(totalDuration)}ms`);

      this.engineContext.eventBus.emit(EngineEvents.STUDY_LOADED, {
        studyInstanceUid: studyUid,
        modalities: study.modalitiesInStudy,
        numberOfSeries: study.seriesList.length,
      });

      this.engineContext.eventBus.emit(EngineEvents.DICOM_PIPELINE_READY, { studyInstanceUid: studyUid });

      return study;
    } catch (err: any) {
      this.engineContext.logger.error('Loader', `Failed loading study ${studyUid}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'StudyLoader',
        message: err.message || 'Study DICOM pipeline loading failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }
}
