/**
 * ViewportRegistry Registry Tracker
 * Tracks viewport controllers, container IDs, and active viewport states
 */

import { IStackViewportController, IViewportRegistry } from '../types/contracts';

export class ViewportRegistry implements IViewportRegistry {
  private controllerMap: Map<string, IStackViewportController> = new Map();
  private containerMap: Map<string, string> = new Map();

  public register(viewportId: string, controller: IStackViewportController, containerId: string): void {
    if (!viewportId || !controller) return;
    this.controllerMap.set(viewportId, controller);
    this.containerMap.set(viewportId, containerId);
  }

  public unregister(viewportId: string): void {
    this.controllerMap.delete(viewportId);
    this.containerMap.delete(viewportId);
  }

  public getController(viewportId: string): IStackViewportController | undefined {
    return this.controllerMap.get(viewportId);
  }

  public getAllControllers(): IStackViewportController[] {
    return Array.from(this.controllerMap.values());
  }

  public getContainerId(viewportId: string): string | undefined {
    return this.containerMap.get(viewportId);
  }

  public clear(): void {
    this.controllerMap.clear();
    this.containerMap.clear();
  }
}
