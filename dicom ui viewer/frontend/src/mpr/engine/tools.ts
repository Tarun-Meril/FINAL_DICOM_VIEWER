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

/**
 * Register the tools MPR needs, tolerating ones the host already registered.
 *
 * `addTool` maintains a GLOBAL registry shared with the rest of the
 * application, and in Cornerstone v4 it THROWS when a tool name is already
 * present. The host's `initCornerstone.ts` registers all eight of these during
 * bootstrap, so the unguarded version below threw the moment MPR mounted:
 *
 *     Error: addTool: tool with name <X> already added
 *
 * React then unwound the whole tree — the white flash — and because the MPR
 * engine had already been half-constructed, the 2D viewer lost its state too.
 * A duplicate registration is a no-op, not an error, so each call is isolated
 * and a "already added" rejection is ignored. Anything else is re-thrown,
 * because a genuine registration failure must not be silently swallowed.
 */
function addToolsOnce(): void {
  if (toolsAdded) return;
  const tools = [
    WindowLevelTool,
    ZoomTool,
    PanTool,
    LengthTool,
    AngleTool,
    RectangleROITool,
    EllipticalROITool,
    ProbeTool,
  ];
  for (const tool of tools) {
    try {
      addTool(tool);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already\s*(been\s*)?added|already\s*exists|has\s*already/i.test(message)) {
        // Registered by the host application — reuse it.
        continue;
      }
      throw error;
    }
  }
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
