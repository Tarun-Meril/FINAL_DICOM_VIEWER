# Architecture

## Design rules

Three rules shape every module boundary in this codebase.

**1. DICOM correctness before appearance.** The ingestion and geometry layers refuse to
produce a volume they cannot justify. When the data is inconsistent they emit a typed
diagnostic and either stop or apply a named, recorded reconstruction strategy — never a
silent guess.

**2. Source / derived / presentation are separate.** The decoded HU volume is written
once and never mutated. Everything a user does afterwards lives in a *derived* structure
(a label volume, a visibility mask, a resampled copy) or in *presentation state* (camera,
transfer function, clipping). This is what makes bone removal, sculpting and cropping
non-destructive by construction rather than by convention.

**3. The UI thread only does bookkeeping.** Archive expansion, header parsing, frame
decoding and volume statistics all run in Web Workers. Rendering runs on the GPU. The
main thread never touches a full slice or a whole volume in a loop.

## Layering

```
        components/ (React)        ← may import anything below
                │
        state/  services/          ← orchestration, no DOM-free logic of its own
                │
  rendering/          segmentation/ measurement/
        │                    │
     volume/ ───────────────┘       ← construction, statistics, resampling, validation
        │
     dicom/                         ← detection, parsing, codecs, geometry, HU, selection
        │
   core/  math/                     ← logging, typed errors, vectors
```

Dependencies point downwards only:

- `src/dicom/**` never imports vtk.js, React or anything from `rendering/`. It is pure
  data processing and runs unchanged in Node, which is what lets the ingestion harness
  and the integration test exercise the production code path without a browser.
- `src/rendering/**` never imports React. The engine is a plain class that takes a DOM
  element; React only mounts and configures it.
- `src/segmentation/**` never imports `rendering/`. Segmentation produces masks; the
  renderer consumes them.

## The data path

```
File[] / archive
   │  scanWorker: expand archives, detect DICOM by content, parse headers
   ▼
DicomInstanceMeta[]
   │  seriesSelector: group by study / series / frame of reference, score candidates
   ▼
SeriesSummary  (the chosen volumetric CT series)
   │  geometry.analyzeGeometry: sort by IPP·normal, measure spacing, validate, choose a strategy
   ▼
GeometryAnalysis { slices, VolumeGeometry, issues, strategy }
   │  decodeWorker pool: decode frame → normalise stored samples → modality LUT → HU
   │  VolumeBuilder: place each slice on the regular grid (direct / resample / de-shear)
   ▼
Int16Array (HU) + VolumeGeometry
   │  statsWorker: min/max/mean/σ, HU histogram, percentiles
   │  validation.verifyVolumeGeometry: eight conformance checks
   ▼
VolumeData  ← SOURCE, immutable from here on
   │
   ├─ display: Int16Array          ← DERIVED, = source masked by the visibility mask
   ├─ LabelVolume (Uint8)          ← DERIVED, segmentation objects
   ├─ VisibilityMask (Uint8)       ← DERIVED, sculpt / crop / bone-removal exclusions
   └─ PresentationState            ← camera, transfer function, clipping, measurements
        │
        ▼
   VolumeRenderEngine → vtkVolumeMapper → GPU ray casting → canvas
```

## Coordinate systems

The engine distinguishes five spaces and never conflates them.

| Space | Units | Where it lives |
|---|---|---|
| Voxel / index | voxels, `(i, j, k)` | `VolumeGeometry.dimensions`, array offsets |
| Image | mm within one slice | DICOM `PixelSpacing`, row/column cosines |
| Patient (LPS) | mm, +x Left, +y Posterior, +z Superior | `VolumeGeometry.origin`, `ImagePositionPatient` |
| World | identical to patient LPS | vtk.js scene, camera, measurements, clipping |
| Camera | view coordinates | `CameraState`, `screenDirections`, picking rays |

World space **is** DICOM patient space. There is no conversion layer, no RAS flip, and no
"viewer coordinate system". That choice removes the single most common source of silent
left-right inversion: every measurement, clipping plane, crop box and direction label is
computed in the same millimetres the scanner wrote into the file.

The index→world transform is

```
world = origin + iAxis · (i · spacing.i) + jAxis · (j · spacing.j) + kAxis · (k · spacing.k)
```

with `iAxis` = row cosines, `jAxis` = column cosines, `kAxis` = `cross(iAxis, jAxis)`.
Because `kAxis` is defined as the cross product rather than taken from the direction the
slices happen to advance in, the basis is right-handed by construction: `det = +1` always,
and `verifyVolumeGeometry` asserts it. Reversed series are handled by *ordering*, not by
flipping an axis.

`spacing.i` is `PixelSpacing[1]` (spacing between columns) and `spacing.j` is
`PixelSpacing[0]` (spacing between rows). Getting that pair the wrong way round silently
distorts anisotropic acquisitions; `geometry.test.ts` pins it.

## vtk.js direction matrix

`vtkImageData.setDirection` takes nine numbers. Internally vtk.js copies
`direction[0..2]` into **column 0** of a column-major index→world matrix, so
`direction[0..2]` is the world direction of increasing index *i*. The flat array is
therefore `[iAxis, jAxis, kAxis]`, which `math/vec3.directionFlat` produces and
`rendering.test.ts` asserts. This is the layout Cornerstone3D also uses; the comment in
`imageDataFactory.ts` records why, because the failure mode of getting it wrong is a
mirrored patient rather than an exception.

## Threading

| Worker | Work | Why |
|---|---|---|
| `scanWorker` | ZIP/TAR/GZIP expansion, content-based DICOM detection, header parsing | A 500-file study takes seconds; on the UI thread that is a visible freeze |
| `decodeWorker` × *n* | One frame each: entropy decode → bit normalisation → modality LUT | The dominant cost; scales with cores |
| `statsWorker` | Single pass for min/max/mean/σ and the HU histogram | ~0.8 s on a 65 Mvoxel volume |

The pool is owned by `services/datasetLoader.ts` on the main thread, which keeps two
slices in flight per worker to hide message latency and writes results into the
`VolumeBuilder` **in slice order** (required by the resampling strategies) while decoding
continues out of order. Every large buffer crosses a worker boundary by transfer, never by
copy.

## Error model

`core/errors.ts` defines a closed set of `ErrorCode`s and a `DiagnosticIssue` shape with
four severities. Every issue carries a clinician-facing `message`, an optional technical
`detail` and, where the pipeline recovered, a `mitigation` describing what it did.

The rule is that the user-visible text is always a sentence about the data —
*"3D rendering cannot safely continue because 7 slices have inconsistent orientation."* —
and the stack trace lives only in the diagnostics panel and the exportable log.

## State

- `state/store.ts` (zustand) holds small, serialisable UI state and is what React renders from.
- `state/session.ts` holds the large mutable buffers (volume, masks, history, engine) as a
  module-level singleton. React never re-renders on a mask change; the engine is told
  directly to re-upload the texture. Keeping 100+ MB typed arrays out of the reactive store
  is deliberate.
- `state/presentationState.ts` is the versioned, serialisable snapshot: dataset identity,
  camera, transfer function, blend mode, clipping, crop box, segmentation objects with
  RLE-encoded masks, measurements, surfaces, and UI flags.
