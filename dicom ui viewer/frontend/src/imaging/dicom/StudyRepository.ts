/**
 * In-Memory StudyRepository for Domain Entity Caching
 */

import { IEngineContext, IStudyRepository } from '../types/contracts';
import { Study } from '../domain/entities/DicomEntities';

export class StudyRepository implements IStudyRepository {
  private engineContext: IEngineContext;
  private studyMap: Map<string, Study> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addStudy(study: Study): void {
    if (!study || !study.studyInstanceUid) return;
    this.studyMap.set(study.studyInstanceUid, study);
    this.engineContext.logger.debug('Metadata', `Study ${study.studyInstanceUid} cached in StudyRepository`);
  }

  public getStudy(studyUid: string): Study | undefined {
    return this.studyMap.get(studyUid);
  }

  public getAllStudies(): Study[] {
    return Array.from(this.studyMap.values());
  }

  public removeStudy(studyUid: string): void {
    this.studyMap.delete(studyUid);
    this.engineContext.logger.debug('Metadata', `Study ${studyUid} removed from StudyRepository`);
  }

  public clear(): void {
    this.studyMap.clear();
    this.engineContext.logger.debug('Metadata', 'StudyRepository cleared');
  }
}
