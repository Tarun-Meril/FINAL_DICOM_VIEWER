/**
 * Phase 12 Enterprise Validation, Security & Compliance Foundation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { ConformanceManager } from '../compliance/ConformanceManager';
import { DicomValidator } from '../compliance/DicomValidator';
import { ValidationEngine } from '../compliance/ValidationEngine';
import { IHEProfileValidator } from '../compliance/IHEProfileValidator';
import { QualityAssuranceManager } from '../compliance/QualityAssuranceManager';
import { TestDatasetManager } from '../compliance/TestDatasetManager';
import { SecurityManager } from '../compliance/SecurityManager';
import { AuthenticationAdapter } from '../compliance/AuthenticationAdapter';
import { AuthorizationManager } from '../compliance/AuthorizationManager';
import { RoleManager } from '../compliance/RoleManager';
import { AuditManager } from '../compliance/AuditManager';
import { AuditExporter } from '../compliance/AuditExporter';
import { ConfigurationManager } from '../compliance/ConfigurationManager';
import { LicenseManager } from '../compliance/LicenseManager';
import { BackupRecoveryManager } from '../compliance/BackupRecoveryManager';
import { DeploymentValidator } from '../compliance/DeploymentValidator';
import { EngineEvents } from '../types/events';

export async function runComplianceUnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test ConformanceManager & DicomValidator
    const conformance = new ConformanceManager(context);
    assert(conformance.getSupportedSOPClasses().length > 0, 'ConformanceManager should return supported DICOM SOP classes');

    const validator = new DicomValidator(context);
    const mockManager = new TestDatasetManager(context);
    const validDataset = mockManager.getMockDataset('CT_CHEST');

    const valResult = validator.validateDataset(validDataset);
    assert(valResult.valid === true, 'DicomValidator should validate DICOM IOD dataset mandatory tags');

    // 2. Test ValidationEngine Pipeline & Events
    const valEngine = new ValidationEngine(context);
    let valStartedEmitted = false;
    let valCompletedEmitted = false;

    context.eventBus.on(EngineEvents.VALIDATION_STARTED, () => { valStartedEmitted = true; });
    context.eventBus.on(EngineEvents.VALIDATION_COMPLETED, () => { valCompletedEmitted = true; });

    const pipelineRes = await valEngine.runValidationPipeline();
    assert(pipelineRes.passed === true && valStartedEmitted && valCompletedEmitted, 'ValidationEngine should execute automated compliance pipeline');

    // 3. Test SecurityManager & Security Alerts
    const securityManager = new SecurityManager(context);
    let securityAlertEmitted = false;
    context.eventBus.on(EngineEvents.SECURITY_ALERT, () => { securityAlertEmitted = true; });

    securityManager.raiseSecurityAlert('UNAUTHORIZED_ACCESS_ATTEMPT', 'Invalid token provided');
    assert(securityAlertEmitted === true, 'SecurityManager should emit SECURITY_ALERT event');

    // 4. Test RBAC, Authorization, Authentication, & Audit
    const authAdapter = new AuthenticationAdapter(context);
    assert(authAdapter.isAuthenticated() === true, 'AuthenticationAdapter should verify active user session');

    const roleManager = new RoleManager(context);
    assert(roleManager.getRoles('dr_smith').includes('RADIOLOGIST'), 'RoleManager should return RBAC user roles');

    const authzManager = new AuthorizationManager(context);
    assert(authzManager.checkPermission('dr_smith', 'READ_STUDY') === true, 'AuthorizationManager should evaluate permissions');

    const auditManager = new AuditManager(context);
    let auditCreatedEmitted = false;
    context.eventBus.on(EngineEvents.AUDIT_CREATED, () => { auditCreatedEmitted = true; });

    auditManager.logEvent('dr_smith', 'VIEW_STUDY', '1.2.840.10001');
    assert(auditCreatedEmitted && auditManager.getEvents().length > 0, 'AuditManager should log HIPAA audit record and emit AUDIT_CREATED');

    const atnaXml = AuditExporter.exportATNALog(auditManager.getEvents());
    assert(atnaXml.includes('dr_smith'), 'AuditExporter should export audit logs in IHE ATNA Syslog format');

    // 5. Test ConfigurationManager, LicenseManager, & BackupRecoveryManager
    const configManager = new ConfigurationManager(context);
    let configChangedEmitted = false;
    context.eventBus.on(EngineEvents.CONFIGURATION_CHANGED, () => { configChangedEmitted = true; });

    configManager.set('wadoRsBaseUrl', 'http://pacs.local/dicom-web');
    assert(configChangedEmitted === true, 'ConfigurationManager should update setting and emit CONFIGURATION_CHANGED');

    const licenseManager = new LicenseManager(context);
    let licenseUpdatedEmitted = false;
    context.eventBus.on(EngineEvents.LICENSE_UPDATED, () => { licenseUpdatedEmitted = true; });

    licenseManager.updateLicense('ENT-KEY-1234');
    assert(licenseManager.getLicenseStatus().valid === true && licenseUpdatedEmitted === true, 'LicenseManager should validate license and emit LICENSE_UPDATED');

    const backupManager = new BackupRecoveryManager(context);
    let backupCompletedEmitted = false;
    context.eventBus.on(EngineEvents.BACKUP_COMPLETED, () => { backupCompletedEmitted = true; });

    const backupId = await backupManager.createBackup();
    assert(backupId.includes('backup-') && backupCompletedEmitted === true, 'BackupRecoveryManager should create system backup and emit BACKUP_COMPLETED');

    const deployVal = new DeploymentValidator(context);
    assert(deployVal.validateEnvironment().ready === true, 'DeploymentValidator should validate pre-deployment environmental checks');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Compliance unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runComplianceUnitTests = runComplianceUnitTests;
}
