import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env';

export interface DatabaseSchema {
  studies: any[];
  series: any[];
  instances: any[];
  share_links?: any[];
  share_audit_logs?: any[];
}

class Database {
  private data: DatabaseSchema = {
    studies: [],
    series: [],
    instances: [],
    share_links: [],
    share_audit_logs: []
  };

  constructor() {
    this.init();
  }

  private instanceMap: Map<string, any> = new Map();

  private rebuildIndex() {
    this.instanceMap.clear();
    for (const inst of this.data.instances) {
      if (inst && inst.sopInstanceUid) {
        this.instanceMap.set(inst.sopInstanceUid, inst);
      }
    }
  }

  private init() {
    const dbDir = path.dirname(ENV.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const storageDir = ENV.STORAGE_DIR;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    if (fs.existsSync(ENV.DB_PATH)) {
      try {
        const raw = fs.readFileSync(ENV.DB_PATH, 'utf-8');
        this.data = JSON.parse(raw);
        this.rebuildIndex();
      } catch (err) {
        console.error('Failed to parse database file, initializing empty database:', err);
        this.save();
      }
    } else {
      this.save();
    }
  }

  public save() {
    this.rebuildIndex();
    fs.writeFileSync(ENV.DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  public getStudies() {
    return this.data.studies;
  }

  public getSeries(studyInstanceUid?: string) {
    if (studyInstanceUid) {
      return this.data.series.filter(s => s.studyInstanceUid === studyInstanceUid);
    }
    return this.data.series;
  }

  public getInstances(seriesInstanceUid?: string) {
    if (seriesInstanceUid) {
      return this.data.instances.filter(i => i.seriesInstanceUid === seriesInstanceUid);
    }
    return this.data.instances;
  }

  public getInstanceByUid(sopInstanceUid: string) {
    return this.instanceMap.get(sopInstanceUid);
  }

  public addStudy(study: any) {
    const idx = this.data.studies.findIndex(s => s.studyInstanceUid === study.studyInstanceUid);
    if (idx >= 0) {
      this.data.studies[idx] = { ...this.data.studies[idx], ...study };
    } else {
      this.data.studies.push(study);
    }
    this.save();
  }

  public addSeries(series: any) {
    const idx = this.data.series.findIndex(s => s.seriesInstanceUid === series.seriesInstanceUid);
    if (idx >= 0) {
      this.data.series[idx] = { ...this.data.series[idx], ...series };
    } else {
      this.data.series.push(series);
    }
    this.save();
  }

  public addInstance(instance: any) {
    const idx = this.data.instances.findIndex(i => i.sopInstanceUid === instance.sopInstanceUid);
    if (idx >= 0) {
      this.data.instances[idx] = { ...this.data.instances[idx], ...instance };
    } else {
      this.data.instances.push(instance);
    }
    this.save();
  }

  public deleteStudy(studyInstanceUid: string) {
    this.data.studies = this.data.studies.filter(s => s.studyInstanceUid !== studyInstanceUid);
    const seriesToDelete = this.data.series.filter(s => s.studyInstanceUid === studyInstanceUid);
    const seriesUids = seriesToDelete.map(s => s.seriesInstanceUid);
    
    this.data.series = this.data.series.filter(s => s.studyInstanceUid !== studyInstanceUid);
    
    const instancesToDelete = this.data.instances.filter(i => seriesUids.includes(i.seriesInstanceUid));
    instancesToDelete.forEach(inst => {
      try {
        if (fs.existsSync(inst.filePath)) {
          fs.unlinkSync(inst.filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file: ${inst.filePath}`, err);
      }
    });

    this.data.instances = this.data.instances.filter(i => !seriesUids.includes(i.seriesInstanceUid));
    this.save();
  }

  // Share Links Fallback Methods
  public getShareLinks(): any[] {
    if (!this.data.share_links) this.data.share_links = [];
    return this.data.share_links;
  }

  public setShareLinks(links: any[]) {
    this.data.share_links = links;
    this.save();
  }

  public getShareAuditLogs(): any[] {
    if (!this.data.share_audit_logs) this.data.share_audit_logs = [];
    return this.data.share_audit_logs;
  }

  public addShareAuditLog(log: any) {
    if (!this.data.share_audit_logs) this.data.share_audit_logs = [];
    this.data.share_audit_logs.push({ ...log, id: Date.now().toString(), created_at: new Date().toISOString() });
    this.save();
  }
}

export const db = new Database();
