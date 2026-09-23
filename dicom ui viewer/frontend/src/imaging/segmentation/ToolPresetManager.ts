/**
 * ToolPresetManager Subsystem
 * Clinical measurement and segmentation tool preset configurations
 */

export class ToolPresetManager {
  private activePresets: Map<string, any> = new Map();

  public setPreset(toolName: string, config: any): void {
    this.activePresets.set(toolName, config);
  }

  public getPreset(toolName: string): any {
    return this.activePresets.get(toolName);
  }
}
