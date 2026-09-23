# MedView PRO — Enterprise Clinical Data Model, Workflow Orchestration & Interoperability Foundation (Phase 22.5)

## Overview
Phase 22.5 introduces the shared Clinical Data Model, Workflow State Engine, Longitudinal Lesion Tracking, Finding Repository, Patient Timelines, and DICOM SR/Metadata Interoperability layer in `frontend/src/clinical/`.

## Directory Architecture (`frontend/src/clinical/`)

```
frontend/src/clinical/
    comparison/         # LongitudinalAnalysis (RECIST 1.1 % Vol Change), StudyComparison, LesionTracker
    findings/           # FindingRepository & FindingClassifier (Category, Severity, Status)
    interop/            # InteroperabilityEngine & DicomMapping (DICOM SR Concept Sequences, DICOM Tag Mappings)
    model/              # ClinicalCase, ClinicalFinding, ClinicalLesion, ClinicalMeasurement, ClinicalPatient
    timeline/           # ClinicalTimeline (Chronological Patient History Event Generation)
    validation/         # ClinicalValidator & ConsistencyChecker (Case Integrity & Orphan Finding Checks)
    workflow/           # WorkflowEngine (STUDY_OPEN -> REVIEW -> MEASUREMENT -> SEGMENTATION -> REPORTING -> COMPARISON -> APPROVAL -> EXPORT)
    index.ts            # EnterpriseClinicalFacade Public API
```

## Public API Usage
```typescript
const clinical = new EnterpriseClinicalFacade();

// 1. Create Patient Clinical Case
const currentCase = clinical.createCase({ id: 'P001', name: 'RUKHMABEN MISTRY' });

// 2. Add Structured Clinical Finding
clinical.addFinding({
  id: 'f-101',
  title: 'Coronary Stenosis',
  category: 'Cardiac',
  severity: 'moderate',
  status: 'active',
  description: 'Moderate plaque accumulation in LAD artery.',
  measurements: [],
  observations: [],
  createdAt: new Date().toISOString()
});

// 3. Track Longitudinal Lesion Growth (RECIST 1.1)
const comparison = clinical.trackLesion('lesion-01', 'LAD Plaque', 12.0, 15.6);
// returns { volumeChangePercentage: +30%, responseCategory: 'PD' }

// 4. Generate Chronological Patient Timeline
const timeline = clinical.generateTimeline();

// 5. Validate Case Integrity
const issues = clinical.validateClinicalCase();
```
