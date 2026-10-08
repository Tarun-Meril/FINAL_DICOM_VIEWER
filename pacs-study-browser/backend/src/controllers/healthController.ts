import { Request, Response } from 'express';
import { supabase } from '../modules/share/supabase';
import { db } from '../database/connection';
import fs from 'fs';
import { ENV } from '../config/env';

let cachedSupabaseStatus = 'online';
let lastSupabaseCheckTime = 0;
let isCheckingSupabase = false;

function refreshSupabaseStatusAsync() {
  if (isCheckingSupabase) return;
  if (!ENV.SUPABASE.URL || ENV.SUPABASE.URL.includes('placeholder')) {
    cachedSupabaseStatus = 'local mode (unconfigured)';
    return;
  }
  isCheckingSupabase = true;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
  const checkPromise = supabase.from('share_links').select('id').limit(1);
  Promise.race([checkPromise, timeoutPromise])
    .then((result: any) => {
      if (result && !result.error) {
        cachedSupabaseStatus = 'online';
      } else {
        cachedSupabaseStatus = `offline: ${result?.error?.message || 'unknown error'}`;
      }
    })
    .catch((err: any) => {
      cachedSupabaseStatus = `offline: ${err?.message || err}`;
    })
    .finally(() => {
      lastSupabaseCheckTime = Date.now();
      isCheckingSupabase = false;
    });
}

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

    // 2. Verify Supabase Cloud connection status (non-blocking)
    let supabaseStatus = cachedSupabaseStatus;
    if (!ENV.SUPABASE.URL || ENV.SUPABASE.URL.includes('placeholder')) {
      supabaseStatus = 'local mode (unconfigured)';
    } else {
      if (Date.now() - lastSupabaseCheckTime > 30000) {
        refreshSupabaseStatusAsync();
      }
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
