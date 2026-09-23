export abstract class SharedTool {
  public id: string;
  public name: string;
  public active = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  public activate(): void { this.active = true; }
  public deactivate(): void { this.active = false; }
  abstract onMouseDown(e: MouseEvent): void;
  abstract onMouseMove(e: MouseEvent): void;
  abstract onMouseUp(e: MouseEvent): void;
}

export class SelectionTool extends SharedTool {
  constructor() { super('select', 'Selection'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class CrosshairTool extends SharedTool {
  constructor() { super('crosshair', '3D Crosshair'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class LengthTool extends SharedTool {
  constructor() { super('length', 'Linear Distance'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class AngleTool extends SharedTool {
  constructor() { super('angle', '3-Point Angle'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class ROIBoxTool extends SharedTool {
  constructor() { super('rect', 'Rectangular ROI'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class EllipseTool extends SharedTool {
  constructor() { super('ellipse', 'Elliptical ROI'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class PolygonTool extends SharedTool {
  constructor() { super('polygon', 'Polygon ROI'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class FreehandTool extends SharedTool {
  constructor() { super('freehand', 'Freehand ROI'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class SplineTool extends SharedTool {
  constructor() { super('spline', 'Catmull-Rom Spline'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class BrushTool extends SharedTool {
  constructor() { super('brush', 'Segmentation Brush'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class MagicWandTool extends SharedTool {
  constructor() { super('magicwand', 'Magic Wand Region Growing'); }
  onMouseDown(e: MouseEvent): void {}
  onMouseMove(e: MouseEvent): void {}
  onMouseUp(e: MouseEvent): void {}
}

export class ToolManager {
  private tools = new Map<string, SharedTool>();
  public activeToolId = 'select';

  constructor() {
    this.registerTool(new SelectionTool());
    this.registerTool(new CrosshairTool());
    this.registerTool(new LengthTool());
    this.registerTool(new AngleTool());
    this.registerTool(new ROIBoxTool());
    this.registerTool(new EllipseTool());
    this.registerTool(new PolygonTool());
    this.registerTool(new FreehandTool());
    this.registerTool(new SplineTool());
    this.registerTool(new BrushTool());
    this.registerTool(new MagicWandTool());
  }

  public registerTool(tool: SharedTool): void {
    this.tools.set(tool.id, tool);
  }

  public activateTool(id: string): void {
    if (this.tools.has(id)) {
      this.tools.get(this.activeToolId)?.deactivate();
      this.activeToolId = id;
      this.tools.get(id)?.activate();
    }
  }

  public getActiveTool(): SharedTool | undefined {
    return this.tools.get(this.activeToolId);
  }
}
