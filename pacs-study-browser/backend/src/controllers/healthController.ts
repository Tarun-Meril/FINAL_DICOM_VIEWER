import { Request, Response } from 'express';
import { db } from '../database/connection';
import fs from 'fs';
import { ENV } from '../config/env';

export class HealthController {
  /**
   * GET /api/health
   * Performs diagnostics across local system resources, database, and 800 GB storage partition.
   */
  public static checkHealth = async (req: Request, res: Response) => {
    // 1. Verify Local PACS Database connectivity
    let databaseStatus = 'unhealthy';
    let studiesCount = 0;
    let seriesCount = 0;
    let instancesCount = 0;
    let shareLinksCount = 0;

    try {
      const studies = db.getStudies();
      if (Array.isArray(studies)) {
        databaseStatus = 'healthy';
        studiesCount = studies.length;
        seriesCount = db.getSeries().length;
        instancesCount = db.getInstances().length;
        shareLinksCount = (db.getShareLinks() || []).length;
      }
    } catch (err) {
      databaseStatus = 'unhealthy';
    }

    // 2. Verify Storage directory file write access permissions on local drive
    let storageStatus = 'unhealthy';
    try {
      if (fs.existsSync(ENV.STORAGE_DIR)) {
        fs.accessSync(ENV.STORAGE_DIR, fs.constants.W_OK);
        storageStatus = 'healthy';
      } else {
        fs.mkdirSync(ENV.STORAGE_DIR, { recursive: true });
        storageStatus = 'healthy';
      }
    } catch (err) {
      storageStatus = 'unhealthy';
    }

    // 3. Extract Node process system resource statistics
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const isSystemHealthy = databaseStatus === 'healthy' && storageStatus === 'healthy';

    return res.status(isSystemHealthy ? 200 : 500).json({
      status: isSystemHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      mode: '100% Local Drive Mode (Supabase Removed)',
      uptime: `${Math.round(uptime)}s`,
      database: databaseStatus,
      storage: {
        status: storageStatus,
        directory: ENV.STORAGE_DIR,
        databaseFile: ENV.DB_PATH,
        backupDirectory: ENV.BACKUP_DIR,
      },
      counts: {
        studies: studiesCount,
        series: seriesCount,
        instances: instancesCount,
        shareLinks: shareLinksCount,
      },
      metrics: {
        memory: {
          rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
        },
        cpuUsage: {
          user: `${Math.round(cpu.user / 1000)}ms`,
          system: `${Math.round(cpu.system / 1000)}ms`
        }
      }
    });
  };
}
