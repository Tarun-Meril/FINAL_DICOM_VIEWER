import { API_BASE_URL } from '../../../config';
import { Logger, LogCategory } from '../../shared/Logger';
import { LifecycleService, WorkstationState } from '../services/LifecycleService';
import { MetadataManager } from './MetadataManager';
import { SeriesValidator } from './SeriesValidator';

class StudyManagerImpl {
  private currentStudyUid: string | null = null;
  private currentSeriesUid: string | null = null;
  private currentSeriesIsCT: boolean = false;
  private currentSeriesMetadata: any = null;

  isCurrentSeriesCT(): boolean {
    return this.currentSeriesIsCT;
  }

  getCurrentSeriesMetadata(): any {
    return this.currentSeriesMetadata;
  }

  /**
   * Load a study for MPR.
   *
   * @param studyUid      StudyInstanceUID to open.
   * @param preferredSeriesUid  SeriesInstanceUID the host (main viewer or the
   *        standalone page) has selected. When supplied and present in the
   *        study, it is used verbatim so MPR reconstructs exactly what the
   *        radiologist is looking at in 2D. When absent — or when the requested
   *        series is not reconstructable — the largest CT/MR series is used and
   *        the substitution is logged.
   */
  async loadStudy(studyUid: string, preferredSeriesUid?: string): Promise<any[]> {
    this.currentStudyUid = studyUid;
    LifecycleService.setState(WorkstationState.LOADING_METADATA);
    Logger.info(
      LogCategory.GENERAL,
      `[StudyManager] Loading study: ${studyUid}${preferredSeriesUid ? ` (requested series ${preferredSeriesUid})` : ''}`
    );

    try {
      const seriesRes = await fetch(`${API_BASE_URL}/api/studies/${studyUid}/series`);
      const seriesList = await seriesRes.json();

      if (!Array.isArray(seriesList) || seriesList.length === 0) {
        throw new Error('No series found for study');
      }

      // Honour the caller's series selection when it exists in this study.
      if (preferredSeriesUid) {
        const requested = seriesList.find(
          s => (s.series_instance_uid || s.seriesInstanceUid) === preferredSeriesUid
        );
        if (requested) {
          this.currentSeriesMetadata = requested;
          return this.selectSeries(preferredSeriesUid);
        }
        Logger.warn(
          LogCategory.GENERAL,
          `[StudyManager] Requested series ${preferredSeriesUid} not found in study ${studyUid}; falling back to automatic selection`
        );
      }

      // Filter or prioritize CT series if available, otherwise pick the series with most instances
      const ctSeriesList = seriesList.filter(s => SeriesValidator.isCTSeries(s));
      const targetPool = ctSeriesList.length > 0 ? ctSeriesList : seriesList;

      const sortedSeries = [...targetPool].sort((a, b) => {
        const countA = a.number_of_series_related_instances || a.num_instances || a.instancesCount || a.numberOfInstances || 0;
        const countB = b.number_of_series_related_instances || b.num_instances || b.instancesCount || b.numberOfInstances || 0;
        return countB - countA;
      });
      
      const mainSeries = sortedSeries[0];
      this.currentSeriesMetadata = mainSeries;
      const seriesUid = mainSeries.series_instance_uid || mainSeries.seriesInstanceUid;
      return this.selectSeries(seriesUid);
    } catch (e) {
      Logger.error(LogCategory.NETWORK, `[StudyManager] Failed to load study`, e);
      throw e;
    }
  }

  async selectSeries(seriesUid: string): Promise<any[]> {
    this.currentSeriesUid = seriesUid;
    Logger.info(LogCategory.GENERAL, `[StudyManager] Selecting series: ${seriesUid}`);

    try {
      const instRes = await fetch(`${API_BASE_URL}/api/series/${seriesUid}/instances`);
      const instances = await instRes.json();
      
      if (!Array.isArray(instances) || instances.length === 0) {
         throw new Error('No instances found in series');
      }

      this.currentSeriesIsCT = SeriesValidator.isCTSeries(instances) || SeriesValidator.isCTSeries(this.currentSeriesMetadata);

      if (this.currentSeriesIsCT) {
        Logger.info(LogCategory.GENERAL, `[StudyManager] Series ${seriesUid} identified as CT. Validating physical geometry.`);
        const validation = SeriesValidator.validateCTSeriesGeometry(instances);
        if (!validation.isValid) {
          Logger.error(LogCategory.GENERAL, `[StudyManager] CT physical geometry validation failed: ${validation.errors.join('; ')}`);
          throw new Error(`CT geometry validation failed: ${validation.errors.join('; ')}`);
        }
        if (validation.warnings.length > 0) {
          Logger.warn(LogCategory.GENERAL, `[StudyManager] CT physical geometry warnings: ${validation.warnings.join('; ')}`);
        }
      }

      return instances;
    } catch (e) {
      Logger.error(LogCategory.NETWORK, `[StudyManager] Failed to load series`, e);
      throw e;
    }
  }

  closeStudy() {
    this.currentStudyUid = null;
    this.currentSeriesUid = null;
    MetadataManager.clear();
    LifecycleService.setState(WorkstationState.IDLE);
    Logger.info(LogCategory.GENERAL, `[StudyManager] Closed study`);
  }
}

export const StudyManager = new StudyManagerImpl();
