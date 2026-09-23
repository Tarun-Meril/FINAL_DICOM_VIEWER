export interface ViewportState {
  id: string;
  seriesUid?: string;
  zoom: number;
  pan: { x: number; y: number };
  windowCenter: number;
  windowWidth: number;
  sliceIndex: number;
  orientation: string;
}

export class ViewportCoordinator {
  private viewports = new Map<string, ViewportState>();

  public registerViewport(vp: ViewportState): void {
    this.viewports.set(vp.id, vp);
  }

  public getViewport(id: string): ViewportState | undefined {
    return this.viewports.get(id);
  }
}

export class LayoutCoordinator {
  public supportedLayouts = ['1x1', '1x2', '2x2', '3D+MPR', 'Quad-Cut'];
}

export class SyncCoordinator {
  public syncZoomPan(sourceVp: ViewportState, targetVp: ViewportState): void {
    targetVp.zoom = sourceVp.zoom;
    targetVp.pan = { ...sourceVp.pan };
  }

  public syncWindowLevel(sourceVp: ViewportState, targetVp: ViewportState): void {
    targetVp.windowCenter = sourceVp.windowCenter;
    targetVp.windowWidth = sourceVp.windowWidth;
  }
}
