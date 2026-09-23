import { useAppStore } from '@vr/state/store';
import type { BlendMode } from '@3d/rendering/transferFunction';

const BLEND_LABELS: Array<[BlendMode, string, string]> = [
  ['composite', 'Volume Rendering', 'Full ray-cast compositing with shading — the primary mode.'],
  ['mip', 'MIP', 'Maximum intensity projection.'],
  ['minip', 'MinIP', 'Minimum intensity projection.'],
  ['average', 'Average', 'Mean attenuation along each ray.'],
];

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}): JSX.Element {
  return (
    <div className="row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </div>
  );
}

export function MaterialPanel(): JSX.Element {
  const s = useAppStore();
  const tf = s.transferFunction;
  const set = (patch: Partial<typeof tf>) => s.setTransferFunction({ ...tf, ...patch, builtIn: false });
  const setShading = (patch: Partial<typeof tf.shading>) => set({ shading: { ...tf.shading, ...patch } });
  const setGrad = (patch: Partial<typeof tf.gradientOpacity>) => set({ gradientOpacity: { ...tf.gradientOpacity, ...patch } });

  return (
    <>
      <div className="section">
        <h3>Projection mode</h3>
        <div className="list">
          {BLEND_LABELS.map(([id, label, desc]) => (
            <div key={id} className="list-item" data-active={s.blendMode === id}
              onClick={() => s.setBlendMode(id)} title={desc}>
              <span className="name">{label}</span>
            </div>
          ))}
        </div>
        {s.blendMode !== 'composite' && (
          <div className="note warn" style={{ marginTop: 8 }}>
            Projection modes flatten depth. They are useful for dense structures but are not
            volume rendering; shading is disabled while one is active.
          </div>
        )}
      </div>

      <div className="section">
        <h3>Shading &amp; lighting</h3>
        <div className="row">
          <label>Shading</label>
          <input type="checkbox" checked={tf.shading.enabled}
            onChange={(e) => setShading({ enabled: e.target.checked })} />
        </div>
        <Slider label="Ambient" value={tf.shading.ambient} min={0} max={1} step={0.01} onChange={(v) => setShading({ ambient: v })} />
        <Slider label="Diffuse" value={tf.shading.diffuse} min={0} max={2} step={0.01} onChange={(v) => setShading({ diffuse: v })} />
        <Slider label="Specular" value={tf.shading.specular} min={0} max={1} step={0.01} onChange={(v) => setShading({ specular: v })} />
        <Slider label="Spec. power" value={tf.shading.specularPower} min={1} max={80} step={1}
          onChange={(v) => setShading({ specularPower: v })} fmt={(v) => v.toFixed(0)} />
        <div className="hint">
          Higher specular power narrows the highlight. Keep specular modest: strong highlights
          read as plastic rather than bone.
        </div>
      </div>

      <div className="section">
        <h3>Gradient opacity</h3>
        <div className="row">
          <label>Enabled</label>
          <input type="checkbox" checked={tf.gradientOpacity.enabled}
            onChange={(e) => setGrad({ enabled: e.target.checked })} />
        </div>
        <Slider label="Min gradient" value={tf.gradientOpacity.min} min={0} max={100} step={1}
          onChange={(v) => setGrad({ min: v })} fmt={(v) => v.toFixed(0)} />
        <Slider label="Max gradient" value={tf.gradientOpacity.max} min={1} max={400} step={1}
          onChange={(v) => setGrad({ max: v })} fmt={(v) => v.toFixed(0)} />
        <Slider label="Min opacity" value={tf.gradientOpacity.minOpacity} min={0} max={1} step={0.01}
          onChange={(v) => setGrad({ minOpacity: v })} />
        <Slider label="Max opacity" value={tf.gradientOpacity.maxOpacity} min={0} max={1} step={0.01}
          onChange={(v) => setGrad({ maxOpacity: v })} />
        <div className="hint">
          Gradient opacity suppresses homogeneous interiors and emphasises tissue boundaries.
          It is what makes a bone rendering look like a surface without abandoning volume rendering.
        </div>
      </div>

      <div className="section">
        <h3>Sampling</h3>
        <Slider label="Opacity unit" value={tf.scalarOpacityUnitDistance} min={0.2} max={12} step={0.1}
          onChange={(v) => set({ scalarOpacityUnitDistance: v })} fmt={(v) => `${v.toFixed(1)} mm`} />
        <div className="row">
          <label>Texture filter</label>
          <select value={tf.interpolationType}
            onChange={(e) => set({ interpolationType: e.target.value as 'linear' | 'nearest' })}>
            <option value="linear">Linear (trilinear)</option>
            <option value="nearest">Nearest</option>
          </select>
        </div>
        <div className="row">
          <label>Render quality</label>
          <select value={s.quality} onChange={(e) => s.setQuality(e.target.value as typeof s.quality)}>
            <option value="interactive">Interactive (fastest)</option>
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="export">Maximum</option>
          </select>
        </div>
        <div className="hint">
          Quality drops automatically while you rotate and returns when the mouse stops.
          The setting above is the quality used when idle.
        </div>
      </div>

      <div className="section">
        <h3>Material colour ramp</h3>
        {tf.color.map((c, i) => (
          <div className="row" key={i}>
            <input type="number" value={c.hu} style={{ flex: '0 0 74px' }}
              onChange={(e) => {
                const color = [...tf.color];
                color[i] = { ...c, hu: Number(e.target.value) };
                set({ color });
              }} />
            <input type="color"
              value={`#${c.color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`}
              onChange={(e) => {
                const hex = e.target.value;
                const rgb: [number, number, number] = [
                  parseInt(hex.slice(1, 3), 16) / 255,
                  parseInt(hex.slice(3, 5), 16) / 255,
                  parseInt(hex.slice(5, 7), 16) / 255,
                ];
                const color = [...tf.color];
                color[i] = { ...c, color: rgb };
                set({ color });
              }} />
            <span className="val">HU</span>
            <button className="btn sm" disabled={tf.color.length <= 2}
              onClick={() => set({ color: tf.color.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button className="btn sm wide" onClick={() => set({
          color: [...tf.color, { hu: Math.round((tf.color[tf.color.length - 1]?.hu ?? 0) + 200), color: [1, 1, 1] as [number, number, number] }],
        })}>Add colour stop</button>
        <div className="hint">
          Colour is a visualisation choice, not a tissue label. Nothing here identifies anatomy.
        </div>
      </div>
    </>
  );
}
