import { Vector3 } from '../../3d/math/Vector3';
import { StenosisAnalysis, VesselTortuosity, PlaqueAnalysis } from '../applications/vascular/VesselAnalysisEngine';
import { CalciumScoring } from '../applications/cardiac/CardiacWorkflow';
import { AneurysmWorkflow } from '../applications/neuro/NeuroWorkflow';
import { VirtualBronchoscopy } from '../applications/pulmonary/PulmonaryWorkflow';
import { FlyThroughEngine } from '../applications/gastrointestinal/VirtualColonoscopy';
import { FractureMeasurements } from '../applications/orthopedic/BoneWorkflow';
import { SafetyMargins } from '../applications/surgical/SurgicalPlanning';
import { EnterpriseClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 23 Enterprise Advanced Clinical Applications Platform ---');

// 1. Vascular CTA Stenosis % & Tortuosity Test
const stenRes = StenosisAnalysis.calculateStenosis('Left Main Coronary', 5.0, 1.5);
assert(stenRes.diameterStenosisPercentage === 70, 'StenosisAnalysis diameter stenosis calculation failed');
assert(stenRes.severityCategory === 'Severe', 'StenosisAnalysis severity classification failed');

const path = [new Vector3(0, 0, 0), new Vector3(5, 5, 0), new Vector3(10, 0, 0)];
const tortuosity = VesselTortuosity.computeTortuosityIndex(path);
assert(tortuosity > 1.0, 'VesselTortuosity index calculation failed');

const plaqueType = PlaqueAnalysis.characterizePlaque(450);
assert(plaqueType === 'Calcified Plaque', 'PlaqueAnalysis characterization failed');
console.log('✓ Vascular CTA Suite (Stenosis %, Tortuosity, Plaque) test passed');

// 2. Cardiac Calcium Scoring & CAD-RADS Test
const calcRes = CalciumScoring.calculateAgatstonScore([
  { peakHu: 450, areaMm2: 25 },
  { peakHu: 320, areaMm2: 10 }
]);
assert(calcRes.agatstonScore === 130, 'CalciumScoring Agatston score calculation failed');
assert(calcRes.cadRadsCategory === 'CAD-RADS 3', 'CalciumScoring CAD-RADS classification failed');
console.log('✓ Cardiac Imaging Suite & Agatston Calcium Scoring test passed');

// 3. Neuro Aneurysm Analysis Test
const neurRes = AneurysmWorkflow.analyzeAneurysm('aneurysm-1', 8.5, 3.0);
assert(neurRes.domeToNeckRatio > 2.0, 'AneurysmWorkflow neck ratio calculation failed');
assert(neurRes.ruptureRiskCategory === 'High', 'AneurysmWorkflow rupture risk failed');
console.log('✓ Neuro Radiologic Suite & Aneurysm Analysis test passed');

// 4. Virtual Bronchoscopy Camera Path Test
const broncho = new VirtualBronchoscopy();
const frames = broncho.generatePath([new Vector3(0, 0, 0), new Vector3(0, 0, 10), new Vector3(0, 0, 20)]);
assert(frames.length === 3 && frames[0].branchName === 'Main Trachea', 'VirtualBronchoscopy camera path failed');
console.log('✓ Pulmonary Suite & Virtual Bronchoscopy test passed');

// 5. Virtual Colonoscopy Fly-Through Engine Test
const flyEngine = new FlyThroughEngine();
assert(flyEngine.isFlying === false, 'FlyThroughEngine initial state failed');
console.log('✓ Gastrointestinal Suite & Virtual Colonoscopy Fly-Through test passed');

// 6. Orthopedic Fracture Measurement Test
const fxMetrics = FractureMeasurements.calculateDisplacement(new Vector3(0, 0, 0), new Vector3(12, 0, 0));
assert(fxMetrics.displacementDistanceMm === 12, 'FractureMeasurements displacement calculation failed');
console.log('✓ Orthopedic Suite & Fracture Measurement test passed');

// 7. Surgical Planning & Safety Margin Evaluation Test
const marginRes = SafetyMargins.evaluateMargin(new Vector3(0, 0, 0), new Vector3(15, 0, 0), 10);
assert(marginRes.marginMm === 15 && marginRes.isSafe === true, 'SafetyMargins evaluation failed');
console.log('✓ Surgical Planning & Safety Margin Evaluation test passed');

// 8. Public Enterprise Clinical Facade Test
const facade = new EnterpriseClinicalFacade();
const vSten = facade.startVascularWorkflow('RCA', 4.0, 2.0, path);
assert(vSten.diameterStenosisPercentage === 50, 'EnterpriseClinicalFacade startVascularWorkflow failed');
const cCalc = facade.startCardiacWorkflow([{ peakHu: 450, areaMm2: 25 }]);
assert(cCalc.agatstonScore === 100, 'EnterpriseClinicalFacade startCardiacWorkflow failed');
console.log('✓ EnterpriseClinicalFacade public API test passed');
