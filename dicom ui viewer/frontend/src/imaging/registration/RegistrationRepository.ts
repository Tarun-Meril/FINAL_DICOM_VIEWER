/**
 * RegistrationRepository Tracker
 * In-memory repository for storing and retrieving Registration Transforms
 */

import { IRegistrationTransform } from '../types/contracts';

export class RegistrationRepository {
  private repoMap: Map<string, IRegistrationTransform> = new Map();

  public saveTransform(transform: IRegistrationTransform): void {
    if (!transform || !transform.registrationId) return;
    this.repoMap.set(transform.registrationId, transform);
  }

  public getTransform(registrationId: string): IRegistrationTransform | undefined {
    return this.repoMap.get(registrationId);
  }

  public clear(): void {
    this.repoMap.clear();
  }
}
