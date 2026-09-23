/**
 * Tool bindings — radiology workstation mouse conventions.
 *
 * Defaults:
 *   wheel        scroll slices (always available, never stolen by a tool)
 *   left         the active tool
 *   middle       pan
 *   right        window / level
 *
 * The crosshair itself is NOT a Cornerstone tool here: it is driven by the
 * application's own world-space reference point so that synchronisation can
 * never fall back to slice indices. Everything else (measurements, W/L, pan,
 * zoom) uses Cornerstone's tools, which already work in world coordinates.
 *
 * Measurement safety: while a measurement tool is active the left button is
 * bound exclusively to it, so a drag can never be misread as a window/level
 * change mid-measurement.
 */

import {
  AngleTool,
  EllipticalROITool,
  LengthTool,
  PanTool,
  ProbeTool,
  RectangleROITool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  Enums as ToolEnums,
  addTool,
} from '@cornerstonejs/tools';
import type { MPRTool } from '../core/state/MPRStateManager';

const { MouseBindings } = ToolEnums;

export const TOOL_GROUP_ID = 'MPR_TOOL_GROUP';

const TOOL_NAME_BY_MODE: Partial<Record<MPRTool, string>> = {
  windowLevel: WindowLevelTool.toolName,
  zoom: ZoomTool.toolName,
  pan: PanTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  rectangleRoi: RectangleROITool.toolName,
  ellipseRoi: EllipticalROITool.toolName,
  probe: ProbeTool.toolName,
};

const ALL_TOOL_NAMES = [
  WindowLevelTool.toolName,
  ZoomTool.toolName,
  PanTool.toolName,
  LengthTool.toolName,
  AngleTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  ProbeTool.toolName,
];

let toolsAdded = false;

function addToolsOnce(): void {
  if (toolsAdded) return;
  addTool(WindowLevelTool);
  addTool(ZoomTool);
  addTool(PanTool);
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(RectangleROITool);
  addTool(EllipticalROITool);
  addTool(ProbeTool);
  toolsAdded = true;
}

export function createToolGroup(viewportIds: string[], renderingEngineId: string) {
  addToolsOnce();
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
  const group = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
  if (!group) throw new Error('Unable to create the MPR tool group');

  for (const name of ALL_TOOL_NAMES) group.addTool(name);

  for (const viewportId of viewportIds) {
    group.addViewport(viewportId, renderingEngineId);
  }

  // Persistent bindings that do not change with the active tool.
  group.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  group.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  return group;
}

/**
 * Bind the left mouse button to the requested tool.
 * 'crosshair' and 'stackScroll' are handled by the application layer, so the
 * left button is released by every Cornerstone tool in those modes.
 */
export function setActiveTool(tool: MPRTool): void {
  const group = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!group) return;

  const targetName = TOOL_NAME_BY_MODE[tool];

  for (const name of ALL_TOOL_NAMES) {
    if (name === targetName) continue;
    // Keep the persistent middle/right bindings intact.
    if (name === PanTool.toolName) {
      group.setToolActive(PanTool.toolName, {
        bindings: [{ mouseButton: MouseBindings.Auxiliary }],
      });
      continue;
    }
    if (name === WindowLevelTool.toolName) {
      group.setToolActive(WindowLevelTool.toolName, {
        bindings: [{ mouseButton: MouseBindings.Secondary }],
      });
      continue;
    }
    group.setToolPassive(name);
  }

  if (targetName) {
    const bindings: Array<{ mouseButton: number }> = [
      { mouseButton: MouseBindings.Primary },
    ];
    if (targetName === PanTool.toolName) {
      bindings.push({ mouseButton: MouseBindings.Auxiliary });
    }
    if (targetName === WindowLevelTool.toolName) {
      bindings.push({ mouseButton: MouseBindings.Secondary });
    }
    group.setToolActive(targetName, { bindings });
  }
}

/** True when the left button belongs to a measurement tool. */
export function isMeasurementTool(tool: MPRTool): boolean {
  return (
    tool === 'length' ||
    tool === 'angle' ||
    tool === 'rectangleRoi' ||
    tool === 'ellipseRoi' ||
    tool === 'probe'
  );
}

export function destroyToolGroup(): void {
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
}
