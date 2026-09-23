# Transfer functions

## Model

A transfer function is plain serialisable data (`rendering/transferFunction.ts`), not a
vtk object. That lets the presentation state round-trip it, the tests assert on it without
a GPU, and the editor diff it.

```ts
{
  id, name, description,
  opacity:  [{ hu, opacity, midpoint?, sharpness? }, …],   // sorted, de-duplicated
  color:    [{ hu, color: [r, g, b] }, …],                 // 0..1 sRGB
  gradientOpacity: { enabled, min, max, minOpacity, maxOpacity },
  shading:  { enabled, ambient, diffuse, specular, specularPower },
  interpolation: 'linear' | 'smooth',
  blendMode: 'composite' | 'mip' | 'minip' | 'average' | 'additive',
  scalarOpacityUnitDistance,   // mm — see docs/rendering.md
  interpolationType: 'linear' | 'nearest',
  builtIn
}
```

Opacity, colour, gradient opacity and shading are independent, as required: changing the
colour ramp does not disturb the opacity ramp, and vice versa.

## Editor

The editor draws the dataset's own HU histogram on a **log scale** (a linear scale is
useless on CT, where the air peak is two orders of magnitude taller than everything else),
with the opacity ramp over it and the colour ramp as a strip along the axis. Gridlines
mark −1000, −500, 0, 200, 500, 1000, 2000 and 3000 HU.

```
  count (log)
    │        ╭───── bone ramp
    │  ██    │
    │  ██ ▄▄▖│▖
    │  ██ ███▛██▖▖▖ ▖
    └──┴───────────────────────── HU
    -1000  0  200   1000    3000
     air  soft tissue   dense
```

Click adds a control point, drag moves it, Alt-click deletes it. Any edit marks the
function as no longer a built-in, so a preset can never be silently mutated. Shift/widen
buttons move or scale the whole ramp — the 3D equivalent of a window/level drag.

## Built-in presets

| Preset | Intent |
|---|---|
| Bone | Dense structures with surface-emphasising gradient opacity; the default for a bone reconstruction |
| Bone Detailed | Lower entry, harder gradient response, for trabecular detail and thin cortical shells |
| High-Contrast Bone | Near-binary opacity step; crisp surface appearance while still volume rendering |
| Bone + Soft Tissue | Translucent soft tissue over opaque bone |
| Soft Tissue | Muscle / organ / fat range, dense structures faded so they do not dominate |
| Skin | Air–skin interface only; semi-transparent external surface |
| Muscle | Narrow window around muscle attenuation |
| Vascular / CTA | Iodine-contrast range in a warm palette, surroundings nearly transparent |
| Lung | Low-attenuation parenchyma and airways |
| MIP | Projection mode, labelled as such |

**None of these thresholds is a clinically validated number.** They are starting points
for interactive adjustment. The UI says so, and the CTA preset's description states
explicitly that it highlights an attenuation range and does not identify vessels.

## Dataset adaptation

A preset tuned on one scanner and kernel can render an empty viewport on another. Before
first render, `adaptPresetToVolume` anchors density-based presets to the dataset:

1. Find where the preset first reaches 10 % opacity (its "material entry" point).
2. Find the dataset's 99.5th HU percentile (where its dense tail actually lives).
3. Shift the whole ramp so the entry point sits at a sensible fraction of that tail —
   but only if the mismatch exceeds 25 HU, and never below 100 HU.

Non-density presets (soft tissue, lung, skin, muscle, MIP) are left alone. The rationale
sentence is shown under the preset list, so the user can see exactly what was changed and
why.

`chooseInitialPreset` then picks the opening preset from the same statistics: Lung when
more than 25 % of voxels are below −500 HU and the dense tail is weak, Vascular when the
series is flagged contrast-enhanced, Bone when the 99.5th percentile is ≥ 300 HU, Soft
Tissue otherwise. Together these two rules are what guarantee the requirement that the
viewport is never blank on load.

## Preset management

Duplicate, save-as, reset-to-built-in, delete, and JSON import/export. The file format is
`{ schema: "medview.transferfunction", version: 1, presets: [...] }`; a foreign schema or
a newer version is refused with a sentence rather than misread.
