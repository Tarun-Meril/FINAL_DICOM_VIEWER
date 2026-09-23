# Clinical-safety architecture

> **This prototype is not a medical device.** It has no regulatory clearance or approval,
> it has not been clinically validated, and the fact that it renders correctly is not
> evidence of clinical safety or effectiveness. It must not be used for diagnosis,
> treatment planning, or any clinical decision.

The purpose of this document is to record the design decisions that would need to be
carried forward if this engine were ever taken into a regulated development process, and
to be explicit about what has *not* been done.

## Relevant lifecycle standards

The architecture anticipates these, without claiming conformance to any of them:

| Standard | Relevance | What exists today |
|---|---|---|
| IEC 62304 (software lifecycle) | Software safety classification, architecture, unit/integration verification, SOUP management | Layered architecture with documented boundaries; automated unit, integration and E2E suites; a pinned dependency list with licences |
| ISO 14971 (risk management) | Hazard identification and risk control | The failure-mode table below and the risk controls implemented in code |
| ISO 13485 (QMS) | Design controls, traceability | Not established. This is prototype work outside a QMS. |
| IEC 62366 (usability engineering) | Use-related risk, formative evaluation | Not performed. UI decisions here are engineering judgement, not validated usability work. |
| DICOM PS3.x conformance | Declared SOP classes, transfer syntaxes, spatial semantics | Transfer syntax support is enumerated in `dicom/transferSyntax.ts`; no conformance statement has been authored |

## Identified failure modes and the controls in place

| Hazard | How it could occur | Control |
|---|---|---|
| **Patient left/right inverted** | Direction matrix built from the stack direction instead of the slice normal; row/column cosines swapped; RAS/LPS confusion | `kAxis = cross(iAxis, jAxis)` by construction; world space *is* LPS with no conversion layer; conformance check asserts `det = +1`; unit tests pin the vtk direction-array layout and the screen-right anatomy of every cardinal camera preset |
| **Geometrically distorted volume** | `PixelSpacing[0]`/`[1]` swapped; `SliceThickness` used as inter-slice spacing | Spacing mapping is unit-tested; spacing is the median of measured position differences, with the tag only as a declared fallback that downgrades measurement validity |
| **Fabricated anatomy in a gap** | Missing slices silently interpolated | Gaps ≥ 2 × median are detected and reported with the count; the mitigation text states that gap regions are interpolated and must not be read as anatomy |
| **Misleading volume from mixed data** | Two reconstructions or two frames of reference merged | Grouping key includes `FrameOfReferenceUID`; mixed orientation or matrix is fatal, not a warning |
| **Wrong HU values** | `BitsStored` < `BitsAllocated` not masked; sign extension from the wrong bit; padding rescaled | Explicit handling of all four encoding tags plus padding; independent verification pass; measured range compared against what the encoding can represent |
| **Source data altered** | An in-place edit during segmentation or sculpting | The source array is only written during construction; all editing targets derived masks; asserted by checksum in the integration test |
| **Measurement in the wrong units** | Screen-pixel measurement; spacing assumed | All measurements are computed in world millimetres; `measurementValidity` disables/flags them when spacing had to be assumed or taken from `SliceThickness` |
| **A projection mistaken for a volume rendering** | MIP left enabled | The viewport corner and the export annotation always state the active mode; shading is force-disabled outside composite |
| **A reduced-resolution volume mistaken for the full study** | GPU fallback engaged silently | A persistent status-bar pill states the displayed resolution; the downsample is recorded in the provenance and in the presentation state |
| **Patient identifiers leaked** | Logging, telemetry, burned-in annotation | The logger redacts a fixed list of identifying tags unconditionally; identifiers are read only on explicit request and are opt-in for screenshot annotation; there is no telemetry and no network egress |
| **Threshold result read as anatomy** | "Bone", "vessel" labels taken as identification | Preset and segmentation panels state that these are attenuation ranges and visualisation choices, not tissue labels |

## Data handling

- All processing is in-browser. There is no server component, no upload, no third-party
  API and no analytics.
- The only network requests the application makes are for its own static assets and WASM
  codecs, served from the same origin.
- Nothing is written to persistent storage. Exports are user-initiated downloads.

## Verification evidence

| Requirement area | Evidence |
|---|---|
| Geometry | `src/tests/geometry.test.ts`, `src/tests/volume.test.ts`, `verifyVolumeGeometry` (8 runtime checks on every load) |
| HU conversion | `src/tests/hu.test.ts`, `verifyModalityLut` (runtime, per study) |
| Series selection | `src/tests/ingestion.test.ts` |
| Transfer functions and camera anatomy | `src/tests/rendering.test.ts` |
| Segmentation, sculpting, undo | `src/tests/segmentation.test.ts` |
| Measurement and picking | `src/tests/measurement.test.ts` |
| Presentation state | `src/tests/presentationState.test.ts` |
| Real-study end-to-end | `src/tests/integration.dataset.test.ts`, `tools/validate-render.mjs` |
| Browser UI | `e2e/viewer.spec.ts` |

## What has not been done

- No clinical evaluation, no reader study, no comparison against a cleared device.
- No usability engineering file, no use-error analysis, no summative evaluation.
- No formal risk management file; the table above is an engineering inventory, not an
  ISO 14971 deliverable.
- No DICOM conformance statement.
- No validation on scanners, kernels, protocols or anatomy beyond those listed in the
  validation report.
- No cybersecurity assessment.
