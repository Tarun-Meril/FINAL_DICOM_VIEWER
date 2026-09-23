import { Request, Response } from 'express';
import { ShareService, ShareServiceError } from './service';
import { extractClientMetadata } from './auditLogger';
import { db } from '../../database/connection';

export class ShareController {
  private service: ShareService;

  constructor(service?: ShareService) {
    this.service = service ?? new ShareService();
  }

  /**
   * POST /api/share-study
   * Generates a share token link for a study.
   */
  createShareLink = async (req: Request, res: Response) => {
    try {
      const { study_uid, permissions, expires_at, password, created_by } = req.body;
      const clientMetadata = extractClientMetadata(req);

      const savedLink = await this.service.createShare({
        studyUid: study_uid,
        permissions,
        expiresAt: expires_at,
        password,
        createdBy: created_by,
        clientMetadata,
      });

      // Securely construct response: return token and metadata, NEVER expose password_hash
      return res.status(201).json({
        message: 'Share link generated successfully',
        token: savedLink.token,
        study_uid: savedLink.study_uid,
        sharing_scope: savedLink.sharing_scope,
        permissions: savedLink.permissions,
        expires_at: savedLink.expires_at,
        created_at: savedLink.created_at,
      });
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in createShareLink:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };

  /**
   * GET /api/share/:token
   * Validates token and returns permissions and study UID.
   */
  validateShareToken = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      // Support extracting password from query string, headers, or body
      const password = (req.query.password as string) || 
                       (req.headers['x-share-password'] as string) || 
                       req.body.password;

      const clientMetadata = extractClientMetadata(req);

      const result = await this.service.validateShare(token, password, clientMetadata);

      if (result.passwordRequired) {
        return res.status(401).json({
          message: 'Password verification required',
          passwordRequired: true,
        });
      }

      return res.status(200).json({
        message: 'Token validated successfully',
        study_uid: result.studyUid,
        permissions: result.permissions,
        expires_at: result.expiresAt,
        status: 'active',
      });
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in validateShareToken:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };

  /**
   * GET /api/share/list
   * Lists all active share links.
   */
  listShareLinks = async (req: Request, res: Response) => {
    try {
      const links = await this.service.listShares();
      const studies = db.getStudies();

      // Sanitize database objects (remove password hashes before returning)
      // and join with local PACS database for Patient Name / Study Description
      const sanitizedLinks = links.map(link => {
        const matchingStudy = studies.find(s => s.studyInstanceUid === link.study_uid);
        return {
          id: link.id,
          token: link.token,
          study_uid: link.study_uid,
          patient_name: matchingStudy ? matchingStudy.patientName : 'Unknown Patient',
          patient_id: matchingStudy ? matchingStudy.patientId : 'Unknown',
          study_description: matchingStudy ? (matchingStudy.studyDescription || '(No Description)') : 'No Description',
          sharing_scope: link.sharing_scope,
          permissions: link.permissions,
          expires_at: link.expires_at,
          created_at: link.created_at,
          last_accessed: link.last_accessed,
          revoked: link.revoked,
          password_protected: !!link.password_hash,
        };
      });

      return res.status(200).json(sanitizedLinks);
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in listShareLinks:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };

  /**
   * PATCH /api/share/:token
   * Updates permissions, password, or expiration for a token.
   */
  updateShareLink = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { permissions, expires_at, password } = req.body;
      const clientMetadata = extractClientMetadata(req);

      const updatedLink = await this.service.updateShare(token, {
        permissions,
        expiresAt: expires_at,
        password,
      }, clientMetadata);

      return res.status(200).json({
        message: 'Share link updated successfully',
        token: updatedLink.token,
        study_uid: updatedLink.study_uid,
        permissions: updatedLink.permissions,
        expires_at: updatedLink.expires_at,
        updated_at: updatedLink.updated_at,
      });
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in updateShareLink:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };

  /**
   * GET /api/share/:token/audit
   * Retrieves audit logs for a token.
   */
  getShareAuditHistory = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const logs = await this.service.getAuditHistory(token);
      return res.status(200).json(logs);
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in getShareAuditHistory:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };

  /**
   * DELETE /api/share/:token
   * Revokes (deactivates) a share token link.
   */
  revokeShareLink = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const hard = req.query.hard === 'true';
      const clientMetadata = extractClientMetadata(req);

      if (hard) {
        await this.service.deleteShare(token);
        return res.status(200).json({
          message: 'Share link deleted successfully',
          token,
          deleted: true,
        });
      } else {
        await this.service.revokeShare(token, clientMetadata);
        return res.status(200).json({
          message: 'Share link revoked successfully',
          token,
          revoked: true,
        });
      }
    } catch (err: any) {
      if (err instanceof ShareServiceError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unhandled error in revokeShareLink:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  };
}

export const defaultShareController = new ShareController();
