# Segmentation, bone removal and sculpting

## Two derived masks

Everything in this area writes to one of two byte arrays parallel to the volume. Neither
is the source data.

| Mask | Type | Meaning |
|---|---|---|
| `LabelVolume.labels` | `Uint8Array` | 0 = background, 1–255 = segmentation object id |
| `VisibilityMask.values` | `Uint8Array` | 1 = the voxel participates in rendering, 0 = removed |

The array actually uploaded to the GPU is a third, derived one:

```
display[i] = visibility[i] ? volume.scalars[i] : −1024 HU
```

`volume.scalars` is written once during construction and never again. That is the whole
mechanism behind "bone removal is non-destructive": there is no code path that can write
to the source array, so the guarantee is structural rather than a matter of discipline.
The integration test asserts it by checksumming the source before and after a full bone
extraction.

## Operations

| Operation | Entry point | Notes |
|---|---|---|
| Threshold | `thresholdSegment` | HU range, optionally restricted to an index box and/or to currently visible voxels |
| Region growing | `regionGrow` | 6- or 26-connectivity, seeded by a 3D pick, tolerance around the seed HU, voxel budget |
| Connected components | `filterConnectedComponents` | Labels components of one object, keeps those passing a predicate (min size, N largest) |
| Dilation | `dilateLabel` | Spherical structuring element in voxels; used to catch partial-volume rim voxels |
| Box cut | `sculptBox` | World-space box, erase or keep |
| Plane cut | `sculptPlane` | World half-space, evaluated incrementally in index space |
| Brush | `sculptSphere` | Radius in **physical millimetres**, so the same drag removes the same amount of tissue at any zoom |
| Polygon cut | `sculptPolygonPrism` | A screen-space polygon projected onto the focal plane and extruded through the volume |
| Apply label | `applyLabelToVisibility` | The bone keep/remove primitive |

Each returns a `MaskDelta`. Most edits touch a small fraction of the volume, so the
default form is sparse: the changed voxel indices plus their previous and next values, in
growable typed arrays (a JS number array would cost ~24 bytes per entry instead of 6).

Whole-volume operations are the exception. "Keep only this segment" touches every voxel
*outside* the segment — 64.8 million of 65.5 million on the study in the validation
report — and a sparse delta for that is larger than the volume itself. Past a threshold of
1/12 of the mask the recorder reconstructs the pre-edit array from the changes recorded so
far and switches to a **run-length-coded snapshot** of the whole mask, which for a runny
mask is a few kilobytes. `applyDelta` handles both forms, and undo/redo remains exact.

## Undo and redo

`EditHistory` stores deltas, not snapshots. A sculpt that touches 2 million voxels costs
~12 MB of history; a snapshot-based implementation would cost 65 MB per step on a 512³
volume. The stack is bounded by both entry count (50) and total bytes (256 MB), evicting
oldest first. Undo and redo are exact inverses, which the test suite asserts by comparing
the full mask before and after a round trip.

## Bone workflow

The four operations the brief asks for map onto this machinery:

- **Bone Threshold** — `suggestBoneThreshold` walks up the smoothed histogram from 150 HU
  and takes the **first genuine valley**: a local minimum whose smoothed count rises again
  by at least 10 % within the next 150 HU. That is the boundary between the soft-tissue
  tail and the start of bone.

  A naive "lowest bin in a window" search is wrong on CT and was the first version of this
  code. On a real head CT the histogram keeps falling well past the soft-tissue boundary
  and reaches its true minimum at ~850 HU, between trabecular and cortical bone — using
  that as a bone threshold discards most of the skull. On the study in the validation
  report the naive search proposed 676 HU; the valley search proposes 180 HU, with an 18 %
  rise above it.

  Bins below 0.002 % of the volume are ignored so that gaps in a sparse histogram do not
  read as valleys, and the result is floored at 150 HU because below that the same
  attenuation covers acute haemorrhage, contrast and dense soft tissue. If no valley
  exists at all, the threshold is derived from the 99th percentile instead and the
  rationale says so.

  The number and the reasoning are both shown, and it is a suggestion the user applies —
  never applied silently.
- **Bone Extraction** — threshold, then connected-component filtering to drop clips,
  calcifications and noise below a voxel count, or to keep only the N largest structures.
- **Keep Bone** — hide everything not carrying the bone label.
- **Bone Suppression / Remove Bone** — hide everything carrying the label, after a
  one-voxel dilation so partial-volume rim voxels go with the bone they belong to.

```
CTA study ──► threshold at the suggested HU ──► drop components < N voxels
                                                        │
                                                        ▼
                                              remove bone label from visibility
                                                        │
                                                        ▼
                                            vascular preset ──► vessel-focused 3D view
```

The panel carries a standing warning that thresholding separates attenuation ranges, not
anatomy: dense contrast, metal and calcification share the bone range and are affected
too. Nothing in this pipeline claims to identify a vessel; that would require actual
segmentation with a vascular model, which this prototype does not have.

## Segmentation objects

Up to 255 concurrent objects, each with a name, colour, opacity, visibility flag, an
origin (`threshold` / `region-grow` / `connected-component` / `bounding-box` / `manual` /
`imported`) and the parameters that produced it, so a result can be reproduced. Statistics
per object: voxel count, physical volume in mm³/mL, index bounds, and mean/min/max HU
inside the mask.

Segment volume is exact for the mask — voxel count × voxel volume — but the mask depends
on the threshold the operator chose. The measurement panel says so next to the number.

## Multi-layer rendering

The layer model is not bone-specific. A scene composes:

```
CT volume (masked)
  + N segmentation objects   (rendered as iso-surfaces of their binary masks)
  + N iso-surfaces of the volume
  + measurement overlay (SVG, projected from world coordinates)
  + orientation cube
```

Adding a lesion, an implant or a vessel tree is adding another named layer, not changing
the renderer.
