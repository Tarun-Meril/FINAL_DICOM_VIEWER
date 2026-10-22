import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';

// Load environment variables from .env
dotenv.config();

const getFallbackDataDir = () => {
  if (process.platform === 'win32') {
    // If D: drive exists (e.g. 800 GB local storage partition), use it for production/validation
    try {
      if (fs.existsSync('D:\\')) {
        return 'D:\\MerilView_Data';
      }
    } catch (_) {}
    return process.env.ProgramData ? path.join(process.env.ProgramData, 'MerilView') : path.join(__dirname, '../../data');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'MerilView');
  } else {
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdgData, 'MerilView');
  }
};

const defaultDataDir = getFallbackDataDir();

export const ENV = {
  PORT: Number(process.env.PORT) || 3001,
  HOST: process.env.SERVER_HOST || '0.0.0.0',
  // Share Base URL:
  SHARE_BASE_URL: process.env.SHARE_BASE_URL || 'https://pacs-dicom.vercel.app',
  MAX_SHARE_LINKS: Number(process.env.MAX_SHARE_LINKS) || 1000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_RETENTION_DAYS: Number(process.env.LOG_RETENTION_DAYS) || 30,
  // Directory where uploaded DICOM files will be stored (800 GB local drive partition)
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(defaultDataDir, 'dicom'),
  // File path for the JSON database
  DB_PATH: process.env.DB_PATH || path.join(defaultDataDir, 'database', 'db.json'),
  // Directory where application log files are stored
  LOG_DIR: process.env.LOG_DIR || path.join(defaultDataDir, 'logs'),
  // Temporary directory for uploads and processing
  TEMP_DIR: process.env.TEMP_DIR || path.join(defaultDataDir, 'temp'),
  // Directory for backups
  BACKUP_DIR: process.env.BACKUP_DIR || path.join(defaultDataDir, 'backups'),
  // Simulated PACS configuration
  PACS: {
    AE_TITLE: process.env.PACS_AE_TITLE || 'MEDVIEW_PACS',
    HOST: process.env.PACS_HOST || '127.0.0.1',
    PORT: Number(process.env.PACS_PORT) || 11112,
  },
  // Supabase Cloud Configuration - Universal Sharing
  USE_SUPABASE: process.env.USE_SUPABASE !== 'false',
  SUPABASE: {
    URL: process.env.SUPABASE_URL || 'https://tlksvspvgicifyeifrll.supabase.co',
    ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsa3N2c3B2Z2ljaWZ5ZWlmcmxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2Mzg4MjMsImV4cCI6MjEwODIxNDgyM30.BcqxYPlQSruTkzvCzt0ATwe0U2Puls9Oy944XTEqkKo',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsa3N2c3B2Z2ljaWZ5ZWlmcmxsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjYzODgyMywiZXhwIjoyMTA4MjE0ODIzfQ.iIAofJu9Wet7Yx8L6I08FWOrhAFlw3HSzjcQvzdNAyw',
  },
  // Share Study Settings
  SHARE: {
    TOKEN_LENGTH: Number(process.env.SHARE_TOKEN_LENGTH) || 32,
    DEFAULT_EXPIRATION: Number(process.env.DEFAULT_SHARE_EXPIRATION) || 86400, // 24 hours in seconds
  }
};
