import crypto from 'crypto';
import { db } from '../../database/connection';
import { ShareRepository, ShareLinkDb } from './repository';
import { TokenGenerator, defaultTokenGenerator } from './tokenGenerator';
import { SharePermissions } from './permissions';
import { AuditAction } from './auditLogger';
import { logger } from './logger';

/**
 * Custom application errors for proper status reporting
 */
export class ShareServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ShareServiceError';
  }
}

/**
 * Secure PBKDF2 password hashing
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies password against salt and hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, hash] = parts;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

export class ShareService {
  private repository: ShareRepository;
  private tokenGenerator: TokenGenerator;

  constructor(repository?: ShareRepository, tokenGenerator?: TokenGenerator) {
    this.repository = repository ?? new ShareRepository();
    this.tokenGenerator = tokenGenerator ?? defaultTokenGenerator;
  }

  /**
   * Helper to verify if a study exists in the local database
   */
  private checkStudyExists(studyUid: string): boolean {
    const studies = db.getStudies();
    return studies.some((s: any) => s.studyInstanceUid === studyUid);
  }

  /**
   * Helper to write an audit log
   */
  private async logAudit(
    token: string,
    studyUid: string,
    action: AuditAction,
    metadata?: { ip: string | null; device: string | null; browser: string | null }
  ) {
    try {
      await this.repository.createAuditLog({
        share_token: token,
        study_uid: studyUid,
        action,
        ip_address: metadata?.ip ?? null,
        device: metadata?.device ?? null,
        browser: metadata?.browser ?? null,
      });
    } catch (err) {
      // Don't fail the primary request if logging fails, but log it to console
      console.error(`Failed to write audit log for action ${action}:`, err);
    }
  }

  /**
   * Generates a share link for a study.
   */
  async createShare(params: {
    studyUid: string;
    permissions: SharePermissions;
    expiresAt?: string; // ISO timestamp
    password?: string;
    createdBy?: string;
    clientMetadata?: { ip: string; device: string; browser: string };
  }): Promise<ShareLinkDb> {
    const { studyUid, permissions, expiresAt, password, createdBy, clientMetadata } = params;

    // 1. Verify study exists in local database
    if (!this.checkStudyExists(studyUid)) {
      throw new ShareServiceError(404, `Study with UID ${studyUid} not found`);
    }

    // 2. Validate expiration date if provided
    if (expiresAt) {
      const expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        throw new ShareServiceError(400, 'Invalid expiration date format');
      }
      if (expirationDate.getTime() <= Date.now()) {
        throw new ShareServiceError(400, 'Expiration date must be in the future');
      }
    }

    // 3. Hash password if provided
    const passwordHash = password ? hashPassword(password) : null;

    // 4. Generate unique cryptographically secure token
    const token = this.tokenGenerator.generate();

    // 5. Build database payload
    const linkData: ShareLinkDb = {
      token,
      study_uid: studyUid,
      sharing_scope: 'STUDY',
      permissions,
      password_hash: passwordHash,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      created_by: createdBy ?? 'system',
      revoked: false,
    };

    // 6. Save to Supabase
    const savedLink = await this.repository.createShareLink(linkData);

    logger.info('share', `Generated secure share link for study: ${studyUid}`, { token, createdBy });

    // 7. Audit log creation
    await this.logAudit(token, studyUid, 'CREATE', clientMetadata);

    return savedLink;
  }

  /**
   * Validates a share token and handles verification of password, expiry, and revocation.
   */
  async validateShare(
    token: string,
    password?: string,
    clientMetadata?: { ip: string; device: string; browser: string }
  ): Promise<{
    studyUid?: string;
    permissions?: SharePermissions;
    expiresAt?: string | null;
    passwordRequired: boolean;
  }> {
    // 1. Fetch share link details
    logger.info('share', `Validation request received for share token: ${token}`);
    const link = await this.repository.getShareLinkByToken(token);
    if (!link) {
      logger.warn('share', `Share link not found for token: ${token}`);
      throw new ShareServiceError(404, 'Share link not found or invalid token');
    }

    // 2. Check if revoked
    if (link.revoked) {
      logger.warn('share', `Revoked token access attempt: ${token}`);
      await this.logAudit(token, link.study_uid, 'OPEN', clientMetadata); // Log attempt
      throw new ShareServiceError(403, 'Share link has been revoked');
    }

    // 3. Check if expired
    if (link.expires_at) {
      const expiry = new Date(link.expires_at).getTime();
      if (expiry <= Date.now()) {
        logger.warn('share', `Expired token access attempt: ${token}`);
        await this.logAudit(token, link.study_uid, 'EXPIRE', clientMetadata);
        throw new ShareServiceError(403, 'Share link has expired');
      }
    }

    // 4. Handle password protection
    if (link.password_hash) {
      if (!password) {
        logger.info('share', `Password verification required for token: ${token}`);
        return { passwordRequired: true };
      }
      if (!verifyPassword(password, link.password_hash)) {
        logger.warn('share', `Incorrect password access attempt for token: ${token}`);
        await this.logAudit(token, link.study_uid, 'OPEN', clientMetadata); // Log failed attempt
        throw new ShareServiceError(401, 'Invalid share password');
      }
    }

    // 5. Successful access: update last_accessed timestamp
    await this.repository.updateShareLink(token, {
      last_accessed: new Date().toISOString(),
    });

    // 6. Audit log access
    logger.info('share', `Share token verified and accessed: ${token}`, { studyUid: link.study_uid });
    await this.logAudit(token, link.study_uid, 'OPEN', clientMetadata);

    return {
      studyUid: link.study_uid,
      permissions: link.permissions,
      expiresAt: link.expires_at,
      passwordRequired: false,
    };
  }

  /**
   * Lists all share links.
   */
  async listShares(): Promise<ShareLinkDb[]> {
    return this.repository.listAllShareLinks();
  }

  /**
   * Updates expiration, permissions, or password for a token.
   */
  async updateShare(
    token: string,
    params: {
      permissions?: SharePermissions;
      expiresAt?: string | null;
      password?: string | null;
    },
    clientMetadata?: { ip: string; device: string; browser: string }
  ): Promise<ShareLinkDb> {
    const link = await this.repository.getShareLinkByToken(token);
    if (!link) {
      throw new ShareServiceError(404, 'Share link not found');
    }

    const updates: Partial<ShareLinkDb> = {};
    let permissionsChanged = false;
    let expiresChanged = false;
    let passwordChanged = false;

    if (params.permissions !== undefined) {
      updates.permissions = params.permissions;
      permissionsChanged = true;
    }
    if (params.expiresAt !== undefined) {
      if (params.expiresAt !== null) {
        const expirationDate = new Date(params.expiresAt);
        if (isNaN(expirationDate.getTime())) {
          throw new ShareServiceError(400, 'Invalid expiration date format');
        }
        updates.expires_at = expirationDate.toISOString();
      } else {
        updates.expires_at = null;
      }
      expiresChanged = true;
    }
    if (params.password !== undefined) {
      if (params.password === null) {
        updates.password_hash = null;
      } else {
        updates.password_hash = hashPassword(params.password);
      }
      passwordChanged = true;
    }

    const updated = await this.repository.updateShareLink(token, updates);

    logger.info('share', `Share link parameters updated for token: ${token}`, { permissionsChanged, expiresChanged, passwordChanged });

    // Audit logging for individual actions
    if (permissionsChanged) {
      await this.logAudit(token, link.study_uid, 'UPDATE_PERMISSIONS', clientMetadata);
    }
    if (expiresChanged) {
      await this.logAudit(token, link.study_uid, 'UPDATE_EXPIRATION', clientMetadata);
    }
    if (passwordChanged) {
      await this.logAudit(token, link.study_uid, 'UPDATE_PASSWORD', clientMetadata);
    }

    return updated;
  }

  /**
   * Revokes (deactivates) a share link.
   */
  async revokeShare(
    token: string,
    clientMetadata?: { ip: string; device: string; browser: string }
  ): Promise<ShareLinkDb> {
    const link = await this.repository.getShareLinkByToken(token);
    if (!link) {
      throw new ShareServiceError(404, 'Share link not found');
    }

    if (link.revoked) {
      return link; // Already revoked
    }

    logger.warn('share', `Revoking share link access for token: ${token}`);
    const updatedLink = await this.repository.updateShareLink(token, { revoked: true });
    await this.logAudit(token, link.study_uid, 'REVOKE', clientMetadata);

    return updatedLink;
  }

  /**
   * Deletes a share link record and logs action.
   */
  async deleteShare(token: string): Promise<void> {
    const link = await this.repository.getShareLinkByToken(token);
    if (!link) {
      throw new ShareServiceError(404, 'Share link not found');
    }

    logger.warn('share', `Deleting share link record for token: ${token}`);
    await this.repository.deleteShareLink(token);
    await this.logAudit(token, link.study_uid, 'DELETE');
  }

  /**
   * Retrieves audit log history for a specific share link.
   */
  async getAuditHistory(token: string): Promise<any[]> {
    const link = await this.repository.getShareLinkByToken(token);
    if (!link) {
      throw new ShareServiceError(404, 'Share link not found');
    }
    return this.repository.getAuditLogsByToken(token);
  }
}
