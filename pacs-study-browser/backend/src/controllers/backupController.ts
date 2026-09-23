import { Request, Response } from 'express';
import { supabase } from '../modules/share/supabase';
import fs from 'fs';
import path from 'path';
import { logger } from '../modules/share/logger';

const BACKUP_DIR = path.join(__dirname, '../../data/backups');

export class BackupController {
  /**
   * GET /api/admin/backup
   * Queries Supabase tables, saves them to a local JSON backup file, and returns the payload.
   */
  public static exportBackup = async (req: Request, res: Response) => {
    try {
      logger.info('application', 'Initiating share metadata backup');

      // Ensure backup directory exists
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      // Query share links
      const { data: links, error: linksError } = await supabase
        .from('share_links')
        .select('*');

      if (linksError) throw new Error(`Failed to query share links: ${linksError.message}`);

      // Query audit logs
      const { data: logs, error: logsError } = await supabase
        .from('share_audit_logs')
        .select('*');

      if (logsError) throw new Error(`Failed to query audit logs: ${logsError.message}`);

      const backupPayload = {
        metadata: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          recordCount: {
            share_links: links ? links.length : 0,
            share_audit_logs: logs ? logs.length : 0
          }
        },
        share_links: links || [],
        share_audit_logs: logs || []
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
   * Restores metadata from a JSON payload in request body or a local backup file name.
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

      logger.info('application', 'Initiating restore operation');

      // Clear existing records and seed the new ones
      // 1. Restore share links
      if (backupPayload.share_links && backupPayload.share_links.length > 0) {
        // Upsert into share_links table
        const { error: linksRestoreErr } = await supabase
          .from('share_links')
          .upsert(backupPayload.share_links);

        if (linksRestoreErr) {
          throw new Error(`Failed restoring share links: ${linksRestoreErr.message}`);
        }
      }

      // 2. Restore share audit logs
      if (backupPayload.share_audit_logs && backupPayload.share_audit_logs.length > 0) {
        const { error: logsRestoreErr } = await supabase
          .from('share_audit_logs')
          .upsert(backupPayload.share_audit_logs);

        if (logsRestoreErr) {
          throw new Error(`Failed restoring audit logs: ${logsRestoreErr.message}`);
        }
      }

      logger.info('application', 'Restore operation completed successfully');
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
