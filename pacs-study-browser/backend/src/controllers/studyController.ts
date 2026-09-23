import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../database/connection';
import { PacsClient, QueryFilters } from '../services/pacsClient';
import { DicomService } from '../services/dicomService';
import { ENV } from '../config/env';

const safeRenameSync = (oldPath: string, newPath: string, retries = 10, delay = 150) => {
  for (let i = 0; i < retries; i++) {
    try {
      fs.renameSync(oldPath, newPath);
      return;
    } catch (err: any) {
      if ((err.code === 'EBUSY' || err.code === 'EACCES') && i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {}
        continue;
      }
      throw err;
    }
  }
};

const safeUnlinkSync = (filePath: string, retries = 10, delay = 150) => {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    } catch (err: any) {
      if ((err.code === 'EBUSY' || err.code === 'EACCES') && i < retries - 1) {
        const start = Date.now();
        while (Date.now() - start < delay) {}
        continue;
      }
      throw err;
    }
  }
};

export class StudyController {
  
  public static async getStudies(req: Request, res: Response): Promise<void> {
    try {
      const filters: QueryFilters = {
        patientName: req.query.patientName as string,
        patientId: req.query.patientId as string,
        accessionNumber: req.query.accessionNumber as string,
        studyDate: req.query.studyDate as string,
        modalities: req.query.modalities as string,
        studyDescription: req.query.studyDescription as string,
      };

      const studies = await PacsClient.queryStudies(filters);
      res.json({
        success: true,
        data: studies,
        total: studies.length
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getSeries(req: Request, res: Response): Promise<void> {
    try {
      const { studyInstanceUid } = req.params;
      const series = await PacsClient.querySeries(studyInstanceUid);
      res.json({
        success: true,
        data: series
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getInstances(req: Request, res: Response): Promise<void> {
    try {
      const { seriesInstanceUid } = req.params;
      const instances = await PacsClient.queryInstances(seriesInstanceUid);
      res.json({
        success: true,
        data: instances
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async uploadDicom(req: Request, res: Response): Promise<void> {
    try {
      let filesToProcess: { path: string; size: number; originalname: string; isTemp: boolean }[] = [];
      
      // 1. Handle Multipart files array
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        filesToProcess = (req.files as Express.Multer.File[]).map(f => ({
          path: f.path,
          size: f.size,
          originalname: f.originalname,
          isTemp: true
        }));
      } 
      // 2. Handle STOW-RS style raw binary upload
      else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        const tempDir = path.join(__dirname, '../../data/temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempPath = path.join(tempDir, `stow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        fs.writeFileSync(tempPath, req.body);
        filesToProcess = [{
          path: tempPath,
          size: req.body.length,
          originalname: 'stow_instance.dcm',
          isTemp: true
        }];
      }

      if (filesToProcess.length === 0) {
        res.status(400).json({ success: false, message: 'No files uploaded.' });
        return;
      }

      const importedInstances: any[] = [];
      const errorLog: string[] = [];
      const duplicateLog: string[] = [];

      let totalDiscovered = filesToProcess.length;
      let validDicomCount = 0;
      let invalidCount = 0;
      let missingMetadataCount = 0;
      let duplicateUidCount = 0;

      for (const file of filesToProcess) {
        try {
          // Check magic signature at offset 128 (accept files without extensions)
          let hasMagicSignature = false;
          let fd: number | null = null;
          try {
            const stats = fs.statSync(file.path);
            if (stats.size >= 132) {
              fd = fs.openSync(file.path, 'r');
              const sigBuffer = Buffer.alloc(4);
              fs.readSync(fd, sigBuffer, 0, 4, 128);
              if (sigBuffer.toString('ascii') === 'DICM') {
                hasMagicSignature = true;
              }
            }
          } catch (e) {
            // Ignore, we will fallback to parser
          } finally {
            if (fd !== null) {
              try {
                fs.closeSync(fd);
              } catch (closeErr) {
                // Ignore
              }
            }
          }

          let metadata: any = null;
          try {
            metadata = DicomService.parseFile(file.path);
          } catch (err: any) {
            if (!hasMagicSignature) {
              invalidCount++;
              errorLog.push(`File ${file.originalname}: Invalid DICOM structure (${err.message})`);
              if (file.isTemp && fs.existsSync(file.path)) {
                safeUnlinkSync(file.path);
              }
              continue;
            }
            throw err; // Re-throw if it had magic signature but failed parsing
          }

          if (!metadata.studyInstanceUid || !metadata.seriesInstanceUid || !metadata.sopInstanceUid) {
            missingMetadataCount++;
            errorLog.push(`File ${file.originalname}: Missing critical UIDs.`);
            if (file.isTemp && fs.existsSync(file.path)) {
              safeUnlinkSync(file.path);
            }
            continue;
          }

          // Duplicate SOPInstanceUID check
          const existingInstance = db.getInstances().find(i => i.sopInstanceUid === metadata.sopInstanceUid);
          if (existingInstance) {
            duplicateUidCount++;
            duplicateLog.push(`File ${file.originalname}: Duplicate SOPInstanceUID (${metadata.sopInstanceUid})`);
            if (file.isTemp && fs.existsSync(file.path)) {
              safeUnlinkSync(file.path);
            }
            continue;
          }

          // Move file to permanent storage under its study/series directory structure
          const studyDir = path.join(ENV.STORAGE_DIR, metadata.studyInstanceUid);
          const seriesDir = path.join(studyDir, metadata.seriesInstanceUid);
          
          if (!fs.existsSync(seriesDir)) {
            fs.mkdirSync(seriesDir, { recursive: true });
          }

          const permanentPath = path.join(seriesDir, `${metadata.sopInstanceUid}.dcm`);
          safeRenameSync(file.path, permanentPath);

          // Prepare database model with extracted tags (Phase 3)
          const instanceItem = {
            sopInstanceUid: metadata.sopInstanceUid,
            seriesInstanceUid: metadata.seriesInstanceUid,
            studyInstanceUid: metadata.studyInstanceUid,
            instanceNumber: metadata.instanceNumber,
            filePath: permanentPath,
            fileSize: file.size,
            patientName: metadata.patientName,
            patientId: metadata.patientId,
            patientBirthDate: metadata.patientBirthDate,
            patientSex: metadata.patientSex,
            studyDate: metadata.studyDate,
            studyTime: metadata.studyTime,
            accessionNumber: metadata.accessionNumber,
            studyDescription: metadata.studyDescription,
            seriesDescription: metadata.seriesDescription,
            seriesNumber: metadata.seriesNumber,
            modality: metadata.modality,
            manufacturer: metadata.manufacturer,
            institution: metadata.institution,
            bodyPart: metadata.bodyPart,
            sliceThickness: metadata.sliceThickness,
            pixelSpacing: metadata.pixelSpacing,
            imageOrientation: metadata.imageOrientation,
            imagePosition: metadata.imagePosition,
            rows: metadata.rows,
            columns: metadata.columns,
            bitsAllocated: metadata.bitsAllocated,
            bitsStored: metadata.bitsStored,
            transferSyntaxUid: metadata.transferSyntaxUid,
            windowCenter: metadata.windowCenter,
            windowWidth: metadata.windowWidth,
            rescaleIntercept: metadata.rescaleIntercept,
            rescaleSlope: metadata.rescaleSlope,
            photometricInterpretation: metadata.photometricInterpretation,
            numberOfFrames: metadata.numberOfFrames,
            frameIncrementPointer: metadata.frameIncrementPointer,
            pixelRepresentation: metadata.pixelRepresentation,
            sliceDistance: metadata.sliceDistance
          };

          // Save instance to DB
          db.addInstance(instanceItem);
          validDicomCount++;

          const seriesItem = {
            seriesInstanceUid: metadata.seriesInstanceUid,
            studyInstanceUid: metadata.studyInstanceUid,
            seriesNumber: metadata.seriesNumber,
            modality: metadata.modality,
            seriesDescription: metadata.seriesDescription || `Series ${metadata.seriesNumber}`,
            numberOfSeriesRelatedInstances: 1
          };

          const studyItem = {
            studyInstanceUid: metadata.studyInstanceUid,
            patientName: metadata.patientName,
            patientId: metadata.patientId,
            patientBirthDate: metadata.patientBirthDate,
            patientSex: metadata.patientSex,
            studyDate: metadata.studyDate,
            studyTime: metadata.studyTime,
            accessionNumber: metadata.accessionNumber,
            studyDescription: metadata.studyDescription,
            modalitiesInStudy: metadata.modality,
            numberOfStudyRelatedSeries: 1,
            numberOfStudyRelatedInstances: 1,
            institution: metadata.institution || 'Local Archive',
            status: 'UNREAD'
          };

          // Update series count if already exists
          const existingSeries = db.getSeries(metadata.studyInstanceUid).find(s => s.seriesInstanceUid === metadata.seriesInstanceUid);
          if (existingSeries) {
            seriesItem.numberOfSeriesRelatedInstances = (existingSeries.numberOfSeriesRelatedInstances || 0) + 1;
          }
          db.addSeries(seriesItem);

          // Update study counts and modalities if already exists
          const existingStudy = db.getStudies().find(s => s.studyInstanceUid === metadata.studyInstanceUid);
          if (existingStudy) {
            const allSeries = db.getSeries(metadata.studyInstanceUid);
            const allInstances = db.getInstances().filter(i => i.studyInstanceUid === metadata.studyInstanceUid);
            
            const modalities = Array.from(new Set(allSeries.map(s => s.modality))).join(', ');

            studyItem.numberOfStudyRelatedSeries = allSeries.length;
            studyItem.numberOfStudyRelatedInstances = allInstances.length;
            studyItem.modalitiesInStudy = modalities;
          }
          db.addStudy(studyItem);

          importedInstances.push({
            sopInstanceUid: metadata.sopInstanceUid,
            patientName: metadata.patientName,
            studyDescription: metadata.studyDescription
          });

        } catch (err: any) {
          if (file.isTemp && fs.existsSync(file.path)) {
            safeUnlinkSync(file.path);
          }
          invalidCount++;
          errorLog.push(`File ${file.originalname}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        importedCount: importedInstances.length,
        report: {
          totalDiscovered,
          validDicomCount,
          invalidCount,
          missingMetadataCount,
          duplicateUidCount,
          studyCount: db.getStudies().length,
          seriesCount: db.getSeries().length,
          instanceCount: db.getInstances().length
        },
        data: importedInstances,
        errors: errorLog.length > 0 ? errorLog : undefined,
        duplicates: duplicateLog.length > 0 ? duplicateLog : undefined
      });

    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async downloadInstance(req: Request, res: Response): Promise<void> {
    try {
      const { sopInstanceUid } = req.params;
      const instance = db.getInstanceByUid(sopInstanceUid);
      
      if (!instance || !fs.existsSync(instance.filePath)) {
        res.status(404).json({ success: false, message: 'Instance file not found.' });
        return;
      }

      res.setHeader('Content-Type', 'application/dicom');
      res.setHeader('Content-Disposition', `attachment; filename="${sopInstanceUid}.dcm"`);
      
      const fileStream = fs.createReadStream(instance.filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async deleteStudy(req: Request, res: Response): Promise<void> {
    try {
      const { studyInstanceUid } = req.params;
      const study = db.getStudies().find(s => s.studyInstanceUid === studyInstanceUid);

      if (!study) {
        res.status(404).json({ success: false, message: 'Study not found.' });
        return;
      }

      db.deleteStudy(studyInstanceUid);
      res.json({
        success: true,
        message: `Study ${studyInstanceUid} deleted successfully.`
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async validateDatabase(req: Request, res: Response): Promise<void> {
    try {
      const instances = db.getInstances();
      const studies = db.getStudies();
      const series = db.getSeries();

      const errors: string[] = [];
      let missingFilesCount = 0;
      let duplicateSopCount = 0;
      const seenSop = new Set<string>();

      // 1. Verify every uploaded file exists
      for (const inst of instances) {
        if (!fs.existsSync(inst.filePath)) {
          errors.push(`File missing on disk: ${inst.filePath} for SOPInstanceUID ${inst.sopInstanceUid}`);
          missingFilesCount++;
        }
        if (seenSop.has(inst.sopInstanceUid)) {
          errors.push(`Duplicate SOPInstanceUID in database: ${inst.sopInstanceUid}`);
          duplicateSopCount++;
        }
        seenSop.add(inst.sopInstanceUid);
      }

      // 2. Verify every series contains all slices (no missing instances/gaps)
      for (const ser of series) {
        const serInsts = instances.filter(i => i.seriesInstanceUid === ser.seriesInstanceUid);
        if (serInsts.length === 0) {
          errors.push(`Series ${ser.seriesInstanceUid} has 0 instances in database.`);
          continue;
        }

        // Sort by instance number to detect gaps
        const sortedInsts = [...serInsts].sort((a, b) => (a.instanceNumber || 0) - (b.instanceNumber || 0));
        const first = sortedInsts[0].instanceNumber || 1;
        const last = sortedInsts[sortedInsts.length - 1].instanceNumber || sortedInsts.length;
        const expectedCount = last - first + 1;
        if (sortedInsts.length < expectedCount) {
          errors.push(`Series ${ser.seriesInstanceUid} has missing slices. Expected: ${expectedCount}, Found: ${sortedInsts.length}`);
        }
      }

      res.json({
        success: errors.length === 0,
        report: {
          totalStudies: studies.length,
          totalSeries: series.length,
          totalInstances: instances.length,
          missingFilesCount,
          duplicateSopCount,
          errorCount: errors.length
        },
        errors
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getSeriesDetails(req: Request, res: Response): Promise<void> {
    try {
      const { seriesInstanceUid } = req.params;
      const series = db.getSeries().find(s => s.seriesInstanceUid === seriesInstanceUid);
      if (!series) {
        res.status(404).json({ success: false, message: 'Series not found' });
        return;
      }
      res.json({
        success: true,
        data: series
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  public static async getStudyDetails(req: Request, res: Response): Promise<void> {
    try {
      const { studyInstanceUid } = req.params;
      const study = db.getStudies().find(s => s.studyInstanceUid === studyInstanceUid);
      if (!study) {
        res.status(404).json({ success: false, message: 'Study not found' });
        return;
      }
      res.json({
        success: true,
        data: study
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
