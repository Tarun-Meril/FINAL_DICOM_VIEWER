# Known limitations

Nothing here is hidden behind a "future work" heading. These are the things this engine
does not do, does badly, or has not been tested on.

## Scope (deliberate)

- **No MPR, no 2D layouts.** There is no axial/coronal/sagittal view, no cross-reference
  lines and no slice scrolling. This engine is 3D only, by design.
- **No PACS, RIS, worklist, reporting or study management.** Data comes in from the local
  filesystem and results go out as files.
- **CT only.** MR, PET, ultrasound and nuclear-medicine objects are read and reported but
  are not scored as volume candidates, and no preset or workflow targets them. Values are
  labelled "Hounsfield Units" only when the modality is CT.

## Ingestion

- **7-Zip and RAR archives are refused.** Detected by signature and reported; supply ZIP,
  TAR, TAR.GZ or loose files.
- **Enhanced multi-frame CT is not fully supported.** Single-frame objects are the tested
  path. Multi-frame objects are parsed and their frame count reported, but per-frame
  functional-group geometry (`(5200,9230)`) is not read, so a multi-frame study will
  usually fail geometry validation rather than build a wrong volume.
- **Deflated Explicit VR Little Endian** (`1.2.840.10008.1.2.1.99`) is listed as
  uncompressed in the transfer-syntax table; a deflated dataset will fail to parse rather
  than being inflated first.
- **JPEG Extended (Process 2 & 4)** is routed to the 8-bit baseline decoder; 12-bit
  extended JPEG will fail.
- **No DICOMDIR traversal.** `DICOMDIR` files are ignored; the file tree is walked
  directly, which is more robust but means a study referenced only from a DICOMDIR index
  is found by content rather than by index.
- **Colour (RGB) image data is decoded but not volume-rendered.** Only single-sample
  monochrome data builds a volume.
- **Fragmented multi-frame pixel data without a basic offset table** falls back to a
  best-effort read and may fail on unusual encoders.

## Geometry

- **Gantry-tilt correction is in-plane translation only.** It corrects the shear of a
  tilted stack, which covers the common case. A non-orthogonal acquisition where the
  stack direction is not merely translated (e.g. a helical reconstruction with varying
  in-plane rotation) is not handled and will be flagged rather than corrected.
- **Gap interpolation is linear.** Missing slices are filled by linear interpolation
  between neighbours and reported. The interpolated region is not visually distinguished
  in the rendering; the user is told the count and told not to read it as anatomy.
- **Duplicate positions keep the first slice.** There is no heuristic to prefer a
  "better" duplicate (e.g. by acquisition time or image type).
- **Strongly oblique acquisitions** (> 20° from a cardinal axis) get a warning and
  approximate direction letters. The orientation cube remains exact.

## Rendering

- **Volume shadows, ambient occlusion and volumetric scattering are not enabled.** vtk.js
  supports them; they are expensive and were not needed to reach the target appearance.
- **Only one volume actor.** Multiple simultaneously volume-rendered datasets (e.g. a
  fusion overlay) are not supported. Segmentation objects are composited as iso-surfaces
  instead, which is a different look from a translucent label overlay.
- **Arbitrary (non-axis-aligned) clipping planes are supported by the engine but not
  exposed in the UI.** The six anatomical planes plus the crop box are what the panel
  offers.
- **The crop box has no draggable 3D handles.** It is edited with paired sliders per axis
  and displayed as a wireframe. Rotating the box is not supported.
- **No stereo, no VR headset output, no cinematic rendering.**

## Segmentation and sculpting

- **Segmentation is threshold-based.** There is no model-based, atlas-based or learned
  segmentation. Region growing uses a fixed tolerance around the seed value.
- **No 2D-slice-based editing.** All editing happens in the 3D view, which makes fine
  correction of a mask harder than in a viewer with MPR.
- **Sculpting has no soft brush or feathering** — the brush is a hard sphere.
- **255 segmentation objects maximum** (one byte per voxel).
- **Undo history is bounded** at 50 entries or 256 MB; older steps are evicted silently
  except that the history list shortens.

## Measurement

- **Distances are surface-to-surface as picked**, i.e. they depend on the transfer
  function, because the pick threshold is accumulated opacity. Changing the preset can
  move where a pick lands. This is inherent to measuring on a volume rendering and is why
  the picked HU is displayed alongside.
- **Measurements are not editable after placement** — a point cannot be dragged; delete
  and re-measure.
- **No area measurement on an arbitrary plane**, no curved-path length.
- **Surface area** is reported for extracted iso-surfaces and depends strongly on the iso
  value and smoothing; it is a geometric property of the mesh, not of the anatomy.

## Export

- **PNG and JPEG only.** STL/OBJ/PLY surface export is architecturally anticipated
  (marching cubes already produces the polydata) but not implemented.
- **No DICOM output.** Neither secondary capture, nor DICOM SEG, nor a DICOM Presentation
  State. The JSON presentation state is shaped to make that mapping straightforward later.
- **Screenshot resolution is capped by what the GPU can allocate** for the offscreen
  buffer; a very large scale factor on a modest GPU will fail rather than degrade.
- **Anonymisation for research export is not implemented.** Patient identifiers are
  opt-in for burned-in annotation and off by default, but there is no de-identification
  pipeline.
- **A presentation state containing a segmentation mask is large.** The mask is
  run-length coded and base64-encoded, which is tiny for a compact structure but grows
  with how fragmented the mask is: the 1.5-million-voxel, 240-component bone mask in the
  validation report produces a 2.4 MB JSON file. A binary side-car would be far smaller.

## Performance

- **First render on a very large volume can take several seconds** while the 3D texture
  uploads; there is no progressive or tiled upload.
- **No streaming or out-of-core rendering.** A volume that does not fit the GPU is
  downsampled, not paged.
- **The undo history is in memory only** and is lost when the study is closed.
- **A whole-volume mask edit costs a full-array pass.** Operations that touch most of the
  volume (keep-only-this-segment, reset) rebuild the derived display array end to end;
  that is ~0.3 s on a 65-megavoxel study and is not incremental.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge 113+ | Primary target. Developed and validated here. |
| Firefox 115+ | Expected to work: WebGL 2, 3D textures, module workers and WASM are all supported. Not validated on real hardware in this cycle. |
| Safari 16.4+ | Expected to work, with caveats: `EXT_texture_norm16` is unavailable, so vtk.js falls back to a float texture and memory use roughly doubles. Directory selection (`webkitdirectory`) is supported but drag-and-drop of a folder is not. Not validated. |
| Any browser without WebGL 2 | Refused at startup with a plain message. |

Validation in this cycle ran on headless Chromium with the SwiftShader **software**
rasteriser, because the build environment has no GPU. That verifies correctness — the
same shaders, the same pipeline, real pixels from real data — but not interactive
performance. Frame times in the validation report are therefore one to two orders of
magnitude slower than on real hardware and must not be read as a performance result.

Two consequences worth stating plainly:

- **No frame rate has been measured on GPU hardware.** The requirement of smooth
  interactive rotation is designed for (adaptive quality, render coalescing, a ray step
  proportional to voxel size) and the ratio between quality levels behaves as intended,
  but the absolute interactive frame rate on a real GPU is unverified.
- **Texture-format fallbacks are untested.** `EXT_texture_norm16` and half-float linear
  filtering were unavailable on the validation host, so vtk.js used a Float32 texture
  throughout. The lower-memory paths a real GPU would take have not been exercised.

## Datasets not yet exercised

The validation report covers a single non-contrast head CT. Not yet tested against:

- Contrast-enhanced CTA (the vascular preset and the bone-removal workflow are
  implemented and unit-tested, but have not been exercised on real contrast data)
- Sub-millimetre thin-slice reconstructions
- Thick-slice (≥ 5 mm) survey scans
- Genuinely irregular spacing from a real scanner (only synthetic cases are tested)
- Real gantry-tilted acquisitions (only synthetic cases are tested)
- Multi-phase and multi-series studies with more than one volumetric candidate
- Deliberately corrupted or truncated DICOM files
- Volumes large enough to trigger the GPU downsample fallback on real hardware
