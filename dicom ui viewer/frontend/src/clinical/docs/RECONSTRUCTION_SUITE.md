# MedView PRO — Advanced Reconstruction & Multi-Planar Imaging Suite (Phase 21 & Phase 21.5)

## Overview
Phase 21 & Phase 21.5 expand the Clinical Application Framework in `frontend/src/clinical/` with Frenet-Frame Curved Planar Reconstruction (CPR), Oblique/Double-Oblique MPR, Thick Slab rendering, Image Filters, PET/CT Fusion LUTs, Volume Registration Metrics, Background Reconstruction Workers, and a unified **Shared Enterprise Clinical Tools Framework**.

## Directory Architecture (`frontend/src/clinical/`)

```
frontend/src/clinical/
    benchmarks/         # Clinical Benchmarks (CPR, Registration, Fusion, MPR)
    cine/               # Timed Cine Playback Engine & Timelines
    cpr/
        centerline/     # 3D Centerline Editor (Add, Move, Delete, Smooth, Undo)
        engine/         # CPREngine & Resampling Pipeline
        geometry/       # Frenet Frame Geometry (Tangent, Normal, Binormal orthograde vectors)
        sampling/       # Curved Resampler & Slice Generator
        viewport/       # CPR Viewport Engine
    filters/            # Image Filters (Sharpen, Smooth, Median, Edge Enhance)
    fusion/             # Fusion Engine & Thermal/Rainbow LUT Palettes
    mpr/                # Oblique/Double-Oblique MPR & Thick Slab (MIP, MinIP, Average)
    reconstruction/     # Multi-Stage Reconstruction Pipeline & Post-Processing
    registration/       # Rigid/Affine/Deformable Registration & Quantitative Metrics (SSD, NCC, TRE)
    synchronization/    # Multi-Series Sync Profiles (Radiology, Cardiology, PET-CT)
    tools/              # Phase 21.5 Shared Enterprise Clinical Tools (Crosshair, Spline, Brush, MagicWand)
    toolstate/          # Tool History Stack (UndoStack/RedoStack, ToolSettings)
    workers/            # Web Worker Abstractions (ReconstructionWorker, CPRWorker)
    index.ts            # Public Extended Clinical Facade API
```

## Frenet Frame Geometry
Prevents 3D centerline twisting along curved vessel paths:
$$\mathbf{T} = \frac{d\mathbf{P}}{ds}, \quad \mathbf{N} = \frac{d\mathbf{T}}{ds}, \quad \mathbf{B} = \mathbf{T} \times \mathbf{N}$$
