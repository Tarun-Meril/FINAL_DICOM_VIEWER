import express from 'express';
import cors from 'cors';
import { ENV } from './config/env';
import apiRoutes from './routes/api';
import { errorHandler } from './middleware/errorHandler';
import { db } from './database/connection';
import { securityHeaders, rateLimiter } from './middleware/security';
import { logger } from './modules/share/logger';

const app = express();

// Apply secure headers and API rate limiting (50,000 req/min to accommodate bulk DICOM uploads)
app.use(securityHeaders);
app.use('/api', rateLimiter(50000, 60 * 1000));

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development
}));
app.use(express.raw({ type: 'application/dicom', limit: '100mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.send(`
    <! climate-html>
    <html>
      <head>
        <title>MedView PRO PACS Service Status</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; border: 1px solid #334155; padding: 2rem; rounded: 12px; max-width: 480px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); border-radius: 12px; text-align: center; }
          h1 { color: #38bdf8; font-size: 1.25rem; margin-bottom: 0.5rem; text-transform: uppercase; tracking: 1px; }
          p { font-size: 0.9rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem; }
          .btn-group { display: flex; flex-direction: column; gap: 0.75rem; }
          a.btn { display: block; padding: 0.75rem 1rem; background: #0284c7; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.9rem; transition: background 0.2s; }
          a.btn:hover { background: #0369a1; }
          a.btn-secondary { background: #334155; color: #f1f5f9; }
          a.btn-secondary:hover { background: #475569; }
          .badge { display: inline-block; padding: 4px 8px; background: #166534; color: #4ade80; font-size: 0.75rem; font-weight: 700; border-radius: 4px; margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● REST API ACTIVE (Port 3001)</div>
          <h1>PACS Backend API Server</h1>
          <p>Port 3001 serves REST API endpoints and DICOM services. To access the web user interfaces, use the links below:</p>
          <div class="btn-group">
            <a href="http://localhost:3005" class="btn">Open PACS Study Browser UI (Port 3005) →</a>
            <a href="http://localhost:5174" class="btn btn-secondary">Open DICOM Viewer UI (Port 5174) →</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.use('/api', apiRoutes);

// Error handling
app.use(errorHandler);

// Seed database with mock studies from the screenshot
const seedDatabase = () => {
  if (db.getStudies().length === 0) {
    console.log('Seeding mock DICOM studies in database...');
    
    const mockStudies = [
      {
        studyInstanceUid: '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1',
        patientName: 'Structured Reports',
        patientId: 'PID_SR',
        patientBirthDate: '19780909',
        patientSex: 'M',
        studyDate: '20240101',
        studyTime: '094522',
        accessionNumber: 'ACC-001',
        studyDescription: '(No Description)',
        modalitiesInStudy: 'CT, MR, CR, US, DS, DR, SR',
        numberOfStudyRelatedSeries: 1,
        numberOfStudyRelatedInstances: 27,
        institution: 'Metro PACS Center',
        status: 'READ'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.2',
        patientName: 'CTA Head and Neck',
        patientId: 'NEW_PATIENT',
        patientBirthDate: '19970511',
        patientSex: 'F',
        studyDate: '20230511',
        studyTime: '142210',
        accessionNumber: 'ACC-002',
        studyDescription: 'CT NECK SOFT TISSUE W/ ...',
        modalitiesInStudy: 'CT',
        numberOfStudyRelatedSeries: 2,
        numberOfStudyRelatedInstances: 295,
        institution: 'Cardio Imaging Labs',
        status: 'IN PROGRESS'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.3',
        patientName: 'Anonymous',
        patientId: 'AVSUIP',
        patientBirthDate: '19970403',
        patientSex: 'M',
        studyDate: '20230403',
        studyTime: '113000',
        accessionNumber: 'ACC-003',
        studyDescription: '(No Description)',
        modalitiesInStudy: 'CT',
        numberOfStudyRelatedSeries: 1,
        numberOfStudyRelatedInstances: 112,
        institution: 'Cardio Imaging Labs',
        status: 'IN PROGRESS'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.4',
        patientName: 'DATSCAN1',
        patientId: 'DATSCAN1',
        patientBirthDate: '19001121',
        patientSex: 'F',
        studyDate: '20221121',
        studyTime: '101500',
        accessionNumber: 'ACC-004',
        studyDescription: 'CERVEAU DATSCAN',
        modalitiesInStudy: 'NM',
        numberOfStudyRelatedSeries: 1,
        numberOfStudyRelatedInstances: 5,
        institution: 'Metro PACS Center',
        status: 'READ'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.5',
        patientName: 'SIIM, Thierry',
        patientId: 'Thierry_cbc',
        patientBirthDate: '19771015',
        patientSex: 'M',
        studyDate: '20221015',
        studyTime: '164500',
        accessionNumber: 'ACC-005',
        studyDescription: '3D examination',
        modalitiesInStudy: 'CT, OT, SM',
        numberOfStudyRelatedSeries: 3,
        numberOfStudyRelatedInstances: 402,
        institution: 'Cardio Imaging Labs',
        status: 'IN PROGRESS'
      },
      {
        studyInstanceUid: '1.3.6.1.4.1.9328.50.4.123456789.2',
        patientName: 'M1',
        patientId: 'M1',
        patientBirthDate: '19450915',
        patientSex: 'O',
        studyDate: '20220915',
        studyTime: '083000',
        accessionNumber: 'ACC-006',
        studyDescription: 'General Static Scan + CT',
        modalitiesInStudy: 'CT, PT',
        numberOfStudyRelatedSeries: 4,
        numberOfStudyRelatedInstances: 18163,
        institution: 'St. Mary Radiology',
        status: 'COMPLETED'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.7',
        patientName: 'Test, Röntgen',
        patientId: '20210922-01',
        patientBirthDate: '19680922',
        patientSex: 'O',
        studyDate: '20210922',
        studyTime: '110000',
        accessionNumber: 'ACC-007',
        studyDescription: 'Thorax (kl.)',
        modalitiesInStudy: 'DX',
        numberOfStudyRelatedSeries: 1,
        numberOfStudyRelatedInstances: 1,
        institution: 'Metro PACS Center',
        status: 'READ'
      },
      {
        studyInstanceUid: '1.2.840.113619.2.55.3.27414995.12345.8',
        patientName: 'SIIM, Jessica',
        patientId: 'opth-001',
        patientBirthDate: '19550527',
        patientSex: 'F',
        studyDate: '20210527',
        studyTime: '153000',
        accessionNumber: 'ACC-008',
        studyDescription: '(No Description)',
        modalitiesInStudy: 'PT, SR',
        numberOfStudyRelatedSeries: 2,
        numberOfStudyRelatedInstances: 17,
        institution: 'Meril General Hospital',
        status: 'UNREAD'
      }
    ];

    mockStudies.forEach(study => db.addStudy(study));

    // Seed mock series
    const mockSeries = [
      {
        seriesInstanceUid: '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1.1',
        studyInstanceUid: '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1',
        seriesNumber: 1,
        modality: 'CT',
        seriesDescription: 'CT Scout',
        numberOfSeriesRelatedInstances: 27
      }
    ];

    mockSeries.forEach(series => db.addSeries(series));
    console.log('Database seeding complete.');
  }
};

// Start Server
const server = app.listen(ENV.PORT, ENV.HOST, () => {
  logger.info('application', 'PACS Study Browser Backend Service is starting up', {
    port: ENV.PORT,
    host: ENV.HOST,
    db: ENV.DB_PATH,
    storage: ENV.STORAGE_DIR
  });
  console.log(`==================================================`);
  console.log(`  PACS Study Browser Backend Service is running!`);
  console.log(`  Local URL: http://${ENV.HOST}:${ENV.PORT}`);
  console.log(`  Health Check: http://${ENV.HOST}:${ENV.PORT}/api/health`);
  console.log(`  Database File: ${ENV.DB_PATH}`);
  console.log(`  Storage Directory: ${ENV.STORAGE_DIR}`);
  console.log(`==================================================`);
  // seedDatabase();
});

// Graceful shutdown listener
const shutdown = (signal: string) => {
  logger.warn('application', `Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    logger.info('application', 'Backend service HTTP server closed successfully.');
    process.exit(0);
  });
  
  // Force termination after timeout
  setTimeout(() => {
    logger.error('application', 'Forced shutdown initiated due to close timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('error', `Uncaught Exception: ${err.message}`, { stack: err.stack });
  console.error('CRITICAL: Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('error', `Unhandled Promise Rejection: ${reason?.message || reason}`);
  console.error('CRITICAL: Unhandled Promise Rejection:', reason);
});

