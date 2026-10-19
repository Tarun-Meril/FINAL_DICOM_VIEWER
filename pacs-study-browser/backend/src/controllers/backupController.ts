import { Request, Response } from 'express';
import { db } from '../database/connection';
import fs from 'fs';
import path from 'path';
import { logger } from '../modules/share/logger';
import { ENV } from '../config/env';

const BACKUP_DIR = ENV.BACKUP_DIR || path.join(__dirname, '../../data/backups');

export class BackupController {
  /**
   * GET /api/admin/backup
   * Queries local database tables, saves them to a local JSON backup file on the drive, and returns the payload.
   */
  public static exportBackup = async (req: Request, res: Response) => {
    try {
      logger.info('application', 'Initiating local share metadata backup');

      // Ensure backup directory exists
      try {
        if (!fs.existsSync(BACKUP_DIR)) {
          fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
      } catch (dirErr) {
        logger.warn('application', `Could not create BACKUP_DIR at ${BACKUP_DIR}: ${dirErr}`);
      }

      // Query local share links and audit logs
      const links = db.getShareLinks() || [];
      const logs = db.getShareAuditLogs() || [];

      const backupPayload = {
        metadata: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          recordCount: {
            share_links: links.length,
            share_audit_logs: logs.length
          }
        },
        share_links: links,
        share_audit_logs: logs
      };

      // Save locally to database backups directory
      const timestamp = Date.now();
      const backupFileName = `backup-${timestamp}.json`;
      const backupFilePath = path.join(BACKUP_DIR, backupFileName);
      fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf-8');

      logger.info('application', `Backup file generated successfully: ${backupFileName}`);

      return res.status(200).json({
        message: 'Backup completed successfully',
        file: backupFileName,
        path: backupFilePath,
        payload: backupPayload
      });
    } catch (err: any) {
      logger.error('error', `Backup operation failed: ${err.message}`, err);
      return res.status(500).json({ error: 'Backup operation failed', details: err.message });
    }
  };

  /**
   * POST /api/admin/restore
   * Restores metadata from a JSON payload in request body or a local backup file name into the local database.
   */
  public static restoreBackup = async (req: Request, res: Response) => {
    try {
      let backupPayload = req.body;

      // Handle loading from local filename if specified instead of passing body
      if (req.body.file) {
        const filePath = path.join(BACKUP_DIR, req.body.file);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: `Specified backup file not found: ${req.body.file}` });
        }
        backupPayload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }

      // Run verification checks
      const validation = BackupController.validateStructure(backupPayload);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Malformed backup payload structure', reasons: validation.reasons });
      }

      logger.info('application', 'Initiating restore operation to local database');

      // 1. Restore share links
      if (backupPayload.share_links && Array.isArray(backupPayload.share_links)) {
        const existingLinks = db.getShareLinks();
        const map = new Map<string, any>();
        existingLinks.forEach(l => map.set(l.token, l));
        backupPayload.share_links.forEach((l: any) => map.set(l.token, l));
        db.setShareLinks(Array.from(map.values()));
      }

      // 2. Restore share audit logs
      if (backupPayload.share_audit_logs && Array.isArray(backupPayload.share_audit_logs)) {
        backupPayload.share_audit_logs.forEach((log: any) => {
          db.addShareAuditLog(log);
        });
      }

      logger.info('application', 'Restore operation completed successfully to local drive');
      return res.status(200).json({
        message: 'Restore operation completed successfully',
        restoredRecords: {
          share_links: backupPayload.share_links?.length || 0,
          share_audit_logs: backupPayload.share_audit_logs?.length || 0
        }
      });
    } catch (err: any) {
      logger.error('error', `Restore operation failed: ${err.message}`, err);
      return res.status(500).json({ error: 'Restore operation failed', details: err.message });
    }
  };

  /**
   * POST /api/admin/verify-backup
   * Validates a backup file or body payload structure for correctness.
   */
  public static verifyBackup = async (req: Request, res: Response) => {
    try {
      let backupPayload = req.body;

      if (req.body.file) {
        const filePath = path.join(BACKUP_DIR, req.body.file);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Specified backup file not found' });
        }
        backupPayload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }

      const validation = BackupController.validateStructure(backupPayload);
      return res.status(200).json(validation);
    } catch (err: any) {
      return res.status(500).json({ valid: false, error: 'Verification failed', details: err.message });
    }
  };

  private static validateStructure(payload: any): { valid: boolean; reasons?: string[]; info?: any } {
    const reasons: string[] = [];

    if (!payload || typeof payload !== 'object') {
      reasons.push('Payload must be a valid JSON object');
      return { valid: false, reasons };
    }

    if (!payload.share_links || !Array.isArray(payload.share_links)) {
      reasons.push('Missing or invalid share_links array');
    }

    if (!payload.share_audit_logs || !Array.isArray(payload.share_audit_logs)) {
      reasons.push('Missing or invalid share_audit_logs array');
    }

    if (reasons.length > 0) {
      return { valid: false, reasons };
    }

    return {
      valid: true,
      info: {
        exportedAt: payload.metadata?.exportedAt || 'Unknown',
        linksCount: payload.share_links.length,
        logsCount: payload.share_audit_logs.length
      }
    };
  }
}
