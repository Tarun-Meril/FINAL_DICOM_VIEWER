# DICOM ingestion

## 1 — Expand the dataset

`dicom/archive.ts` accepts ZIP, GZIP, TAR and TAR.GZ, recursing up to three levels for
archives inside archives. `__MACOSX`, `._*`, `.DS_Store`, `Thumbs.db` and `DICOMDIR` are
dropped. 7-Zip and RAR are detected by signature and **refused with a plain explanation**
rather than silently skipped — there is no browser-quality pure-JS LZMA decoder we are
willing to ship.

## 2 — Find the DICOM files

`dicom/detect.ts` never trusts a filename or extension. Two strategies:

1. 128-byte preamble followed by `DICM` (a Part-10 file).
2. Preamble-less streams: a plausible first data element at offset 0 in either explicit or
   implicit VR little endian.

Everything else is recorded in `diagnostics.rejectedFiles` with the reason.

## 3 — Read the headers

`dicom/parser.ts` wraps `dicom-parser`. It reads the geometry, encoding, rescale and
identification tags into a `DicomInstanceMeta`. Numeric accessors fall back between the
string (`IS`/`DS`) and binary (`US`/`UL`) representations, because encoders disagree about
which VR they use for `Rows`, `BitsAllocated` and `PixelPaddingValue`.

Patient-identifying fields are read by a separate function (`readPatientHeader`) that is
only called when the user explicitly asks for a burned-in annotation. The logger redacts
them unconditionally.

## 4 — Group and choose

Grouping key: `StudyInstanceUID | SeriesInstanceUID | FrameOfReferenceUID`. The frame of
reference participates so that a re-used series UID across two frames of reference can
never merge into one volume.

`classifySeries` assigns a role:

| Role | Trigger |
|---|---|
| `non-image` | SR / PR / RTSTRUCT / raw-data SOP class, or no pixel data |
| `secondary` | Secondary Capture SOP class, or a description containing "dose report", "exam summary", "screen save", "patient protocol" |
| `localizer` | `LOCALIZER` / `SCOUT` / `TOPOGRAM` in `ImageType`, or "localizer" / "scout" / "topogram" / "surview" / "pilot" in the description |
| `unsupported` | Transfer syntax this build cannot decode |
| `single-image` | Fewer than 16 frames |
| `derived` | `DERIVED` without `PRIMARY`, or missing position/orientation |
| `volumetric` | everything else |

Only `volumetric` series are scored. The score is a transparent sum, and every term is
reported to the user:

| Term | Weight |
|---|---|
| CT modality | +0.30 |
| CT Image Storage SOP class | +0.05 |
| `ORIGINAL\PRIMARY` | +0.10 |
| `AXIAL` | +0.03 |
| Constructible rectilinear geometry | +0.15 |
| Uniform slice spacing | +0.10 |
| No gantry tilt | +0.05 |
| Frame count (log-scaled, saturating at 600) | up to +0.15 |
| Thin slices (0.5 mm full marks, 5 mm none) | up to +0.07 |
| ≥ 512² matrix | +0.05 |
| Lossy compression declared | −0.05 |

Ties break on frame count. The winning series and the reason every other series lost are
both surfaced in the diagnostics panel and in the exported report.

## 5 — Spatial geometry

This is the safety-critical step (`dicom/geometry.ts`).

```
rowDirection    = ImageOrientationPatient[0..2]
columnDirection = ImageOrientationPatient[3..5]
sliceNormal     = normalize(cross(rowDirection, columnDirection))
sliceCoordinate = dot(ImagePositionPatient, sliceNormal)
```

Slices are sorted by `sliceCoordinate`. **Filenames and `InstanceNumber` are never used
for ordering.** When instance numbers run opposite to physical position the pipeline says
so in the diagnostics and carries on with the physical order.

Inter-slice spacing is the **median of the measured differences** between consecutive
slice coordinates. `SliceThickness` is never used as a substitute; it is only a last-resort
fallback (after `SpacingBetweenSlices`) when a single slice makes measurement impossible,
and that fallback downgrades measurement validity and says so in the UI.

### Detected conditions

| Condition | Detection | Response |
|---|---|---|
| Inconsistent orientation | any `ImageOrientationPatient` differing by > 1e-3 | **fatal** — no volume is built |
| Mixed matrix size | any differing `Rows`/`Columns` | **fatal** |
| Mixed pixel spacing | differing `PixelSpacing` | error, reported |
| Missing position/orientation | absent `(0020,0032)` / `(0020,0037)` | those slices are excluded; fatal if none remain |
| Duplicate positions | consecutive difference < 1 µm | warning; the first slice at that position wins |
| Gaps / missing slices | a difference ≥ 2 × median | warning; the grid is regular and gap slices are interpolated, flagged as such |
| Irregular spacing | max relative deviation > 1 % | `resample-irregular` strategy |
| Gantry tilt | angle between the measured stack direction and the slice normal > 0.1°, or a non-zero `GantryDetectorTilt` | `shear-correct` strategy |
| No usable spacing | single slice, no spacing tags | 1 mm assumed; measurements along the slice axis disabled |

### Reconstruction strategies

- **`regular`** — slices already lie on a uniform grid. Each is written directly at
  `round((coord − origin) / spacing)`.
- **`resample-irregular`** — the target grid uses the median spacing; each target slice is
  a linear interpolation between the two source slices that bracket it. Streaming, so the
  memory cost is one slice, not the whole stack.
- **`shear-correct`** — a tilted acquisition is a sheared grid. Each slice is translated
  in-plane (bilinear) by its displacement from the orthogonal grid before being placed,
  then the irregular-spacing logic applies as above.
- **`reject`** — the geometry cannot be trusted; no volume is produced.

Whatever is applied is recorded in `VolumeData.provenance.transforms` with its parameters
and shown in the diagnostics panel.

## 6 — Hounsfield Units

```
HU = storedValue × RescaleSlope + RescaleIntercept
```

Before that, `normalizeSamples` reinterprets the raw bytes according to the declared
encoding. The cases it handles explicitly:

- `BitsAllocated` 8 / 16 / 32.
- `BitsStored` < `BitsAllocated`: the unused high bits are **masked off**. A 12-in-16
  encoding with garbage in the top nibble is common and would otherwise produce HU values
  in the tens of thousands.
- `HighBit` ≠ `BitsStored − 1`: the sample is shifted down first.
- `PixelRepresentation = 1`: sign-extended from `BitsStored`, not from 16.
- Big-endian transfer syntax: 16-bit samples are byte-swapped.

`PixelPaddingValue` (and `PixelPaddingRangeLimit` when present) is treated as a sentinel
and mapped to −1024 HU rather than rescaled, because padding is not a measured
attenuation.

An independent verification pass (`verifyModalityLut`) recomputes a sparse sample of
voxels on the first, middle and last slice and asserts they match. A mismatch is reported
as an error, not swallowed. The measured HU range is also compared against what the
declared encoding can represent; a range outside it means the encoder and the header
disagree, and the user is told.

## 7 — Diagnostics

`buildSeriesReport` / `formatSeriesReport` produce the full parameter list required for
review: study / series / frame-of-reference UIDs, modality, description, image type,
transfer syntax, scanner, kernel, slice count, matrix, pixel spacing, **calculated** slice
spacing alongside the tagged thickness, measured spacing min/max, spacing source,
`ImageOrientationPatient`, `PatientPosition`, the resulting orientation code and
anatomical axis mapping, gantry shear, duplicate and missing-slice counts, reconstruction
strategy, rescale slope/intercept, bit encoding, photometric interpretation, pixel
padding, voxel dimensions, physical dimensions in millimetres and the full HU distribution
with percentiles.
