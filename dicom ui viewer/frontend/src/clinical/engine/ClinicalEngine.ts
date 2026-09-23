import { StudyContext, StudyInfo } from './StudyContext';
import { ClinicalSession } from './StudyContext';

export class ClinicalEngine {
  public context = new StudyContext();
  public session = new ClinicalSession();
  public isInitialized = false;

  public async initialize(): Promise<boolean> {
    this.isInitialized = true;
    return true;
  }

  public openStudy(study: StudyInfo): void {
    this.context.loadStudy(study);
  }

  public closeStudy(): void {
    this.context.clear();
  }
}
