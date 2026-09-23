/**
 * TemplateManager Subsystem
 * Radiology structured report templates (Chest CT, Brain MRI, Abdomen CT)
 */

export class TemplateManager {
  private templates: Map<string, string> = new Map();

  constructor() {
    this.templates.set('CHEST_CT', 'Chest CT Template: Lungs, Mediastinum, Pleura, Bones.');
    this.templates.set('BRAIN_MRI', 'Brain MRI Template: Parenchyma, Ventricles, Extra-axial spaces.');
  }

  public getTemplate(name: string): string | undefined {
    return this.templates.get(name);
  }
}
