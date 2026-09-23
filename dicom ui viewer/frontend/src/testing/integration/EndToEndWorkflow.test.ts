import { Vector3 } from '../../3d/math/Vector3';
import { EnterpriseClinicalFacade } from '../../clinical/index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

export class EndToEndWorkflowTest {
  public static async runFullClinicalJourney(): Promise<boolean> {
    console.log('  -> Executing End-to-End Clinical Journey Test...');
    const clinical = new EnterpriseClinicalFacade();

    // 1. Open Patient Case
    const patientCase = clinical.createCase({ id: 'P001', name: 'RUKHMABEN MISTRY', sex: 'F' });
    assert(patientCase.patient.id === 'P001', 'E2E Step 1: Patient case creation failed');

    // 2. Load DICOM Study & Series
    clinical.openStudy({
      studyInstanceUid: '1.2.840.10008.1.1',
      patient: patientCase.patient,
      studyDate: '2025-12-09',
      studyDescription: 'CT CHEST ABDOMEN',
      modalities: ['CT'],
      seriesList: [
        {
          seriesInstanceUid: '1.2.840.10008.1.2',
          studyInstanceUid: '1.2.840.10008.1.1',
          seriesNumber: 1,
          modality: 'CT',
          description: 'Axial Contrast 1mm',
          numberOfInstances: 512
        }
      ]
    });
    assert(clinical.engine.context.activeSeriesUid === '1.2.840.10008.1.2', 'E2E Step 2: Study load failed');

    // 3. Generate Oblique MPR Slice
    const obliquePlane = clinical.createObliqueMPR(45, 90);
    assert(obliquePlane.pitchDeg === 45, 'E2E Step 3: Oblique MPR calculation failed');

    // 4. Generate Frenet-Frame CPR
    const cpr = clinical.createCPR();
    cpr.editor.addPoint(new Vector3(0, 0, 0));
    cpr.editor.addPoint(new Vector3(10, 10, 50));
    const cprRes = cpr.generateCPROutput(new Int16Array(64 * 64 * 64), new Vector3(64, 64, 64));
    assert(cprRes.unfoldedImageWidth > 0, 'E2E Step 4: Frenet CPR generation failed');

    // 5. Segment Organ (Liver) & Generate Marching Cubes 3D Mesh
    const dims = new Vector3(32, 32, 32);
    const mockData = new Int16Array(32 * 32 * 32).fill(-100);
    mockData[16 * 32 * 32 + 16 * 32 + 16] = 300;
    clinical.createSegmentation(dims);
    clinical.editSegmentation(new Vector3(16, 16, 16), 5, 1);
    const mesh = clinical.generateSurface(1);
    assert(mesh !== null && mesh.vertices.length > 0, 'E2E Step 5: 3D Mesh generation failed');

    // 6. Run AI Nodule Detection & Auto-RECIST Measurement
    const aiDetections = clinical.runAIDetection(dims);
    assert(aiDetections.length > 0, 'E2E Step 6: AI nodule detection failed');

    // 7. Calculate Quantitative Biomarkers & Clinical Decision Rules
    clinical.startVascularWorkflow('LAD', 5.0, 1.25, [new Vector3(0, 0, 0), new Vector3(0, 0, 10)]);
    const bms = clinical.computeBiomarkers();
    assert(bms.length === 1 && bms[0].value === 75, 'E2E Step 7: Biomarker computation failed');
    const recs = clinical.generateRecommendations();
    assert(recs.length === 1 && recs[0].urgency === 'Urgent', 'E2E Step 7: Decision rule evaluation failed');

    // 8. Generate Draft Structured Report & Export STL Mesh
    const draftReport = clinical.generateDraftReport('1.2.840.10008.1.1');
    assert(draftReport.findingsDraft.length > 0, 'E2E Step 8: Draft report generation failed');
    const stlBytes = clinical.exportMesh(1, 'stl');
    assert(stlBytes !== null && stlBytes.length > 0, 'E2E Step 8: STL Mesh export failed');

    console.log('  ✓ End-to-End Clinical Journey Test PASSED (100% Steps Verified)');
    return true;
  }
}
