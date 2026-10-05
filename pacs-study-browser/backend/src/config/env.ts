import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const ENV = {
  PORT: Number(process.env.PORT) || 3001,
  HOST: process.env.SERVER_HOST || '0.0.0.0',
  // For local development:
  // SHARE_BASE_URL: process.env.SHARE_BASE_URL || 'http://localhost:3000',
  // For Vercel production:
  SHARE_BASE_URL: process.env.SHARE_BASE_URL || 'https://pacs-dicom.vercel.app',
  MAX_SHARE_LINKS: Number(process.env.MAX_SHARE_LINKS) || 1000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_RETENTION_DAYS: Number(process.env.LOG_RETENTION_DAYS) || 30,
  // Directory where uploaded DICOM files will be stored
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(__dirname, '../../data/instances'),
  // File path for the JSON database
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '../../data/db.json'),
  // Directory where application log files are stored (user-writable)
  LOG_DIR: process.env.LOG_DIR || (process.env.ProgramData ? path.join(process.env.ProgramData, 'MerilView', 'logs') : path.join(__dirname, '../../../logs')),
  // Temporary directory for uploads and processing
  TEMP_DIR: process.env.TEMP_DIR || (process.env.ProgramData ? path.join(process.env.ProgramData, 'MerilView', 'temp') : path.join(__dirname, '../../data/temp')),
  // Directory for backups
  BACKUP_DIR: process.env.BACKUP_DIR || (process.env.ProgramData ? path.join(process.env.ProgramData, 'MerilView', 'backups') : path.join(__dirname, '../../data/backups')),
  // Simulated PACS configuration
  PACS: {
    AE_TITLE: process.env.PACS_AE_TITLE || 'MEDVIEW_PACS',
    HOST: process.env.PACS_HOST || '127.0.0.1',
    PORT: Number(process.env.PACS_PORT) || 11112,
  },
  // Supabase Configuration
  SUPABASE: {
    URL: process.env.SUPABASE_URL || 'https://gjtvxsuorghxqqazlszj.supabase.co',
    ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHZ4c3VvcmdoeHFxYXpsc3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNzI2MzIsImV4cCI6MjEwNjc0ODYzMn0.gPrVjurPQGVJ3CKh6w28lDdjuTZdNNtbcSh0AocnquQ',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHZ4c3VvcmdoeHFxYXpsc3pqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTE3MjYzMiwiZXhwIjoyMTA2NzQ4NjMyfQ.Ly6sHtBM4WhnglXkdKFeXKe6gLzNFC3b0JCpVyurk2k',
  },
  // Share Study Settings
  SHARE: {
    TOKEN_LENGTH: Number(process.env.SHARE_TOKEN_LENGTH) || 32,
    DEFAULT_EXPIRATION: Number(process.env.DEFAULT_SHARE_EXPIRATION) || 86400, // 24 hours in seconds
  }
};
