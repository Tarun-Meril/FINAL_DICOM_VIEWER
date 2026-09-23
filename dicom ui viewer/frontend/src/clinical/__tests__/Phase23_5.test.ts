import { Vector3 } from '../../3d/math/Vector3';
import { BiomarkerCalculator, BiomarkerEngine } from '../intelligence/biomarkers/BiomarkerEngine';
import { DecisionSupportEngine, ClinicalRuleEngine } from '../intelligence/decisionSupport/DecisionSupportEngine';
import { ClinicalScoringEngine } from '../intelligence/scoring/ClinicalScoringEngine';
import { StudyQualityEngine, ConfidenceEngine } from '../intelligence/quality/StudyQualityEngine';
import { ExplainabilityEngine } from '../intelligence/explainability/ExplainabilityEngine';
import { ClinicalSummary } from '../intelligence/findings/ClinicalSummary';
import { IntelligenceOrchestrator } from '../intelligence/orchestration/IntelligenceOrchestrator';
import { EnterpriseClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 23.5 Enterprise Clinical Intelligence & Decision Support Platform ---');

// 1. Biomarker Engine Test
const organBm = BiomarkerCalculator.calculateOrganVolumeBiomarker('Liver', 1650, 1200, 1500);
assert(organBm.value === 1650 && organBm.isAbnormal === true, 'BiomarkerCalculator organ volume failed');

const vesselBm = BiomarkerCalculator.calculateVesselStenosisBiomarker('LAD', 75);
assert(vesselBm.value === 75 && vesselBm.isAbnormal === true, 'BiomarkerCalculator vessel stenosis failed');
console.log('✓ Biomarker Engine & Registry test passed');

// 2. Decision Support & Clinical Rules Test
const rulesRes = ClinicalRuleEngine.evaluateRules([vesselBm]);
assert(rulesRes.length === 1 && rulesRes[0].urgency === 'Urgent', 'ClinicalRuleEngine severe stenosis rule failed');
console.log('✓ Decision Support Engine & Clinical Rules test passed');

// 3. RADS Clinical Scoring Framework Test
const lungRads = ClinicalScoringEngine.computeLungRads(16);
assert(lungRads.scoreCode === 'Lung-RADS 4B', 'ClinicalScoringEngine Lung-RADS 4B failed');
const lungRads3 = ClinicalScoringEngine.computeLungRads(7);
assert(lungRads3.scoreCode === 'Lung-RADS 3', 'ClinicalScoringEngine Lung-RADS 3 failed');
console.log('✓ RADS Clinical Scoring Framework (Lung-RADS, CAD-RADS) test passed');

// 4. Study Quality & Confidence Assessment Test
const qualityReport = StudyQualityEngine.evaluateQuality(120, 1.25);
assert(qualityReport.overallQualityScore === 100 && qualityReport.qualityPassed === true, 'StudyQualityEngine quality evaluation failed');
const conf = ConfidenceEngine.computeConfidence(95, 2);
assert(conf > 0.9, 'ConfidenceEngine calculation failed');
console.log('✓ Study Quality Evaluator & Confidence Scoring test passed');

// 5. Decision Explainability Reasoning Chain Test
const explanation = ExplainabilityEngine.buildExplanation(rulesRes[0], [vesselBm]);
assert(explanation.evidenceBiomarkers.length === 1, 'ExplainabilityEngine evidence collection failed');
assert(explanation.reasoningSteps.length === 1, 'ExplainabilityEngine reasoning step generation failed');
console.log('✓ Decision Explainability & Reasoning Chain test passed');

// 6. Clinical Summary Generator Test
const summary = ClinicalSummary.generateSummary('P001', [organBm, vesselBm], rulesRes);
assert(summary.patientId === 'P001' && summary.keyBiomarkers.length === 2, 'ClinicalSummary report generation failed');
console.log('✓ Clinical Summary Generator test passed');

// 7. Intelligence Orchestrator & Public Facade Test
const facade = new EnterpriseClinicalFacade();
facade.startVascularWorkflow('LAD', 5.0, 1.25, [new Vector3(0, 0, 0), new Vector3(0, 0, 10)]);
const bms = facade.computeBiomarkers();
assert(bms.length === 1 && bms[0].value === 75, 'EnterpriseClinicalFacade computeBiomarkers failed');

const recs = facade.generateRecommendations();
assert(recs.length === 1, 'EnterpriseClinicalFacade generateRecommendations failed');

const qual = facade.assessStudyQuality(100, 1.0);
assert(qual.qualityPassed === true, 'EnterpriseClinicalFacade assessStudyQuality failed');

const sumRep = facade.generateClinicalSummary('P001');
assert(sumRep.recommendations.length === 1, 'EnterpriseClinicalFacade generateClinicalSummary failed');
console.log('✓ EnterpriseClinicalFacade Public API test passed');
