import fs from 'fs';
import path from 'path';
import { ENV } from '../../config/env';

export type LogCategory = 'application' | 'share' | 'auth' | 'api' | 'error' | 'audit';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class StructuredLogger {
  private logDir = path.join(__dirname, '../../../logs');
  private logLevel = ENV.LOG_LEVEL.toUpperCase();

  constructor() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.cleanOldLogs();
  }

  private getLogFilePath(category: LogCategory): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${category}-${today}.log`);
  }

  private cleanOldLogs() {
    try {
      if (!fs.existsSync(this.logDir)) return;
      const files = fs.readdirSync(this.logDir);
      const retentionMs = ENV.LOG_RETENTION_DAYS * 24 * 3600 * 1000;
      const cutoff = Date.now() - retentionMs;

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (err) {
      console.error('Failed to execute log retention cleanup:', err);
    }
  }

  private write(category: LogCategory, level: LogLevel, message: string, meta?: any) {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIdx = levels.indexOf(level);
    const configuredLevelIdx = levels.indexOf(this.logLevel as LogLevel);

    // Skip logs lower than configured severity level
    if (currentLevelIdx < configuredLevelIdx && configuredLevelIdx !== -1) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = JSON.stringify({
      timestamp,
      level,
      category,
      message,
      meta: meta || null
    }) + '\n';

    try {
      // Append to the specific log category file
      fs.appendFileSync(this.getLogFilePath(category), logEntry, 'utf-8');

      // Also log general events or warnings/errors to core application file
      if (category !== 'application') {
        fs.appendFileSync(this.getLogFilePath('application'), logEntry, 'utf-8');
      }

      // If logging errors, append to error log as well
      if (level === 'ERROR' && category !== 'error') {
        fs.appendFileSync(this.getLogFilePath('error'), logEntry, 'utf-8');
      }
    } catch (err) {
      console.error(`Failed to write structured log entry: ${err}`);
    }

    // Print stdout in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${timestamp}] [${level}] [${category.toUpperCase()}] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  public debug(category: LogCategory, message: string, meta?: any) {
    this.write(category, 'DEBUG', message, meta);
  }

  public info(category: LogCategory, message: string, meta?: any) {
    this.write(category, 'INFO', message, meta);
  }

  public warn(category: LogCategory, message: string, meta?: any) {
    this.write(category, 'WARN', message, meta);
  }

  public error(category: LogCategory, message: string, meta?: any) {
    this.write(category, 'ERROR', message, meta);
  }
}

export const logger = new StructuredLogger();
