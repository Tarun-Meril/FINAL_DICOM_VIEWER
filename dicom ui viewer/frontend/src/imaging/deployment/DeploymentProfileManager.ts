/**
 * DeploymentProfileManager Subsystem
 * Configures engine profiles for CLOUD, ON_PREM, HYBRID, or MOBILE environments
 */

import { IEngineContext } from '../types/contracts';

export class DeploymentProfileManager {
  private engineContext: IEngineContext;
  private currentProfile: 'CLOUD' | 'ON_PREM' | 'HYBRID' | 'MOBILE' = 'ON_PREM';

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setProfile(profile: 'CLOUD' | 'ON_PREM' | 'HYBRID' | 'MOBILE'): void {
    this.currentProfile = profile;
    this.engineContext.logger.info('Deployment', `Deployment profile configured to ${profile}`);
  }

  public getProfile(): 'CLOUD' | 'ON_PREM' | 'HYBRID' | 'MOBILE' {
    return this.currentProfile;
  }
}
