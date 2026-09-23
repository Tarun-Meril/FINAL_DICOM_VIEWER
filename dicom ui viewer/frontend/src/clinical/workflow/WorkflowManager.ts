export type ClinicalWorkflowStep =
  | 'STUDY_SELECTION'
  | 'VIEWING'
  | 'MEASUREMENT'
  | 'ANNOTATION'
  | '3D_RECONSTRUCTION'
  | 'REPORTING';

export class WorkflowState {
  public currentStep: ClinicalWorkflowStep = 'STUDY_SELECTION';
  public activeTool = 'pan';
  public activeLayout = '2x2';
  public isSyncEnabled = true;
}

export class WorkflowManager {
  public state = new WorkflowState();

  public setStep(step: ClinicalWorkflowStep): void {
    this.state.currentStep = step;
  }

  public setActiveTool(tool: string): void {
    this.state.activeTool = tool;
  }

  public setLayout(layout: string): void {
    this.state.activeLayout = layout;
  }
}
