# Performance

## Where time goes

| Stage | Thread | Cost driver |
|---|---|---|
| Archive expansion | `scanWorker` | Compressed bytes |
| Header parsing | `scanWorker` | File count |
| Frame decoding | `decodeWorker` × *n* | Slice count × matrix; dominant for compressed studies |
| Volume assembly | main | One `set()` per slice; negligible |
| Statistics | `statsWorker` | One pass over the volume |
| Texture upload | GPU driver | Voxels × 4 bytes |
| First render | GPU | Viewport pixels × samples per ray |
| Interactive frames | GPU | Same, at the interactive step |

## Measured baseline

Measured on the supplied study (Philips Ingenuity CT head, 250 slices, 512 × 512,
0.766 × 0.766 × 1.0 mm, JPEG 2000 lossless, 65.5 Mvoxel / 131 MB as Int16) in a 2-vCPU
Linux container with **no GPU**.

### Ingestion — representative

| Stage | Node, single thread | Browser (worker pool, 1 decode worker on 2 vCPUs) |
|---|---|---|
| Archive expansion + header scan of 251 files | 83 ms | 81 ms |
| Series grouping and selection | 6 ms | 2 ms |
| Geometry analysis | 3 ms | 0.4 ms |
| Frame decode + HU conversion, 250 slices | 8.9 s (~35 ms/slice, WASM OpenJPEG) | 11.8 s |
| Statistics + histogram, 65.5 Mvoxel | 811 ms | 1066 ms |
| Geometry conformance (8 checks) | 1 ms | 0.8 ms |
| **Total to a ready volume** | **~10 s** | **~13 s** |

Decode dominates, and it is the stage that scales with cores: this container gives the
pool one worker. On an 8-core machine the same study decodes in roughly 2 s.

### Rendering — NOT representative

| | |
|---|---|
| Frame at `interactive` quality, 947 × 910 | 17.3 s |
| Frame at `high` quality, 947 × 910 | 30.7 s |
| Frame at `export` quality, 947 × 910 (mean of 19) | 72.8 s |
| Texture upload + first frame | absorbed into the first capture (SwiftShader defers GL work until a readback) |

**These are software-rasteriser numbers and must not be read as a performance result.**
The validation host has no GPU, so Chromium falls back to SwiftShader and every ray-cast
sample runs on the CPU. The same pipeline on a discrete or integrated GPU is one to two
orders of magnitude faster; interactive rotation at the `interactive` level is the design
target and is what the adaptive-quality machinery exists for. The ratio between the levels
is meaningful: `interactive` costs 56 % of `high`, which is the point of the switch.

## Segmentation and sculpting, measured on the same volume

| Operation | Cost |
|---|---|
| Bone extraction: threshold at 180 HU + connected components over 65.5 Mvoxel | 1.9 s → 1,518,492 voxels (890 mL) in 240 components |
| Plane cut through the whole volume (32.8 Mvoxel changed) | ~0.5 s |
| Spherical brush, 35 mm radius (155,722 voxels) | ~0.05 s |
| Marching cubes at 300 HU | 6.1 s → 1,597,632 triangles, 3626 cm² |
| Presentation state with the bone mask, RLE + base64 | 2.4 MB |

## Why decode is the cost that matters

For a compressed study, entropy decoding dwarfs everything else. Two decisions follow:

1. **Use the WASM codec builds, not the asm.js fallback.** OpenJPEG's WASM build decodes a
   512² frame in ~35 ms against ~357 ms for the JS build — a 10× difference that turns a
   90-second load into a 9-second one. `codecs.ts` prefers `decodewasmjs` and falls back
   only if that import fails.
2. **Decode in a pool sized to the machine.** `navigator.hardwareConcurrency − 1`, capped
   at 8, with two slices in flight per worker to hide message latency. On a 8-core laptop
   the same study loads in ~3 s.

## Memory

For an *n*-voxel volume:

| Buffer | Bytes |
|---|---|
| Source HU volume | 2 n |
| Display (derived) volume | 2 n |
| Label volume | n |
| Visibility mask | n |
| GPU texture (Float32) | 4 n |
| Undo history | proportional to voxels *changed*, capped at 256 MB |

For the supplied study that is ~131 + 131 + 65 + 65 MB on the CPU and ~262 MB on the GPU.
The label and visibility masks are allocated lazily with the session, not per operation.

## Responsiveness rules

- No full-slice or full-volume loop ever runs on the main thread during load.
- Renders are coalesced to one per animation frame.
- Quality drops to `interactive` on `StartAnimation` and is restored 220 ms after the
  interaction ends.
- Long segmentation operations yield to the event loop before starting and show a busy
  overlay, so the UI never appears frozen.

## Large studies

`chooseDownsampleFactor` keeps the uploaded volume inside both the voxel budget and
`MAX_3D_TEXTURE_SIZE`, growing the factor on the largest axis first. A 512 × 512 × 1600
thin-slice run on a 2048-cap device becomes 512 × 512 × 800 at 2× slice spacing, box
filtered, with the reduction stated in the status bar and recorded in the provenance.
