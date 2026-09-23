/**
 * MeasurementManager Subsystem
 * Manages clinical measurements (Length, Angle, Bidirectional, ROIs, Area, Perimeter, SUV) and statistics
 */

import { IEngineContext, IMeasurement, IMeasurementManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class MeasurementManager implements IMeasurementManager {
  private engineContext: IEngineContext;
  private measurements: Map<string, IMeasurement> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addMeasurement(measurement: IMeasurement): void {
    if (!measurement || !measurement.measurementId) return;

    const start = performance.now();
    this.measurements.set(measurement.measurementId, measurement);

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('measurementCalculationTimeMs', duration);
    this.engineContext.logger.info('Clinical', `Added measurement ${measurement.measurementId} (${measurement.type}: ${measurement.value}${measurement.unit})`);

    this.engineContext.eventBus.emit(EngineEvents.MEASUREMENT_CREATED, {
      measurementId: measurement.measurementId,
      type: measurement.type,
      value: measurement.value,
      unit: measurement.unit,
    });
  }

  public removeMeasurement(measurementId: string): void {
    this.measurements.delete(measurementId);
    this.engineContext.logger.info('Clinical', `Removed measurement ${measurementId}`);
    this.engineContext.eventBus.emit(EngineEvents.MEASUREMENT_DELETED, { measurementId });
  }

  public getMeasurementsForViewport(viewportId: string): IMeasurement[] {
    return Array.from(this.measurements.values()).filter((m) => m.viewportId === viewportId);
  }

  public getAllMeasurements(): IMeasurement[] {
    return Array.from(this.measurements.values());
  }
}
