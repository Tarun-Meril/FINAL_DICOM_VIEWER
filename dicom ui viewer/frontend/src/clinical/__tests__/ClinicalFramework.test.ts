import { ClinicalEngine } from '../engine/ClinicalEngine';
import { StudyInfo } from '../engine/StudyContext';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { AnnotationManager } from '../annotations/AnnotationManager';
import { BookmarkManager } from '../bookmarks/BookmarkManager';
import { MeasurementCoordinator } from '../measurements/MeasurementCoordinator';
import { ReportContext } from '../reports/ReportContext';
import { HangingProtocolEngine } from '../hanging/HangingProtocolEngine';
import { ClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 20.5 Enterprise Clinical Application Framework ---');

const mockStudy: StudyInfo = {
  studyInstanceUid: '1.2.840.10008.1.1',
  patient: { id: 'P001', name: 'RUKHMABEN MISTRY', sex: 'F', birthDate: '1965-01-01' },
  studyDate: '2025-12-09',
  studyDescription: 'MRI CARDIAC',
  modalities: ['MR'],
  seriesList: [
    {
      seriesInstanceUid: '1.2.840.10008.1.2',
      studyInstanceUid: '1.2.840.10008.1.1',
      seriesNumber: 101,
      modality: 'MR',
      description: 'Series 101 Axial',
      numberOfInstances: 60
    }
  ]
};

// 1. Clinical Engine & Study Context Test
const engine = new ClinicalEngine();
engine.openStudy(mockStudy);
assert(engine.context.activeStudy?.studyInstanceUid === '1.2.840.10008.1.1', 'ClinicalEngine openStudy failed');
assert(engine.context.activeSeriesUid === '1.2.840.10008.1.2', 'ClinicalEngine series selection failed');
console.log('✓ ClinicalEngine & StudyContext test passed');

// 2. Workflow Manager Test
const workflow = new WorkflowManager();
workflow.setStep('MEASUREMENT');
assert(workflow.state.currentStep === 'MEASUREMENT', 'WorkflowManager step transition failed');
console.log('✓ WorkflowManager test passed');

// 3. Annotation Manager Test
const annMgr = new AnnotationManager();
const ann = annMgr.createTextAnnotation('1.2.840.10008.1.1', '1.2.840.10008.1.2', 15, [[10, 10]], 'Myocardial Scar');
assert(ann.label === 'Myocardial Scar', 'AnnotationManager creation failed');
assert(annMgr.storage.getBySeries('1.2.840.10008.1.2').length === 1, 'AnnotationStorage retrieval failed');
console.log('✓ AnnotationManager & Storage test passed');

// 4. Bookmark System Test
const bmManager = new BookmarkManager();
const bm = bmManager.createBookmark('LV Short Axis View', '1.2.840.10008.1.1', '1.2.840.10008.1.2', [0, 0, 500], [0, 0, 0], 25);
assert(bm.name === 'LV Short Axis View', 'BookmarkManager creation failed');
console.log('✓ BookmarkManager test passed');

// 5. Clinical Measurement Test
const measCoord = new MeasurementCoordinator();
const meas = measCoord.addDistanceMeasurement('1.2.840.10008.1.1', '1.2.840.10008.1.2', 42.5, [[0, 0], [10, 10]]);
assert(meas.value === 42.5 && meas.unit === 'mm', 'MeasurementCoordinator distance calculation failed');
console.log('✓ MeasurementCoordinator test passed');

// 6. Structured Reporting & Findings Test
const report = new ReportContext();
report.studyInstanceUid = '1.2.840.10008.1.1';
report.patientName = 'RUKHMABEN MISTRY';
report.impression = 'Normal cardiac MRI with excellent LV ejection fraction.';
assert(report.impression.includes('Normal cardiac'), 'ReportContext impression test failed');
console.log('✓ ReportContext & Findings test passed');

// 7. Hanging Protocol Matching Test
const hanging = new HangingProtocolEngine();
const protocol = hanging.matchProtocol('CT', 'CT CHEST');
assert(protocol.suggestedLayout === '2x2', 'HangingProtocolEngine CT matching failed');
console.log('✓ HangingProtocolEngine test passed');

// 8. Clinical Facade Test
const facade = new ClinicalFacade();
facade.openStudy(mockStudy);
assert(facade.engine.context.activeStudy !== null, 'ClinicalFacade openStudy failed');
console.log('✓ ClinicalFacade public API test passed');
