/**
 * RegistrationManager Subsystem Orchestrator
 * Orchestrates multi-modality Rigid and Affine 3D volume image registration sessions
 */

import { IEngineContext, IRegistrationManager, IRegistrationTransform } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { RigidRegistration } from './RigidRegistration';
import { AffineRegistration } from './AffineRegistration';
import { RegistrationRepository } from './RegistrationRepository';

export class RegistrationManager implements IRegistrationManager {
  private engineContext: IEngineContext;
  private rigidSolver: RigidRegistration;
  private affineSolver: AffineRegistration;
  private repository: RegistrationRepository;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.rigidSolver = new RigidRegistration();
    this.affineSolver = new AffineRegistration();
    this.repository = new RegistrationRepository();
  }

  public registerVolumes(
    referenceVolumeId: string,
    movingVolumeId: string,
    type: 'RIGID' | 'AFFINE' = 'RIGID'
  ): IRegistrationTransform {
    const start = performance.now();
    this.engineContext.logger.info('Registration', `Starting ${type} registration between ${movingVolumeId} -> ${referenceVolumeId}`);
    this.engineContext.eventBus.emit(EngineEvents.REGISTRATION_STARTED, { referenceVolumeId, movingVolumeId, type });

    const matrix = type === 'AFFINE'
      ? this.affineSolver.computeAffineTransform(referenceVolumeId, movingVolumeId)
      : this.rigidSolver.computeRigidTransform(referenceVolumeId, movingVolumeId);

    const registrationId = `reg-${Date.now()}`;
    const transform: IRegistrationTransform = {
      registrationId,
      referenceVolumeId,
      movingVolumeId,
      type,
      matrix,
    };

    this.repository.saveTransform(transform);
    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('registrationTimeMs', duration);
    this.engineContext.logger.info('Registration', `Completed ${type} registration ${registrationId} in ${Math.round(duration)}ms`);

    this.engineContext.eventBus.emit(EngineEvents.REGISTRATION_COMPLETED, {
      registrationId,
      referenceVolumeId,
      movingVolumeId,
      type,
    });

    return transform;
  }

  public getTransform(registrationId: string): IRegistrationTransform | undefined {
    return this.repository.getTransform(registrationId);
  }
}
