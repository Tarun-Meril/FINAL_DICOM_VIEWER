# MedView VR

**Standalone CT 3D volume visualisation and rendering engine — R&D prototype.**

> ⚠️ **Research prototype. Not a medical device.** Not cleared or approved by any
> regulator. Not validated for clinical use, diagnosis, or treatment decisions.
> See [`docs/clinical-safety.md`](docs/clinical-safety.md).

MedView VR loads a real DICOM CT study, reconstructs a physically correct voxel volume
in DICOM patient (LPS) coordinates, and renders it with GPU ray-cast volume rendering.
It is built as an independent engine so that it can be validated on its own before being
integrated into the MedView platform. It deliberately implements **only** 3D: there is no
MPR, no axial/coronal/sagittal layout, no PACS, no RIS and no reporting.

Rendered previews produced from the supplied study, together with the full PASS/FAIL
results, are in [docs/validation-report.md](docs/validation-report.md).

## What it does

| Area | Capability |
|---|---|
| Ingestion | ZIP / TAR / TAR.GZ / loose files / folders; content-based DICOM detection; JPEG 2000, HTJ2K, JPEG-LS, JPEG, JPEG-lossless and RLE decoding in Web Workers |
| Series selection | Study / series / frame-of-reference grouping, scored volumetric-candidate selection, explicit exclusion of localizers, secondary captures and reports |
| Geometry | Ordering by `ImagePositionPatient` projected on the slice normal, measured inter-slice spacing, duplicate/gap/tilt/irregularity detection, eight automated conformance checks |
| HU | Full modality LUT with `BitsAllocated` / `BitsStored` / `HighBit` / `PixelRepresentation` / pixel padding handling, plus an independent verification pass |
| Rendering | GPU ray casting (vtk.js) — composite, MIP, MinIP, average; gradient opacity; Phong shading; adaptive quality |
| Transfer functions | Histogram editor, 10 built-in presets, dataset-adaptive preset anchoring, import/export |
| Manipulation | 6 clipping planes with slabs, VOI crop box, threshold / region-grow / connected-component segmentation, bone extract-keep-remove, 3D sculpting (brush, plane, box, polygon), exact undo/redo |
| Measurement | 3D distance, angle, polyline, bounding box, segment volume, surface area — all in patient millimetres |
| Output | Annotated PNG/JPEG export at up to 2× viewport resolution, versioned JSON presentation state, marching-cubes surface extraction |

## Requirements

- Node.js ≥ 20
- A browser with **WebGL 2** (Chrome, Edge, Firefox; see [browser support](docs/known-limitations.md#browser-support))
- No server, no database, no network access. **DICOM data never leaves the machine.**

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```

Then drag a CT study (a ZIP archive, a folder, or loose files) onto the drop zone.

## Build and preview a production bundle

```bash
npm run build        # stages WASM codecs, typechecks, then builds to dist/
npm run preview      # serves dist/ on http://localhost:4173
```

`dist/` is a fully static bundle. Deploy it to any static host (see
[deployment](docs/deployment.md)).

## Verification status

| Suite | Result |
|---|---|
| Unit tests (`vitest`) | 164 passed |
| Real-study integration tests | 14 passed |
| Browser end-to-end (`playwright`) | 2 specs, 13 steps, passed |
| Real-dataset validation run | **35 / 35 checks passed** — see [docs/validation-report.md](docs/validation-report.md) |

The validation run loads the supplied 250-slice head CT through the real UI, exercises
every major feature, and captures 22 true rendered frames. It ran on a software
rasteriser, so its frame times are not a performance result; see
[known limitations](docs/known-limitations.md#browser-support).

## Tests

```bash
npm run typecheck                                   # strict TypeScript, app + tooling
npm test                                            # unit + integration (vitest)
MEDVIEW_TEST_DATASET=/path/to/study npm test        # adds the real-study integration suite
CHROME_PATH=/path/to/chrome npm run e2e             # browser end-to-end (playwright)
```

## Validate against a real study

Two harnesses run the **production code paths** against real DICOM data:

```bash
# 1. Headless ingestion + geometry + HU report (no GPU needed)
npm run validate:dataset -- /path/to/study

# 2. Full browser run: loads the study through the real UI, exercises every feature,
#    captures true rendered frames and writes a PASS/FAIL report
npm run build
CHROME_PATH=/path/to/chrome npm run validate:render -- /path/to/study ./validation-output
```

The second harness writes `validation-output/validation-report.json`,
`validation-output/presentation-state.json` and `validation-output/screenshots/*.png`.

## Controls

| Input | Action |
|---|---|
| Left drag | Orbit |
| Middle drag | Pan |
| Wheel | Zoom |
| Double click | Fit volume to viewport |
| `A` `P` `L` `R` `S` `I` | Anterior / posterior / left / right / superior / inferior view |
| `F` | Fit · `O` Toggle projection · `Esc` Back to navigate |
| `Ctrl/⌘ Z` · `Ctrl/⌘ Y` | Undo · redo |
| Click a cube face | Jump to that view |

With a measurement or sculpt tool active, left click places points instead of orbiting;
`Enter` completes a polyline or polygon and `Esc` cancels it.

## Documentation

- [Architecture](docs/architecture.md)
- [DICOM ingestion](docs/dicom-ingestion.md)
- [Rendering architecture](docs/rendering.md)
- [Transfer functions](docs/transfer-functions.md)
- [Segmentation and sculpting](docs/segmentation.md)
- [Performance](docs/performance.md)
- [Known limitations](docs/known-limitations.md)
- [Clinical-safety architecture](docs/clinical-safety.md)
- [Deployment](docs/deployment.md)
- [Dataset validation report](docs/validation-report.md)

## Project layout

```
src/
  core/          logging (PHI-redacting), typed errors, version
  math/          dependency-free vector / index↔world helpers
  dicom/         detection, parsing, transfer syntaxes, codecs, geometry, HU, series selection
  volume/        construction, statistics, resampling, geometry conformance
  rendering/     vtk.js engine, transfer functions, presets, camera, clipping, surfaces
  segmentation/  label volume, visibility mask, operations, bone workflow, undo history
  measurement/   picking (CPU ray cast) and physical measurements
  state/         zustand UI store, mutable session, versioned presentation state
  services/      dataset loader (worker orchestration), export
  workers/       archive+header scan, frame decode pool, statistics
  components/    workstation UI
  tests/         unit + integration suites
tools/           validation harnesses and build helpers
e2e/             browser end-to-end suite
docs/            architecture and validation documentation
```

## Licence and third-party code

This prototype is internal R&D. Third-party runtime dependencies: `@kitware/vtk.js`
(BSD-3), `dicom-parser` (MIT), `@cornerstonejs/codec-*` (MIT / BSD, wrapping OpenJPEG,
CharLS and libjpeg-turbo), `jpeg-lossless-decoder-js` (MIT), `fflate` (MIT), `zustand`
(MIT), `react` (MIT). No proprietary vendor UI, icon set, colour scheme or algorithm has
been copied.
