# MedView PRO — Enterprise Clinical Framework & Workflow Foundation

## Overview
Phase 20.5 establishes the clinical application framework layer (`frontend/src/clinical/`) that sits between the 3D Rendering Engine (`frontend/src/3d/`) and the user interface. It provides decoupled infrastructure for Study Contexts, Workflow Management, Viewport Synchronization, Annotation/Bookmark persistence, Quantitative Measurements, Structured Reporting, and Hanging Protocol execution.

## Clinical Module Directory Structure

```
frontend/src/clinical/
    annotations/        # Clinical Annotation Storage & Manager (Undo/Redo, JSON Export)
    bookmarks/          # Camera & Slice Position Bookmark System
    docs/               # Clinical Framework Documentation
    engine/             # Study Context, Session & Clinical Engine Orchestrator
    events/             # Decoupled Clinical Event Bus (STUDY_LOADED, MEASUREMENT_ADDED, etc.)
    hanging/            # Automated DICOM Hanging Protocol Engine
    measurements/       # Clinical Measurement Storage & Coordinator (Distance, Angle, Area)
    presets/            # Clinical Preset Manager
    reports/            # Diagnostic Report Context & Finding Manager
    services/           # Coordinate & Navigation Services (Cine playback, 3D LPS conversion)
    viewport/           # Viewport, Layout & Crosshair Sync Coordinators
    workflow/           # Clinical Workflow State Machine (Viewing, Annotation, 3D, Reporting)
    index.ts            # Public Clinical API Facade (clinical.openStudy(), clinical.saveBookmark())
```

## Reusable Public APIs
```typescript
const clinical = new ClinicalFacade();

// Open DICOM Study
clinical.openStudy(studyInfo);

// Save camera/slice bookmark
const bookmark = clinical.saveBookmark('Aortic Arch View', studyUid, seriesUid, camPos, targetPos, sliceIdx);

// Generate Structured Report Context
const report = clinical.generateReportContext();
```
