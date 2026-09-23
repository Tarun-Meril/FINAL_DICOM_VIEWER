/**
 * Phase 10 Enterprise AI, Structured Reporting & Workflow Automation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { DetectionManager } from '../ai/DetectionManager';
import { HeatmapManager } from '../ai/HeatmapManager';
import { ConfidenceManager } from '../ai/ConfidenceManager';
import { ClinicalDecisionManager } from '../ai/ClinicalDecisionManager';
import { StructuredReportManager } from '../reporting/StructuredReportManager';
import { TemplateManager } from '../reporting/TemplateManager';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { CasePriorityManager } from '../workflow/CasePriorityManager';
import { EngineEvents } from '../types/events';

export async function runPhase10UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      passed++;
      logs.push(`✅ PASS: ${testName}`);
    } else {
      failed++;
      logs.push(`❌ FAIL: ${testName}`);
    }
  };

  try {
    const context = new EngineContext(false);

    // 1. Test DetectionManager & Detection Events
    const detectionManager = new DetectionManager(context);
    let detectionEmitted = false;
    context.eventBus.on(EngineEvents.DETECTION_COMPLETED, () => { detectionEmitted = true; });

    const findings = await detectionManager.detectLesions('vol-ct-001', 'NODULE');
    assert(findings.length > 0 && findings[0].confidence > 0.8, 'DetectionManager should perform automated AI lesion detection');
    assert(detectionEmitted === true, 'DetectionManager should emit DETECTION_COMPLETED event');

    // 2. Test HeatmapManager & Activation Maps
    const heatmapManager = new HeatmapManager(context);
    let heatmapEmitted = false;
    context.eventBus.on(EngineEvents.HEATMAP_GENERATED, () => { heatmapEmitted = true; });

    const heatmap = heatmapManager.generateHeatmap('vol-ct-001');
    assert(heatmap.length === 512 * 512, 'HeatmapManager should generate Grad-CAM activation heatmap matrix');
    assert(heatmapEmitted === true, 'HeatmapManager should emit HEATMAP_GENERATED event');

    // 3. Test ConfidenceManager & ClinicalDecisionManager Critical Alerting
    const confidenceManager = new ConfidenceManager();
    confidenceManager.setThreshold(0.9);
    const filtered = confidenceManager.filterFindings(findings);
    assert(filtered.every((f) => f.confidence >= 0.9), 'ConfidenceManager should filter findings by confidence threshold');

    const decisionManager = new ClinicalDecisionManager(context);
    let alertEmitted = false;
    context.eventBus.on(EngineEvents.CRITICAL_FINDING_ALERT, () => { alertEmitted = true; });

    decisionManager.evaluateCriticalFinding('Brain Hemorrhage', '1.2.840.10001');
    assert(alertEmitted === true, 'ClinicalDecisionManager should emit CRITICAL_FINDING_ALERT event for STAT findings');

    // 4. Test StructuredReportManager & TemplateManager
    const reportManager = new StructuredReportManager(context);
    const srReport = reportManager.createReport('1.2.840.10001');
    assert(srReport && srReport.findings.length > 0, 'StructuredReportManager should create structured report');

    const templateManager = new TemplateManager();
    const chestTemplate = templateManager.getTemplate('CHEST_CT');
    assert(chestTemplate !== undefined && chestTemplate.includes('Chest CT'), 'TemplateManager should retrieve structured report template');

    // 5. Test WorkflowManager, CasePriorityManager & HIPAA Audit Trail
    const priorityManager = new CasePriorityManager(context);
    const priority = priorityManager.evaluatePriority('1.2.840.10001', true);
    assert(priority === 'STAT', 'CasePriorityManager should prioritize STAT cases');

    const workflowManager = new WorkflowManager(context);
    let taskAssignedEmitted = false;
    let auditLoggedEmitted = false;

    context.eventBus.on(EngineEvents.WORKFLOW_TASK_ASSIGNED, () => { taskAssignedEmitted = true; });
    context.eventBus.on(EngineEvents.AUDIT_LOGGED, () => { auditLoggedEmitted = true; });

    const task = workflowManager.assignCase('1.2.840.10001', 'rad_dr_smith', 'STAT');
    assert(task && task.assignedRadiologist === 'rad_dr_smith', 'WorkflowManager should assign study case');
    assert(taskAssignedEmitted === true, 'WorkflowManager should emit WORKFLOW_TASK_ASSIGNED event');
    assert(auditLoggedEmitted === true && workflowManager.getAuditTrail().length > 0, 'WorkflowManager should log HIPAA audit trail entry');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 10 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase10UnitTests = runPhase10UnitTests;
}
