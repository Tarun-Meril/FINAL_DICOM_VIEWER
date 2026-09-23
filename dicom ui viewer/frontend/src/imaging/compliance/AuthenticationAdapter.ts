/**
 * AuthenticationAdapter Subsystem
 * Authentication gateway adapter (OAuth2, SAML, OIDC, Active Directory)
 */

import { IEngineContext } from '../types/contracts';

export class AuthenticationAdapter {
  private engineContext: IEngineContext;
  private currentUser: string | null = 'dr_smith';

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public getCurrentUser(): string | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null;
  }
}
