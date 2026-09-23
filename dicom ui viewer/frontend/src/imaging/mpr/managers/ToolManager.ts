import { ToolGroupManager } from '@cornerstonejs/tools';
import { Logger, LogCategory } from '../../shared/Logger';
import { RenderingManager } from './RenderingManager';
import { LayoutManager } from './LayoutManager';

class ToolManagerImpl {
  private readonly MPR_TOOLGROUP_ID = 'mpr-tool-group';
  private readonly VR_TOOLGROUP_ID = 'mpr-vr-tool-group';

  initialize() {
    this.setupMPRTools();
    this.setupVRTools();
    Logger.info(LogCategory.TOOL, `[ToolManager] Initialized tools`);
  }

  private setupMPRTools() {
    let toolGroup = ToolGroupManager.getToolGroup(this.MPR_TOOLGROUP_ID);
    if (!toolGroup) {
      toolGroup = ToolGroupManager.createToolGroup(this.MPR_TOOLGROUP_ID);
      if (toolGroup) {
        toolGroup.addTool('WindowLevel');
        toolGroup.addTool('Pan');
        toolGroup.addTool('Zoom');
        toolGroup.addTool('Crosshairs', {
          getReferenceLineColor: (viewportId: string) => 'rgba(0, 255, 0, 1)',
          getReferenceLineControllable: (viewportId: string) => true,
          getReferenceLineDraggableRotatable: (viewportId: string) => true,
          getReferenceLineThickness: (viewportId: string) => 1,
        });
        toolGroup.addTool('StackScroll');
        
        // Add measurement and annotation tools
        toolGroup.addTool('Length');
        toolGroup.addTool('Bidirectional');
        toolGroup.addTool('Angle');
        toolGroup.addTool('CobbAngle');
        toolGroup.addTool('Probe');
        toolGroup.addTool('ArrowAnnotate');
        toolGroup.addTool('EllipticalROI');
        toolGroup.addTool('RectangleROI');
        toolGroup.addTool('PlanarFreehandROI');
      }
    }
    
    if (toolGroup) {
      const re = RenderingManager.getEngine();
      if (re) {
        toolGroup.addViewport(LayoutManager.AXIAL_ID, re.id);
        toolGroup.addViewport(LayoutManager.CORONAL_ID, re.id);
        toolGroup.addViewport(LayoutManager.SAGITTAL_ID, re.id);
      }
    }
  }

  private setupVRTools() {
    let toolGroup = ToolGroupManager.getToolGroup(this.VR_TOOLGROUP_ID);
    if (!toolGroup) {
      toolGroup = ToolGroupManager.createToolGroup(this.VR_TOOLGROUP_ID);
      if (toolGroup) {
        toolGroup.addTool('TrackballRotate');
        toolGroup.addTool('Pan');
        toolGroup.addTool('Zoom');
      }
    }

    if (toolGroup) {
      const re = RenderingManager.getEngine();
      if (re) {
        toolGroup.addViewport(LayoutManager.VR_ID, re.id);
      }
    }
  }

  getMPRToolGroup() {
    return ToolGroupManager.getToolGroup(this.MPR_TOOLGROUP_ID);
  }

  getVRToolGroup() {
    return ToolGroupManager.getToolGroup(this.VR_TOOLGROUP_ID);
  }

  destroy() {
    ToolGroupManager.destroyToolGroup(this.MPR_TOOLGROUP_ID);
    ToolGroupManager.destroyToolGroup(this.VR_TOOLGROUP_ID);
    Logger.info(LogCategory.TOOL, `[ToolManager] Destroyed tool groups`);
  }
}

export const ToolManager = new ToolManagerImpl();
