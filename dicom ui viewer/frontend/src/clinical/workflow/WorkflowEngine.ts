export type EndToEndWorkflowStage =
  | 'STUDY_OPEN'
  | 'REVIEW'
  | 'MEASUREMENT'
  | 'SEGMENTATION'
  | 'REPORTING'
  | 'COMPARISON'
  | 'APPROVAL'
  | 'EXPORT';

export class WorkflowEngine {
  public currentStage: EndToEndWorkflowStage = 'STUDY_OPEN';
  private history: EndToEndWorkflowStage[] = [];

  public transitionTo(stage: EndToEndWorkflowStage): void {
    this.history.push(this.currentStage);
    this.currentStage = stage;
  }

  public getHistory(): EndToEndWorkflowStage[] {
    return this.history;
  }
}
