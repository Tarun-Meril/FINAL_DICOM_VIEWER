# Rendering architecture

## The pipeline

MedView VR renders **true volume ray casting on the GPU**. It never composites slice
images to fake depth, and it never substitutes a polygonal surface for the volume.

```
camera ──► ray generation (per fragment)
              │
              ▼
        volume sampling at t = t0, t0+Δ, …   (3D texture, trilinear)
              │
              ▼
        transfer function:  HU → RGB, HU → α
              │
              ▼
        gradient estimation (central differences on the scalar field)
              │
              ▼
        gradient opacity modulation:  α ← α · g(‖∇f‖)
              │
              ▼
        Phong shading:  ambient + diffuse·(N·L) + specular·(R·V)^p
              │
              ▼
        opacity correction for step length:  α' = 1 − (1 − α)^(Δ / unitDistance)
              │
              ▼
        front-to-back compositing, early ray termination
              │
              ▼
        pixel
```

The implementation is `@kitware/vtk.js`'s `vtkVolumeMapper`, driven by
`src/rendering/engine.ts`. vtk.js was chosen over a hand-written shader because its mapper
already implements gradient opacity, per-component transfer functions, arbitrary clipping
planes and a correct non-axis-aligned direction matrix — all of which are requirements
here, and all of which are easy to get subtly wrong.

Three.js is deliberately not used: it has no volume mapper, no notion of a physically
positioned image grid, and no clipping-plane semantics that survive an oblique direction
matrix.

## Blend modes

| Mode | vtk blend | Shading | Notes |
|---|---|---|---|
| `composite` | `COMPOSITE_BLEND` | on | The primary mode. Everything below assumes it. |
| `mip` | `MAXIMUM_INTENSITY_BLEND` | off | Brightest sample per ray |
| `minip` | `MINIMUM_INTENSITY_BLEND` | off | Darkest sample per ray |
| `average` | `AVERAGE_INTENSITY_BLEND` | off | Mean over a scalar range |

Shading is force-disabled outside composite mode, because a projection has no surface to
shade. The viewport corner label states which mode is active so a projection can never be
mistaken for a volume rendering.

## Scalar opacity unit distance

The opacity function is defined *per millimetre of path*, not per sample. vtk.js applies

```
α_effective = 1 − (1 − α)^(sampleDistance / scalarOpacityUnitDistance)
```

so changing the ray step for performance does not change how dense the result looks. Each
preset carries its own unit distance: 0.8–1.2 mm for bone (thin, opaque structures),
3.5 mm for soft tissue, 6 mm for lung. Without this, an interactive-quality frame would
look markedly more transparent than the idle-quality frame that replaces it.

## Gradient opacity

Gradient opacity is the single biggest contributor to a bone rendering that reads as a
surface rather than a fog. Opacity is multiplied by a ramp over the gradient magnitude:
voxels in a homogeneous interior (low ‖∇f‖) are suppressed, voxels on a boundary (high
‖∇f‖) are kept.

Normals are computed from the **scalar field**, not from opacity
(`setComputeNormalFromOpacity(false)`). Opacity-derived normals follow the transfer
function, so the lighting would shift every time the user drags a control point.

Preset defaults: bone 4→110, detailed bone 2→70, high-contrast bone 6→140, soft tissue
1→45 with a 0.05 floor so interiors do not disappear entirely.

## Lighting

A single head light that follows the camera, plus Phong parameters exposed per preset:

| Parameter | Bone | Soft tissue | Skin | Lung |
|---|---|---|---|---|
| Ambient | 0.20 | 0.28 | 0.30 | 0.35 |
| Diffuse | 0.80 | 0.74 | 0.70 | 0.65 |
| Specular | 0.38 | 0.18 | 0.14 | 0.10 |
| Specular power | 18 | 10 | 8 | 6 |

The calibration target is clinical legibility, not realism: enough specular to read
cortical curvature, not enough to look like polished plastic. Specular is the first thing
to reduce if a rendering starts looking like a game asset.

## Adaptive quality

| Level | Ray step (× min voxel) | Image sample distance | Max samples/ray |
|---|---|---|---|
| `interactive` | 2.5 | 2.0 | 500 |
| `standard` | 1.0 | 1.0 | 2000 |
| `high` | 0.5 | 1.0 | 4000 |
| `export` | 0.35 | 1.0 | 6000 |

The ray step is expressed as a multiple of the **smallest voxel dimension**, so quality is
dataset-independent: a 0.4 mm bone reconstruction and a 3 mm survey scan both get a step
proportional to their own sampling.

`interactive` engages on the vtk interactor's `StartAnimation` event and the target
quality is restored 220 ms after `EndAnimation`. Renders are coalesced into one per
animation frame via `requestAnimationFrame`.

## GPU limits and the fallback path

`probeGpu()` reads `MAX_3D_TEXTURE_SIZE`, `MAX_TEXTURE_SIZE`, the float/half-float linear
filtering extensions and the renderer string, and derives a voxel budget (lower when the
renderer string matches a software rasteriser, since the texture then lives in system
RAM).

If a volume exceeds the budget or the texture cap, `chooseDownsampleFactor` picks the
smallest per-axis integer factor that fits — growing the factor on the largest axis first
— and `downsampleVolume` box-filters (not point-samples; point sampling aliases cortical
bone into speckle) to produce a **new derived volume**. The origin is shifted by half a
box so the physical position of the data is preserved. The source volume stays in memory,
the transform is recorded in the provenance, and the status bar shows a persistent
"reduced resolution" pill with the exact voxel count and spacing in the tooltip. The
application never crashes and never silently displays a lower-quality volume without
saying so.

If WebGL 2 is unavailable at all, a `WEBGL2_UNAVAILABLE` error explains that in one
sentence instead of throwing.

## Clipping

Clipping planes are handed to the mapper as `vtkPlane`s, so the cut happens on the GPU
during ray traversal and no voxel is touched.

The sign convention matters and is easy to get backwards: vtk.js clips a point when
`dot(planeOrigin − point, normal) > 0` (`isPointClipped` in `vtkVolumeFS.glsl`), i.e. it
**keeps** the half-space the normal points into. A plane emitted with the opposite normal
does not cut the volume — it erases all of it. `resolveClipPlanes` and `resolveCropPlanes`
therefore emit the *kept* direction, and unit tests evaluate the plane function at known
inside and outside points to pin it. Six named planes follow anatomical
directions — Right, Left, Anterior, Posterior, Superior, Inferior — each with a
position (normalised over the volume's world bounds), an optional slab thickness that adds
an opposing plane, and an invert flag. The VOI crop box is the same mechanism applied as
six planes at once.

"Remove inside" is the one case clipping planes cannot express (a half-space union is not
a box complement), so it is implemented through the visibility mask instead, which makes
it undoable like any other sculpt.

## Surface rendering

`rendering/surface.ts` runs `vtkImageMarchingCubes` on either the HU volume (iso value in
HU) or a binary segmentation mask (iso value 0.5), optionally smooths with a windowed-sinc
filter, and produces a `vtkActor` in the same world coordinates as the volume. Surface
area is computed by summing triangle areas in world millimetres.

Surfaces are a separate render mode and an additional layer, never a replacement: volume,
surfaces, measurement overlay and orientation cube all compose in one scene, and the
layer architecture takes an arbitrary number of named surfaces so bone, vessels, a lesion
and an implant can coexist.

## Orientation cube

Drawn as an orthographic SVG projection of a labelled cube, driven directly by the camera
basis, rather than as a second vtk renderer. Two reasons: it cannot drift out of sync with
the rendering, and it costs nothing on the GPU — on a software rasteriser a second
renderer would roughly halve the frame rate. Faces are labelled in DICOM patient terms
(L/R/A/P/S/I) and clicking a visible face jumps to that view.

The four edge labels around the viewport are computed from `screenDirections(camera)` and
`anatomicalLabel()`, so they are derived from the same basis the renderer uses.

## Picking

Measurements need a world point, and reading it back from the GPU is both slow and
imprecise. `measurement/picking.ts` instead casts the same ray on the CPU against the
source scalars, accumulating opacity through the active transfer function with the same
step-length correction the shader uses, and returns the first position where accumulated
opacity crosses a threshold. In MIP mode the pick rule switches to the maximum sample,
matching what the user sees. The visibility mask is honoured, so you cannot pick something
you have sculpted away.

`worldToScreen` is the exact inverse of `rayThroughPixel` for both projections, which the
test suite asserts by round-tripping pixels through world space.
