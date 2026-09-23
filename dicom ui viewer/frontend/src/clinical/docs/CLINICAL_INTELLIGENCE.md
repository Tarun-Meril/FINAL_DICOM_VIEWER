# MedView PRO — Enterprise Clinical Intelligence & Decision Support Platform (Phase 23.5)

## Overview
Phase 23.5 introduces an Enterprise Clinical Intelligence layer under `frontend/src/clinical/intelligence/` responsible for quantitative Biomarkers, Clinical Decision Support, RADS Scoring (CAD-RADS, Lung-RADS, PI-RADS, LI-RADS, BI-RADS), Confidence Management, Decision Explainability, Study Quality Assessment, and Automated Clinical Summary generation.

## Directory Architecture (`frontend/src/clinical/intelligence/`)

```
frontend/src/clinical/intelligence/
    audit/              # DecisionAudit & DecisionHistory (Audit trails for recommendations and overrides)
    biomarkers/         # BiomarkerEngine, BiomarkerCalculator (Organ/Lesion volumes, Stenosis %, CAC scores, BMD)
    confidence/         # ConfidenceEngine & QualityAssessment (Confidence scores 0..1 and evidence weighting)
    decisionSupport/    # DecisionSupportEngine, ClinicalRuleEngine (ACR/ACC rule evaluations & urgent alerts)
    explainability/     # ExplainabilityEngine, ExplanationBuilder (Transparent reasoning chains linking evidence to guidelines)
    findings/           # FindingAggregator & ClinicalSummary (Automated clinical summary reports)
    knowledge/          # ClinicalKnowledgeBase, GuidelineRepository (Fleischner, Lung-RADS, CAD-RADS rules)
    orchestration/      # IntelligenceOrchestrator (Master clinical intelligence coordinator)
    quality/            # StudyQualityEngine & ImageQualityAssessment (Motion artifacts, slice completeness)
    scoring/            # ClinicalScoringEngine (Lung-RADS 1..4B, CAD-RADS 0..5, PI-RADS, LI-RADS, BI-RADS)
```

## Public API Usage
```typescript
const clinical = new EnterpriseClinicalFacade();

// 1. Calculate Vascular Stenosis & Auto-Register Biomarker
clinical.startVascularWorkflow('LAD', 5.0, 1.25, points);

// 2. Retrieve Computed Biomarkers
const biomarkers = clinical.computeBiomarkers();

// 3. Evaluate Decision Support Recommendations
const recommendations = clinical.generateRecommendations();
// e.g. Urgent Vascular Surgery Referral for severe 75% LAD Stenosis

// 4. Compute RADS Scoring (e.g. Lung-RADS)
const score = clinical.computeClinicalScore(16.0); // Lung-RADS 4B Very High Risk Nodule

// 5. Evaluate Study DICOM Quality
const quality = clinical.assessStudyQuality(120, 1.25);

// 6. Generate Automated Clinical Summary
const summary = clinical.generateClinicalSummary('P001');
```
