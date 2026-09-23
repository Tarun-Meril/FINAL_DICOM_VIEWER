import { ClinicalCase, ClinicalPatient, ClinicalFindingData } from '../model/ClinicalCase';
import { WorkflowEngine } from '../workflow/WorkflowEngine';
import { LongitudinalAnalysis } from '../comparison/StudyComparison';
import { DicomMapping } from '../interop/InteroperabilityEngine';
import { FindingRepository } from '../findings/FindingRepository';
import { ClinicalTimeline } from '../timeline/ClinicalTimeline';
import { ClinicalValidator } from '../validation/ClinicalValidator';
import { EnterpriseClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 22.5 Enterprise Clinical Data Model & Interoperability Platform ---');

const patient: ClinicalPatient = { id: 'P001', name: 'RUKHMABEN MISTRY', sex: 'F', birthDate: '1965-01-01' };

// 1. Clinical Case & Data Model Test
const clinicalCase = new ClinicalCase('case-100', patient);
assert(clinicalCase.patient.name === 'RUKHMABEN MISTRY', 'ClinicalCase patient name failed');
console.log('✓ Clinical Case & Unified Data Model test passed');

// 2. Finding Repository & Data Model Test
const findingRepo = new FindingRepository();
const mockFinding: ClinicalFindingData = {
  id: 'f-1',
  title: 'Myocardial Infarction',
  category: 'Cardiac',
  severity: 'severe',
  status: 'active',
  description: 'Subendocardial infarction observed in LV wall.',
  measurements: [],
  observations: [],
  createdAt: new Date().toISOString()
};
findingRepo.addFinding(mockFinding);
assert(findingRepo.getByCategory('Cardiac').length === 1, 'FindingRepository retrieval failed');
console.log('✓ Finding Repository & Classification test passed');

// 3. Workflow Engine State Transitions Test
const wfEngine = new WorkflowEngine();
wfEngine.transitionTo('REVIEW');
wfEngine.transitionTo('MEASUREMENT');
assert(wfEngine.currentStage === 'MEASUREMENT', 'WorkflowEngine transition failed');
assert(wfEngine.getHistory().length === 2, 'WorkflowEngine history tracking failed');
console.log('✓ Workflow Engine End-to-End state transitions test passed');

// 4. Longitudinal Lesion Growth Comparison Test (RECIST 1.1)
const compRes = LongitudinalAnalysis.compareLesions('lesion-1', 'Aortic Aneurysm', 100, 130);
assert(compRes.volumeChangePercentage === 30, 'LongitudinalAnalysis percentage calculation failed');
assert(compRes.responseCategory === 'PD', 'LongitudinalAnalysis RECIST 1.1 Progressive Disease classification failed');
console.log('✓ Longitudinal Lesion Comparison & RECIST 1.1 test passed');

// 5. DICOM Interoperability Mapping Test
const dicomSr = DicomMapping.toDicomSR(mockFinding);
assert(dicomSr.ConceptNameCodeSequence.CodeMeaning === 'Finding', 'DicomMapping toDicomSR failed');
console.log('✓ DICOM Interoperability & SR Mapping test passed');

// 6. Clinical Timeline Chronology Test
clinicalCase.addFinding(mockFinding);
const timeline = ClinicalTimeline.generateTimeline(clinicalCase);
assert(timeline.length === 1 && timeline[0].type === 'finding', 'ClinicalTimeline generation failed');
console.log('✓ Patient Clinical Timeline generation test passed');

// 7. Clinical Case Validator Test
const validationIssues = ClinicalValidator.validateCase(clinicalCase);
assert(validationIssues.length === 1 && validationIssues[0].code === 'MISSING_ACTIVE_STUDY', 'ClinicalValidator missing study check failed');
console.log('✓ Clinical Case Validator & Consistency Checker test passed');

// 8. Public Enterprise Clinical Facade Test
const facade = new EnterpriseClinicalFacade();
facade.createCase(patient);
facade.addFinding(mockFinding);
assert(facade.activeCase?.findings.length === 1, 'EnterpriseClinicalFacade addFinding failed');
assert(facade.validateClinicalCase().length === 1, 'EnterpriseClinicalFacade validateClinicalCase failed');
console.log('✓ EnterpriseClinicalFacade public API test passed');
