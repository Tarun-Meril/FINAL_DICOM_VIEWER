import { Vector3 } from '../../3d/math/Vector3';
import { OrganSegmentationAI, TumorSegmentationAI } from '../ai/applications/segmentation/OrganSegmentationAI';
import { LungNoduleDetection, BrainHemorrhageDetection } from '../ai/applications/detection/LungNoduleDetection';
import { DiseaseClassifier } from '../ai/applications/classification/DiseaseClassifier';
import { AutoRECIST } from '../ai/applications/measurements/AutoRECIST';
import { WorklistPrioritizer } from '../ai/applications/prioritization/WorklistPrioritizer';
import { AISummaryGenerator } from '../ai/applications/reporting/AISummaryGenerator';
import { VisionLanguageBridge, AIWorkflowManager } from '../ai/applications/orchestration/AIWorkflowManager';
import { EnterpriseClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 24 Enterprise AI Clinical Platform & Intelligent Assistance ---');

const dims = new Vector3(32, 32, 32);

// 1. AI Organ & Tumor Segmentation Test
const organSeg = OrganSegmentationAI.segmentOrgan('Liver', dims);
assert(organSeg.organName === 'Liver' && organSeg.confidenceScore > 0.9, 'OrganSegmentationAI failed');
const tumorSeg = TumorSegmentationAI.segmentTumor('Glioblastoma', dims);
assert(tumorSeg.organName === 'Glioblastoma', 'TumorSegmentationAI failed');
console.log('✓ AI Organ & Tumor Segmentation test passed');

// 2. AI Abnormality & Lesion Detection Test
const nodules = LungNoduleDetection.detectNodules(dims);
assert(nodules.length === 1 && nodules[0].type === 'lung_nodule', 'LungNoduleDetection failed');
const hemorrhages = BrainHemorrhageDetection.detectHemorrhage(dims);
assert(hemorrhages.length === 1 && hemorrhages[0].isCritical === true, 'BrainHemorrhageDetection failed');
console.log('✓ AI Abnormality & Lesion Detection test passed');

// 3. AI Disease & Risk Classification Test
const classification = DiseaseClassifier.classify('CT', 'Lungs');
assert(classification.severity === 'Moderate' && classification.riskCategory === 'High Risk', 'DiseaseClassifier failed');
console.log('✓ AI Disease & Risk Classification test passed');

// 4. Automatic Measurement & RECIST Test
const recist = AutoRECIST.extractRECIST(new Vector3(16, 16, 16), 10);
assert(recist.longestAxialDiameterMm === 20 && recist.perpendicularDiameterMm === 16, 'AutoRECIST diameter calculation failed');
console.log('✓ Automatic Measurement & RECIST 1.1 test passed');

// 5. Worklist Prioritization & Triage Test
const triageStat = WorklistPrioritizer.prioritizeStudy('study-1', 'Patient A', hemorrhages);
assert(triageStat.triagePriority === 'STAT / Emergency' && triageStat.priorityScore === 95, 'WorklistPrioritizer emergency triage failed');
console.log('✓ Worklist Prioritization & Emergency Triage test passed');

// 6. AI Draft Report & Impression Generator Test
const draft = AISummaryGenerator.generateDraftReport('study-1', hemorrhages);
assert(draft.impressionDraft.includes('CRITICAL FINDING'), 'AISummaryGenerator draft report failed');
console.log('✓ AI Draft Report & Impression Generator test passed');

// 7. Multimodal AI & Vision-Language Bridge Test
const caption = VisionLanguageBridge.generateVisionLanguageCaption(nodules[0]);
assert(caption.includes('Vision-Language AI caption'), 'VisionLanguageBridge caption failed');
console.log('✓ Multimodal AI & Vision-Language Bridge test passed');

// 8. Public Enterprise Clinical Facade Integration Test
const facade = new EnterpriseClinicalFacade();
const segRes = facade.runAISegmentation('Kidney', dims);
assert(segRes.organName === 'Kidney', 'EnterpriseClinicalFacade runAISegmentation failed');

const detRes = facade.runAIDetection(dims);
assert(detRes.length === 1, 'EnterpriseClinicalFacade runAIDetection failed');

const classRes = facade.runAIClassification('CT', 'Brain');
assert(classRes.primaryDisease === 'Acute Stroke', 'EnterpriseClinicalFacade runAIClassification failed');

const triageRes = facade.prioritizeWorklist('study-100', 'RUKHMABEN MISTRY', dims);
assert(triageRes.triagePriority !== undefined, 'EnterpriseClinicalFacade prioritizeWorklist failed');

const draftRes = facade.generateDraftReport('study-100');
assert(draftRes.findingsDraft.length > 0, 'EnterpriseClinicalFacade generateDraftReport failed');
console.log('✓ EnterpriseClinicalFacade Public API test passed');
