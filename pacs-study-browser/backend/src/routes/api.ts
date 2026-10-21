import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { StudyController } from '../controllers/studyController';
import { HealthController } from '../controllers/healthController';
import { BackupController } from '../controllers/backupController';
import shareRoutes from '../modules/share/routes';
import { ENV } from '../config/env';
import os from 'os';

const router = Router();

// Configure Multer for temporary file uploads
let tempDir = ENV.TEMP_DIR || path.join(__dirname, '../../data/temp');
try {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
} catch (err) {
  tempDir = path.join(os.tmpdir(), 'merilview-temp');
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (_) {}
}

const upload = multer({ dest: tempDir });

// Health Diagnostic Route
router.get('/health', HealthController.checkHealth);

// System & Network Diagnostics for Local Sharing
router.get('/system/network-info', (req, res) => {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  res.json({
    primaryIp: ips[0] || '127.0.0.1',
    allIps: ips,
    port: 3001,
  });
});

// Backup & Disaster Recovery Administration Routes
router.get('/admin/backup', BackupController.exportBackup);
router.post('/admin/restore', BackupController.restoreBackup);
router.post('/admin/verify-backup', BackupController.verifyBackup);

// Study List & Metadata Routes
router.get('/studies', StudyController.getStudies);
router.get('/studies/:studyInstanceUid', StudyController.getStudyDetails);
router.delete('/studies/:studyInstanceUid', StudyController.deleteStudy);
router.get('/studies/:studyInstanceUid/series', StudyController.getSeries);
router.get('/series/:seriesInstanceUid/instances', StudyController.getInstances);
router.get('/series/:seriesInstanceUid', StudyController.getSeriesDetails);

// Import & Export Routes
router.post('/studies/upload', upload.array('files'), StudyController.uploadDicom);
router.post('/upload', upload.array('files'), StudyController.uploadDicom);
router.post('/studies/select', (req, res) => res.json({ success: true, timestamp: Date.now() }));
router.get('/instances/:sopInstanceUid/file', StudyController.downloadInstance);
router.get('/instances/:sopInstanceUid/png', StudyController.getInstancePng);
router.get('/database/validate', StudyController.validateDatabase);

// Share Study Module Routes
router.use(shareRoutes);

export default router;
