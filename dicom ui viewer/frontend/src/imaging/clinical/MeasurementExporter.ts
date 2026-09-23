/**
 * MeasurementExporter Subsystem
 * Exports clinical measurements to JSON and CSV report formats
 */

import { IMeasurementManager } from '../types/contracts';

export class MeasurementExporter {
  public static exportToJson(measurementManager: IMeasurementManager): string {
    const measurements = measurementManager.getAllMeasurements();
    return JSON.stringify({ timestamp: new Date().toISOString(), measurements }, null, 2);
  }

  public static exportToCsv(measurementManager: IMeasurementManager): string {
    const measurements = measurementManager.getAllMeasurements();
    const headers = ['MeasurementID', 'Type', 'ViewportID', 'Label', 'Value', 'Unit'];
    const rows = measurements.map((m) => [m.measurementId, m.type, m.viewportId, m.label, m.value, m.unit].join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}
