import { Logger, LogCategory } from '../shared/Logger';

export interface IViewport {
  id: string;
  type: string;
  element: HTMLDivElement;
  cornerstoneViewport?: any; 
}

class ViewportRegistryImpl {
  private viewports: Map<string, IViewport> = new Map();

  register(viewport: IViewport): void {
    this.viewports.set(viewport.id, viewport);
    Logger.debug(LogCategory.GENERAL, `[ViewportRegistry] Registered viewport: ${viewport.id}`);
  }

  get(id: string): IViewport | undefined {
    return this.viewports.get(id);
  }
  
  getAll(): IViewport[] {
    return Array.from(this.viewports.values());
  }

  remove(id: string): void {
    this.viewports.delete(id);
    Logger.debug(LogCategory.GENERAL, `[ViewportRegistry] Removed viewport: ${id}`);
  }

  clear(): void {
    this.viewports.clear();
    Logger.debug(LogCategory.GENERAL, `[ViewportRegistry] Cleared all viewports`);
  }
}

export const ViewportRegistry = new ViewportRegistryImpl();
