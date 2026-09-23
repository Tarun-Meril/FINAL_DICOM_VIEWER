import { Request, Response } from 'express';
import { supabase } from '../modules/share/supabase';
import { db } from '../database/connection';
import fs from 'fs';
import { ENV } from '../config/env';

export class HealthController {
  /**
   * GET /api/health
   * Performs diagnostics across system resources and returns status info.
   */
  public static checkHealth = async (req: Request, res: Response) => {
    // 1. Verify Local PACS JSON Database connectivity
    let databaseStatus = 'unhealthy';
    try {
      const studies = db.getStudies();
      if (Array.isArray(studies)) {
        databaseStatus = 'healthy';
      }
    } catch (err) {
      databaseStatus = 'unhealthy';
    }

    // 2. Verify Supabase Cloud connection status
    let supabaseStatus = 'offline';
    try {
      const { error } = await supabase
        .from('share_links')
        .select('id')
        .limit(1);
      if (!error) {
        supabaseStatus = 'online';
      } else {
        supabaseStatus = `offline: ${error.message}`;
      }
    } catch (err: any) {
      supabaseStatus = `offline: ${err.message || err}`;
    }

    // 3. Verify DICOM Upload directory file write access permissions
    let storageStatus = 'unhealthy';
    try {
      if (fs.existsSync(ENV.STORAGE_DIR)) {
        fs.accessSync(ENV.STORAGE_DIR, fs.constants.W_OK);
        storageStatus = 'healthy';
      } else {
        // Try to create storage dir if missing
        fs.mkdirSync(ENV.STORAGE_DIR, { recursive: true });
        storageStatus = 'healthy';
      }
    } catch (err) {
      storageStatus = 'unhealthy';
    }

    // 4. Extract Node process system resource statistics
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();

    const isSystemHealthy = databaseStatus === 'healthy' && storageStatus === 'healthy';

    return res.status(isSystemHealthy ? 200 : 500).json({
      status: isSystemHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      uptime: `${Math.round(uptime)}s`,
      database: databaseStatus,
      supabase: supabaseStatus,
      storage: storageStatus,
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
