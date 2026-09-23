import type { MPRStateManager, MPRState, MPRTool } from '../core/state/MPRStateManager';
import { MPR_PLANES, PLANE_LABELS, type MPRPlane } from '../core/state/planes';
import type { VolumeDescriptor } from '../core/volume/VolumeBuilder';
import { presetsForModality } from '../core/wl/WindowLevelManager';

interface Props {
  stateManager: MPRStateManager;
  state: MPRState;
  volume: VolumeDescriptor | null;
  focusedPlane: MPRPlane;
  onResetView: () => void;
  onResetAll: () => void;
  onFit: () => void;
  onActualSize: () => void;
  /** Omitted in embedded mode: the host viewer owns study selection there. */
  onOpenStudy?: () => void;
  /** Rendered as "Back to 2D" when the host supplies it. */
  onClose?: () => void;
}

const TOOL_BUTTONS: Array<{ tool: MPRTool; label: string; title: string }> = [
  { tool: 'crosshair', label: 'Crosshair', title: 'Set the shared reference point (left drag)' },
  { tool: 'windowLevel', label: 'W/L', title: 'Window / level (also right mouse button)' },
  { tool: 'zoom', label: 'Zoom', title: 'Zoom' },
  { tool: 'pan', label: 'Pan', title: 'Pan (also middle mouse button)' },
  { tool: 'length', label: 'Length', title: 'Distance measurement in millimetres' },
  { tool: 'angle', label: 'Angle', title: 'Angle measurement' },
  { tool: 'ellipseRoi', label: 'ROI', title: 'Elliptical region of interest' },
  { tool: 'probe', label: 'Probe', title: 'Voxel value readout' },
];

const SLAB_OPTIONS = [0, 1, 2, 3, 5, 10, 20];

export function MPRToolbar({
  stateManager,
  state,
  volume,
  focusedPlane,
  onResetView,
  onResetAll,
  onFit,
  onActualSize,
  onOpenStudy,
  onClose,
}: Props) {
  const presets = volume ? presetsForModality(volume.modality, volume.units) : [];

  return (
    <div className="toolbar">
      <div className="brand">
        MerilView PRO <small>MPR</small>
      </div>

      {onOpenStudy && (
        <div className="group">
          <button onClick={onOpenStudy} title="Load a DICOM series">
            Open Study
          </button>
        </div>
      )}

      {onClose && (
        <div className="group">
          <button onClick={onClose} title="Return to the 2D viewer">
            ← Back to 2D
          </button>
        </div>
      )}

      <div className="group" title="Viewport layout">
        {MPR_PLANES.map((p) => (
          <button
            key={p}
            className={state.maximisedPlane === p ? 'active' : ''}
            onClick={() => stateManager.maximise(state.maximisedPlane === p ? null : p)}
            title={`Show ${PLANE_LABELS[p]} full screen (double-click a viewport does the same)`}
          >
            {PLANE_LABELS[p][0] + PLANE_LABELS[p].slice(1).toLowerCase()}
          </button>
        ))}
        <select
          value={state.layout}
          onChange={(e) =>
            stateManager.setLayout(e.target.value as MPRState['layout'], null)
          }
          title="Panel arrangement"
        >
          <option value="primaryAxial">Axial over Cor / Sag</option>
          <option value="threeUp">Three across</option>
          <option value="grid">2 × 2</option>
        </select>
      </div>

      <div className="group toggles-group">
        <button
          className={`toggle-btn ${state.linkViews ? 'active' : ''}`}
          onClick={() => stateManager.toggle('linkViews')}
          title="Link slice position and crosshair across the three viewports"
        >
          <span className="toggle-indicator" /> Link Views
        </button>
        <button
          className={`toggle-btn ${state.crosshairEnabled ? 'active' : ''}`}
          onClick={() => stateManager.toggle('crosshairEnabled')}
          title="Show or hide the crosshair marker"
        >
          <span className="toggle-indicator" /> Show Crosshair
        </button>
        <button
          className={`toggle-btn ${state.referenceLinesEnabled ? 'active' : ''}`}
          onClick={() => stateManager.toggle('referenceLinesEnabled')}
        >
          <span className="toggle-indicator" /> Reference Lines
        </button>
      </div>

      <div className="group tool-group">
        {TOOL_BUTTONS.map((b) => (
          <button
            key={b.tool}
            title={`${b.title} (Click again to switch back to Crosshair)`}
            className={`tool-btn ${state.activeTool === b.tool ? 'active' : ''}`}
            onClick={() =>
              stateManager.setActiveTool(state.activeTool === b.tool ? 'crosshair' : b.tool)
            }
          >
            {b.label}
          </button>
        ))}
      </div>

      {presets.length > 0 && (
        <div className="group">
          <select
            title="CT window preset — changes display only, never the pixel data"
            defaultValue=""
            onChange={(e) => {
              const preset = presets.find((p) => p.id === e.target.value);
              if (preset) {
                stateManager.setWindowLevel(focusedPlane, {
                  center: preset.center,
                  width: preset.width,
                });
              }
            }}
          >
            <option value="" disabled>
              Window preset
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.center} / {p.width})
              </option>
            ))}
          </select>
          <button
            className={`toggle-btn ${state.syncWindowLevel ? 'active' : ''}`}
            onClick={() => stateManager.toggle('syncWindowLevel')}
            title="Apply window/level to all three viewports"
          >
            <span className="toggle-indicator" /> Sync W/L
          </button>
        </div>
      )}

      <div className="group" title="Slab reformatting — display only">
        <span className="dim">Thickness</span>
        <select
          value={state[focusedPlane].slabThicknessMm}
          onChange={(e) =>
            stateManager.setSlab(focusedPlane, Number(e.target.value))
          }
        >
          {SLAB_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v === 0 ? 'Thin' : `${v} mm`}
            </option>
          ))}
        </select>
        <select
          value={state[focusedPlane].slabMode}
          onChange={(e) =>
            stateManager.setSlab(
              focusedPlane,
              state[focusedPlane].slabThicknessMm,
              e.target.value as MPRState['axial']['slabMode'],
            )
          }
          title="Slab projection mode (2D reformat, not volume rendering)"
        >
          <option value="none">Normal</option>
          <option value="average">Average</option>
          <option value="mip">MIP</option>
          <option value="minip">MinIP</option>
        </select>
      </div>

      <div className="group">
        <select
          value={state.interpolation}
          onChange={(e) =>
            stateManager.set('interpolation', e.target.value as MPRState['interpolation'])
          }
          title="Reformat interpolation"
        >
          <option value="linear">Linear</option>
          <option value="nearest">Nearest</option>
        </select>
      </div>

      <div className="group">
        <button onClick={onFit} title="Fit the volume to the viewport">
          Fit
        </button>
        <button onClick={onActualSize} title="1:1 display scale">
          Actual Size
        </button>
        <button onClick={onResetView}>Reset View</button>
        <button onClick={onResetAll}>Reset All</button>
        <button
          onClick={() => stateManager.restorePreviousReferencePoint()}
          title="Return to the previous reference point"
          disabled={!state.previousReferencePoint}
        >
          Previous Position
        </button>
      </div>

      <div className="spacer" />

      <div className="group">
        <button
          className={`toggle-btn ${state.debugPanelVisible ? 'active' : ''}`}
          onClick={() => stateManager.toggle('debugPanelVisible')}
          title="Developer geometry diagnostics — hidden in clinical mode"
        >
          <span className="toggle-indicator" /> Diagnostics
        </button>
      </div>

      <div className="active-tool">
        {PLANE_LABELS[focusedPlane]} · {labelForTool(state.activeTool)}
      </div>
    </div>
  );
}

function labelForTool(tool: MPRTool): string {
  const found = TOOL_BUTTONS.find((b) => b.tool === tool);
  return found ? found.label.toUpperCase() : tool.toUpperCase();
}
