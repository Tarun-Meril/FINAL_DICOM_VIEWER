# MedView PRO — Enterprise Segmentation, Surface Modeling & Quantification Platform (Phase 22)

## Overview
Phase 22 introduces a clinical segmentation, surface extraction (Marching Cubes & Flying Edges), label map management, mesh exporter (STL, OBJ, PLY, GLTF), and quantitative analysis platform in `frontend/src/clinical/segmentation/`.

## Directory Architecture (`frontend/src/clinical/segmentation/`)

```
frontend/src/clinical/segmentation/
    algorithms/         # Threshold, Region Growing, Connected Components, Watershed, LiveWire, GraphCut
    editing/            # Sphere Paint Brush, Smart Brush, Eraser, Morphological Erosion/Dilation/Opening/Closing
    interpolation/      # Shape-based contour slice interpolation
    labels/             # LabelMap 3D masks, LabelManager, SegmentHierarchy
    mesh/               # MeshManager, MeshMeasurements (Area/Volume), STL/OBJ/PLY/GLTF Exporters
    quantification/     # QuantificationEngine (HU min, max, mean, stdDev, volume cm3, centroid)
    surface/            # SurfaceGenerator, Marching Cubes, Flying Edges, Mesh Decimator, Laplacian Smoother
    validation/         # SegmentationValidator mask topology checks
    SegmentationEngine.ts # Master Segmentation Orchestrator
```

## Public API Usage
```typescript
const clinical = new ExtendedClinicalFacade();

// 1. Create Label Map
const labelMap = clinical.createSegmentation(dims);

// 2. Interactive Brush Edit
clinical.editSegmentation(new Vector3(16, 16, 16), 5, 1);

// 3. Generate 3D Isosurface Mesh
const mesh = clinical.generateSurface(1);

// 4. Compute Quantitative HU & Volumetric Statistics
const stats = clinical.computeStatistics(scalarData, dims, spacingMm, 1);

// 5. Export 3D Mesh
const stlBinary = clinical.exportMesh(1, 'stl');
```
