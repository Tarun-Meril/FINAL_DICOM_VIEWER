/**
 * Phase 12 Production Readiness, Clinical Validation & Enterprise Release Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { ReleaseManager } from '../release/ReleaseManager';
import { VersionManager } from '../release/VersionManager';
import { InstallerManager } from '../release/InstallerManager';
import { UpdateManager } from '../release/UpdateManager';
import { MigrationManager } from '../release/MigrationManager';
import { DocumentationManager } from '../release/DocumentationManager';
import { SupportBundleManager } from '../release/SupportBundleManager';
import { CrashReporter } from '../release/CrashReporter';
import { TelemetryExporter } from '../release/TelemetryExporter';
import { DiagnosticManager } from '../release/DiagnosticManager';
import { EngineEvents } from '../types/events';

export async function runPhase12UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test ReleaseManager & Release Events
    const releaseManager = new ReleaseManager(context);
    let releaseStartedEmitted = false;
    context.eventBus.on(EngineEvents.RELEASE_BUILD_STARTED, () => { releaseStartedEmitted = true; });

    releaseManager.prepareReleaseBuild('DOCKER');
    assert(releaseStartedEmitted === true, 'ReleaseManager should prepare build and emit RELEASE_BUILD_STARTED');

    // 2. Test VersionManager & InstallerManager
    const versionManager = new VersionManager(context);
    const verInfo = versionManager.getVersionInfo();
    assert(verInfo.version.includes('12.0.0') && verInfo.buildNumber > 0, 'VersionManager should return version and build metadata');

    const installerManager = new InstallerManager(context);
    assert(installerManager.verifyInstallerIntegrity() === true, 'InstallerManager should verify installer package integrity');

    // 3. Test UpdateManager & MigrationManager
    const updateManager = new UpdateManager(context);
    let updateAvailableEmitted = false;
    context.eventBus.on(EngineEvents.UPDATE_AVAILABLE, () => { updateAvailableEmitted = true; });

    updateManager.checkForUpdates();
    assert(updateAvailableEmitted === true, 'UpdateManager should check for updates and emit UPDATE_AVAILABLE');

    const migrationManager = new MigrationManager(context);
    assert(migrationManager.migrateWorkspaceSchema('11.0.0', '12.0.0') === true, 'MigrationManager should execute workspace migrations');

    // 4. Test DocumentationManager & SupportBundleManager
    const docManager = new DocumentationManager(context);
    assert(docManager.getDocumentationIndex().includes('Administrator Guide'), 'DocumentationManager should provide clinical documentation index');

    const supportBundleManager = new SupportBundleManager(context);
    let bundleGeneratedEmitted = false;
    context.eventBus.on(EngineEvents.SUPPORT_BUNDLE_GENERATED, () => { bundleGeneratedEmitted = true; });

    const bundle = supportBundleManager.generateSupportBundle();
    assert(bundle.byteLength === 4096 && bundleGeneratedEmitted === true, 'SupportBundleManager should generate clinical support bundle archive');

    // 5. Test CrashReporter, TelemetryExporter & DiagnosticManager
    const crashReporter = new CrashReporter(context);
    let crashReportedEmitted = false;
    context.eventBus.on(EngineEvents.CRASH_REPORTED, () => { crashReportedEmitted = true; });

    crashReporter.reportCrash(new Error('Simulated WebGL Context Loss'), 'RenderingEngine');
    assert(crashReportedEmitted === true, 'CrashReporter should capture exception and emit CRASH_REPORTED');

    const telemetryExporter = new TelemetryExporter(context);
    const reportStr = telemetryExporter.exportTelemetryReport();
    assert(reportStr.includes('fps'), 'TelemetryExporter should export JSON telemetry report');

    const diagnosticManager = new DiagnosticManager(context);
    const diagRes = await diagnosticManager.runFullDiagnostics();
    assert(diagRes.healthy === true && diagRes.results.volumeRendering === true, 'DiagnosticManager should execute full engine operational diagnostics');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 12 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase12UnitTests = runPhase12UnitTests;
}
