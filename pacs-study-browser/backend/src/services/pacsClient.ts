import { db } from '../database/connection';

export interface QueryFilters {
  patientName?: string;
  patientId?: string;
  accessionNumber?: string;
  studyDate?: string; // YYYYMMDD or range YYYYMMDD-YYYYMMDD
  modalities?: string; // Comma-separated modalities
  studyDescription?: string;
}

export class PacsClient {
  /**
   * Queries studies from the local database (simulating a PACS registry)
   * or delegates to a real PACS if needed.
   */
  public static async queryStudies(filters: QueryFilters) {
    let studies = db.getStudies();

    if (filters.patientName) {
      const nameLower = filters.patientName.toLowerCase();
      studies = studies.filter(s => s.patientName.toLowerCase().includes(nameLower));
    }

    if (filters.patientId) {
      const idLower = filters.patientId.toLowerCase();
      studies = studies.filter(s => s.patientId.toLowerCase().includes(idLower));
    }

    if (filters.accessionNumber) {
      const accLower = filters.accessionNumber.toLowerCase();
      studies = studies.filter(s => s.accessionNumber.toLowerCase().includes(accLower));
    }

    if (filters.studyDescription) {
      const descLower = filters.studyDescription.toLowerCase();
      studies = studies.filter(s => s.studyDescription.toLowerCase().includes(descLower));
    }

    if (filters.modalities) {
      const filterMods = filters.modalities.split(',').map(m => m.trim().toUpperCase());
      studies = studies.filter(s => {
        const studyMods = s.modalitiesInStudy ? s.modalitiesInStudy.split(',') : [];
        return filterMods.some(mod => studyMods.includes(mod));
      });
    }

    if (filters.studyDate) {
      if (filters.studyDate.includes('-')) {
        const [start, end] = filters.studyDate.split('-');
        studies = studies.filter(s => s.studyDate >= start && s.studyDate <= end);
      } else {
        studies = studies.filter(s => s.studyDate === filters.studyDate);
      }
    }

    // Sort by study date and time descending
    return studies.sort((a, b) => {
      const dateTimeA = `${a.studyDate || ''}T${a.studyTime || ''}`;
      const dateTimeB = `${b.studyDate || ''}T${b.studyTime || ''}`;
      return dateTimeB.localeCompare(dateTimeA);
    });
  }

  public static async querySeries(studyInstanceUid: string) {
    return db.getSeries(studyInstanceUid);
  }

  public static async queryInstances(seriesInstanceUid: string) {
    const instances = db.getInstances(seriesInstanceUid);
    return instances.sort((a, b) => {
      if (a.sliceDistance !== undefined && b.sliceDistance !== undefined) {
        return a.sliceDistance - b.sliceDistance;
      }
      if (a.instanceNumber !== undefined && b.instanceNumber !== undefined) {
        return a.instanceNumber - b.instanceNumber;
      }
      if (a.acquisitionNumber !== undefined && b.acquisitionNumber !== undefined) {
        return a.acquisitionNumber - b.acquisitionNumber;
      }
      return 0;
    });
  }
}
