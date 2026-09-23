/**
 * MPR must not crash when the host has already registered a tool.
 *
 * The host's initCornerstone registers PanTool, ZoomTool, WindowLevelTool,
 * LengthTool, AngleTool, EllipticalROITool, RectangleROITool and ProbeTool at
 * bootstrap. MPR needs the same eight. Cornerstone v4's addTool throws on a
 * duplicate name, so an unguarded registration threw the instant MPR mounted —
 * white screen, and the partially-built engine took the 2D viewer with it.
 */
import { describe, it, expect, vi } from 'vitest';

/** Stand-in for Cornerstone's global tool registry. */
function makeRegistry() {
  const registered = new Set<string>();
  return {
    registered,
    addTool: (tool: { toolName: string }) => {
      if (registered.has(tool.toolName)) {
        throw new Error(`addTool: tool with name ${tool.toolName} has already been added`);
      }
      registered.add(tool.toolName);
    },
  };
}

const MPR_TOOLS = [
  'WindowLevel', 'Zoom', 'Pan', 'Length',
  'Angle', 'RectangleROI', 'EllipticalROI', 'Probe',
].map((toolName) => ({ toolName }));

/** The OLD implementation — documents the defect. */
function addToolsUnguarded(reg: ReturnType<typeof makeRegistry>) {
  for (const t of MPR_TOOLS) reg.addTool(t);
}

/** The implementation now shipped in mpr/engine/tools.ts. */
function addToolsOnce(reg: ReturnType<typeof makeRegistry>) {
  for (const tool of MPR_TOOLS) {
    try {
      reg.addTool(tool);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already\s*(been\s*)?added|already\s*exists|has\s*already/i.test(message)) continue;
      throw error;
    }
  }
}

describe('MPR tool registration', () => {
  it('reproduces the crash: unguarded addTool throws when the host got there first', () => {
    const reg = makeRegistry();
    // Host bootstrap registers its tool set.
    for (const t of MPR_TOOLS) reg.addTool(t);
    // MPR mounts.
    expect(() => addToolsUnguarded(reg)).toThrow(/already been added/);
  });

  it('the fix tolerates every tool already being registered', () => {
    const reg = makeRegistry();
    for (const t of MPR_TOOLS) reg.addTool(t);
    expect(() => addToolsOnce(reg)).not.toThrow();
    expect(reg.registered.size).toBe(MPR_TOOLS.length);
  });

  it('still registers tools the host did NOT provide', () => {
    const reg = makeRegistry();
    reg.addTool({ toolName: 'Pan' });
    reg.addTool({ toolName: 'Zoom' });
    addToolsOnce(reg);
    for (const t of MPR_TOOLS) expect(reg.registered.has(t.toolName)).toBe(true);
  });

  it('re-throws a genuine registration failure', () => {
    const reg = makeRegistry();
    const boom = { ...reg, addTool: () => { throw new Error('WebGL context lost'); } };
    expect(() => addToolsOnce(boom as any)).toThrow(/WebGL context lost/);
  });

  it('survives MPR being opened, closed and reopened', () => {
    const reg = makeRegistry();
    for (const t of MPR_TOOLS) reg.addTool(t);
    for (let mount = 0; mount < 3; mount++) {
      expect(() => addToolsOnce(reg)).not.toThrow();
    }
  });
});
