import { Enums as ToolsEnums } from '@cornerstonejs/tools';
import { ToolManager } from './ToolManager';
import { Logger, LogCategory } from '../../shared/Logger';

class InteractionManagerImpl {
  bindDefaultInteractions() {
    this.bindMPRInteractions();
    this.bindVRInteractions();
    Logger.info(LogCategory.TOOL, `[InteractionManager] Bound default mouse interactions`);
  }

  private bindMPRInteractions() {
    const group = ToolManager.getMPRToolGroup();
    if (!group) return;

    // WindowLevel is set by toolbar, let Crosshairs be default primary
    group.setToolActive('Crosshairs', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
    });
    group.setToolActive('Pan', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
    });
    group.setToolActive('Zoom', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
    });
    group.setToolActive('StackScroll', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
    });
  }

  private bindVRInteractions() {
    const group = ToolManager.getVRToolGroup();
    if (!group) return;

    group.setToolActive('TrackballRotate', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
    });
    group.setToolActive('Pan', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
    });
    group.setToolActive('Zoom', {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
    });
  }

  setActiveTool(toolName: string) {
    if (!toolName) return;

    const group = ToolManager.getMPRToolGroup();
    if (!group) return;

    // Reset previous primary tool to passive
    const primaryTool = group.getActivePrimaryMouseButtonTool();
    if (primaryTool) {
      group.setToolPassive(primaryTool);
    }

    // Set new tool to primary
    try {
      group.setToolActive(toolName, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });
      Logger.info(LogCategory.TOOL, `[InteractionManager] Set active tool to ${toolName}`);
    } catch (e) {
      Logger.warn(LogCategory.TOOL, `[InteractionManager] Failed to set active tool ${toolName}`);
    }
  }
}

export const InteractionManager = new InteractionManagerImpl();
