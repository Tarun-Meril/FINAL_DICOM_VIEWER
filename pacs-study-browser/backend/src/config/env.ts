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
  // Simulated PACS configuration
  PACS: {
    AE_TITLE: process.env.PACS_AE_TITLE || 'MEDVIEW_PACS',
    HOST: process.env.PACS_HOST || '127.0.0.1',
    PORT: Number(process.env.PACS_PORT) || 11112,
  },
  // Supabase Configuration
  SUPABASE: {
    URL: process.env.SUPABASE_URL || '',
    ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  // Share Study Settings
  SHARE: {
    TOKEN_LENGTH: Number(process.env.SHARE_TOKEN_LENGTH) || 32,
    DEFAULT_EXPIRATION: Number(process.env.DEFAULT_SHARE_EXPIRATION) || 86400, // 24 hours in seconds
  }
};
