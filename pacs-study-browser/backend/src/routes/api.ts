import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { StudyController } from '../controllers/studyController';
import { HealthController } from '../controllers/healthController';
import { BackupController } from '../controllers/backupController';
import shareRoutes from '../modules/share/routes';

const router = Router();

// Configure Multer for temporary file uploads
const tempDir = path.join(__dirname, '../../data/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

// Health Diagnostic Route
router.get('/health', HealthController.checkHealth);

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
router.get('/instances/:sopInstanceUid/file', StudyController.downloadInstance);
router.get('/database/validate', StudyController.validateDatabase);

// Share Study Module Routes
router.use(shareRoutes);

export default router;
