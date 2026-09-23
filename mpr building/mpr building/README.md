# MerilView PRO — Clinical CT / MRI MPR

A production-oriented 2D Multi-Planar Reconstruction workstation for CT and MRI
DICOM studies: true axial, coronal and sagittal reformats of one shared
volumetric representation, synchronised through a single world-space reference
point.

**Scope:** 2D MPR only. There is no volume rendering, surface rendering, VR/VRT,
cinematic rendering, segmentation, 3D camera or mesh export anywhere in this
module — the segmentation WebAssembly module that `@cornerstonejs/tools` imports
is deliberately replaced by a stub (`src/shims/polyseg-stub.ts`) that throws if
anything ever tries to use it. A volumetric representation exists internally
because correct reslicing requires one; the user experience is strictly 2D.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5176 (Cross-Origin Isolated)
npm test             # 107 geometry / crosshair / measurement tests
npm run typecheck
npm run build
```

Then click **Select DICOM files** and choose a CT or MRI series.

### Generate a validation phantom

No patient data is needed to check the geometry end to end:

```bash
node tools/make-phantom.mjs phantom --slices 80 --spacing 0.7,0.7,2.5
node tools/make-phantom.mjs phantom-oblique --oblique 20
node tools/make-phantom.mjs phantom-tilt --tilt 15
node tools/make-phantom.mjs phantom-gap --missing 40
node tools/make-phantom.mjs phantom-mr --modality MR --spacing 0.5,0.5,3
```

Each writes real DICOM P10 files containing three bars of **exactly 50.00 mm**
along patient X, Y and Z, plus a high-density marker placed only on the
patient's **left** — so a mirrored coronal or sagittal reformat is obvious at a
glance, and the Length tool can be checked against a known value in every plane.

### Browser acceptance runs

```bash
npm run build
npx vite preview --port 4173 &
npm i -D playwright && npx playwright install chromium   # once

# synthetic phantom — geometry only
node tools/e2e-smoke.mjs http://localhost:4173/ phantom

# a real study — full clinical workflow, one screenshot per state
node tools/e2e-real.mjs http://localhost:4173/ /path/to/study ./shots 0
```

`e2e-smoke` verifies the geometry contract against the phantom. `e2e-real`
drives the whole workflow on a real series — series selection, volume
streaming, crosshair jumps, window presets, layouts, fullscreen, slab MIP,
measurement, zoom, diagnostics — asserting each step numerically against the
live rendering engine and writing a screenshot of every state. The last
argument selects which candidate series to open.

### Results on real studies

Validated against two real Philips studies. Every check is numerical, asserted
against the live rendering engine.

**CT KUB** — 502 files, two reconstructions of one acquisition, 250 slices each.
Offered as **separate** volumes rather than fused; two non-image objects (dose
report / secondary capture) excluded automatically.

**CT Brain** — 251 files, single series, 250 slices, near-isotropic.

| | CT KUB 512 | CT KUB 768 | CT Brain |
| --- | --- | --- | --- |
| Checks | 24/24 | 22/22 | 23/23 |
| Geometry | 512×512×250 @ 0.977/0.977/2.000 mm | 768×768×250 @ 0.651/0.651/2.000 mm | 512×512×250 @ 0.766/0.766/1.000 mm |
| Geometry verdict | ok, no issues | ok, no issues | ok, no issues |
| Intensity | −1024 … 1489 HU | −1024 … 1541 HU | −1024 … 2924 HU |
| Air corner | −1024 HU | −1024 HU | −1024 HU |
| Slice spacing | measured 2.000 mm, 0.000 % deviation | 2.000 mm, 0.000 % | 1.000 mm, 0.000 % |
| Gantry shear | 0.0000° | 0.0000° | 0.0000° |
| Plane coincidence (load / crosshair / layout / reset) | 0.00e+0 mm | 0.00e+0 mm | 0.00e+0 mm |
| After zoom | 2.7e−5 mm | 4.7e−6 mm | 7.0e−6 mm |
| Length tool vs its own world handles | 50.515 → 50.50 mm | 50.548 → 50.50 mm | 50.164 → 50.20 mm |
| Parse + validate | 1.6 s (502 files) | 1.6 s | 2.8 s (251 files) |
| Stream volume (software rendering, no GPU) | 103 s (125 MB) | 364 s (281 MB) | 87 s (125 MB) |

Screenshots of every state for each run are in `validation/`.

---

## Deployment requirement: cross-origin isolation

Serve the application with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These enable `SharedArrayBuffer`, which the volume streamer uses to move large
studies between workers without copying. The dev and preview servers already
send them (`vite.config.ts`). Without them the viewer still works — the engine
is configured with `SharedArrayBufferModes.AUTO` — but large-study loading is
measurably slower.

---

## Architecture

```
src/
  core/                      Rendering-engine-independent, fully unit-tested
    math/vec.ts              LPS vector algebra
    geometry/
      types.ts               FrameDescriptor, GeometryIssue, SeriesGeometry
      DICOMGeometry.ts       geometry derivation + validation  ← the heart
      SpatialTransform.ts    index <-> patient-space millimetres
      planeIntersection.ts   plane/plane intersection for reference lines
      orientation.ts         anatomical labels derived from direction vectors
    volume/
      SeriesValidator.ts     localiser exclusion, coherent-group partitioning
      VolumeBuilder.ts       volume descriptor + scalar assembly
      modality.ts            CT rescale to HU; MR left in arbitrary units
    crosshair/
      CrosshairManager.ts    world-space sync, reformat pitch, reference lines
    measurement/
      measurement.ts         world-space mm / degrees / mm² primitives
    state/
      planes.ts              the three plane cameras (patient space)
      MPRStateManager.ts     centralised state; one reference point
      SliceNavigation.ts     slice index / position from real extents
    wl/WindowLevelManager.ts window presets and VOI mapping

  dicom/                     dicom-parser adapter (classic + Enhanced multi-frame)
  engine/                    Cornerstone3D integration only
    init.ts                  engine + decoder bootstrap
    metadataProvider.ts      feeds OUR validated geometry to the renderer
    MPRViewportManager.ts    three VolumeViewports over ONE volume
    tools.ts                 mouse bindings
  app/loadStudy.ts           files -> validated volume pipeline
  ui/                        React workspace, toolbar, overlays, diagnostics
  tests/                     107 automated tests + synthetic fixtures
                             (realDataset.report.test.ts prints a geometry
                              audit for any real study directory via
                              MPR_DATASET_DIR)
  shims/polyseg-stub.ts      segmentation deliberately excluded
tools/
  make-phantom.mjs           synthetic DICOM generator
  e2e-smoke.mjs              phantom acceptance run
  e2e-real.mjs               real-study acceptance run with screenshots
```

`core/` has no dependency on Cornerstone3D, React or the DOM. Every geometric
claim the application makes is therefore testable in isolation, and the
rendering engine could be replaced without touching the geometry.

---

## Geometry rules enforced in code

These are the rules that separate a correct reformat from a plausible-looking
one. Each is implemented in `DICOMGeometry.ts` and covered by tests.

| Rule | Where |
| --- | --- |
| Slice order comes from the projection of Image Position (Patient) onto the slice normal — never InstanceNumber, SliceLocation or file order | `sortFramesByPosition` |
| `sliceNormal = normalize(cross(rowDirection, columnDirection))`, giving a right-handed basis so mirrored anatomy is impossible | `computeSliceNormal` |
| Slice thickness (0018,0050) is never used as slice spacing; spacing is measured from the data and compared against the declared value | `analyseSliceSpacing` |
| Pixel Spacing `[between rows, between columns]` maps to `spacing = [PS[1] along row dir, PS[0] along column dir]` | `buildSeriesGeometry` |
| Gantry tilt is detected as shear between the inter-slice step and the slice normal, and reported — not ignored | `analyseGantryTilt` |
| Irregular spacing is classified: jitter ≤1 % accepted, ≤10 % warned, >10 % refused | `IRREGULAR_SLICE_SPACING` |
| Integer-multiple gaps are reported as **missing slices** and refused by default | `MISSING_SLICES` |
| Mixed series, mixed Frame of Reference, non-parallel images, inconsistent matrix or pixel spacing, duplicate or coincident instances all refuse the volume | `buildSeriesGeometry` |
| Localiser / scout / topogram / dose report / secondary capture excluded, and the exclusion is reported | `excludeNonVolumetricFrames` |
| Arterial vs venous phase, and different reconstruction kernels, are never fused — they become separate selectable volumes | `groupFramesForVolume` |
| Enhanced multi-frame geometry resolved per frame: Plane Position → Plane Orientation → Pixel Measures → Pixel Value Transformation, with shared-group and root fallback | `parseFrames.ts` |
| CT rescale produces Hounsfield units; MR is never pushed through HU logic | `modality.ts` |
| Source pixel data is never modified; windowing and slab are display properties only | `VolumeBuilder`, `WindowLevelManager` |

When a series is refused, the operator sees a clinical message and the developer
gets the technical cause in the console and in the Diagnostics panel. There is
no "best effort" fallback path.

---

## Synchronisation model

`MPRState.referencePointWorld` — one `Vec3` in patient-space millimetres — is the
single source of truth for where the radiologist is looking. No viewport keeps
its own anatomical position.

Clicking a lesion in any viewport converts the canvas point to world coordinates
through that viewport's own camera, writes the result to the reference point,
and every viewport then solves its camera from that same millimetre coordinate.
A slice jump changes only the component of the focal point along the viewport's
own normal, so pan and zoom survive a crosshair move.

Consequences, all verified by test:

* the three displayed planes intersect exactly at the reference point
  (`triplePlaneIntersection` error < 1e-9 mm, and 0.000e+0 mm against the live
  cameras in the browser run);
* moving the crosshair never rebuilds the volume — it changes one vector;
* reference lines are the true plane–plane intersections, clipped to the visible
  region in world space, so they stay correct through zoom, pan, resize and
  layout change.

---

## Controls

| Input | Action |
| --- | --- |
| Mouse wheel | Scroll slices, by one true reformat pitch |
| Left | Active tool (crosshair by default) |
| Middle | Pan |
| Right | Window / level |
| Double-click a viewport | Fullscreen that plane / restore |
| ↑ ↓ | Previous / next slice |
| Page Up / Page Down | ±10 slices |
| Home / End | First / last slice |
| `c` | Jump to volume centre |
| `l` | Toggle Link Views |
| `r` | Toggle reference lines |
| `d` | Toggle the Diagnostics panel |
| `Esc` | Leave fullscreen |

While a measurement tool is active the left button belongs exclusively to it, so
a drag can never be misread as a window/level change mid-measurement.

---

## Test coverage

`npm test` — 107 tests:

* **geometry** — standard axial, oblique, gantry tilt, four anisotropic voxel
  sizes, MRI non-standard orientation, reversed and shuffled slice order,
  thick slices, missing slices, irregular and coincident spacing, mixed series,
  mixed Frame of Reference, non-parallel images, single image, localiser and
  dose-report exclusion, phase and kernel separation
* **crosshair** — triple-plane intersection, plane-offset consistency, index
  round-trip on oblique anisotropic volumes, pan preservation, reference-line
  membership in both planes, reference-line clipping, reformat pitch, slice
  index/total/position, navigation commands, volume clamping
* **measurement** — 50 mm structure measured in all three planes across three
  voxel geometries and an oblique volume, with an explicit 0.01 mm tolerance;
  pixels are proved not to equal millimetres; angle and ROI areas; world-space
  persistence across slice and plane changes
* **orientation** — LPS letter derivation, oblique labels, per-plane R/L/A/P/S/I,
  right-handed basis check, mirrored-basis detection
* **multiframe** — Enhanced CT and MR functional groups, per-frame orientation,
  anisotropic spacing axis mapping, Enhanced localiser frame exclusion
* **dicomRoundTrip** — real DICOM bytes generated by `tools/make-phantom.mjs`,
  parsed by the production adapter: geometry, rescale, 50 mm measurement,
  oblique recovery, 15° gantry tilt recovery, missing-slice refusal, MR units

---

## Known limitations

* Slab modes (Average / MIP / MinIP) are wired to the viewport blend mode and
  are 2D slab reformats, not volume rendering. They have unit coverage for
  state handling but no image-quality validation yet.
* Measurement annotations use Cornerstone's world-space tools; the
  `measurementVisibility` slab rule in `core/measurement` is implemented and
  tested but is not yet driving annotation culling in the overlay.
* Volume streaming times above were measured under **software rendering**
  (SwiftShader, no GPU). On real workstation hardware they will be far lower,
  but they have not been measured there — profile on your target hardware
  before committing to a study size. Nothing has been tested beyond 250 slices.
* Only CT has been validated against real studies (abdomen/KUB and brain). The
  MRI path is covered by unit tests and synthetic fixtures only.
* No oblique, gantry-tilted or Enhanced multi-frame **real** study has been
  tested — those paths are proven against synthetic DICOM only.

## Clinical status

This software has not been validated for clinical use and carries no regulatory
clearance. The geometry is mathematically checked and the failure modes are
explicit, but diagnostic correctness on real patient data must be established by
your own validation programme before deployment.
