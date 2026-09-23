/**
 * Vendor-Independent DICOM Domain Entities & Value Objects
 * Free of React, Cornerstone, and Browser DOM APIs
 */

export class ImageOrientation {
  constructor(
    public readonly rowCosines: [number, number, number],
    public readonly columnCosines: [number, number, number]
  ) {}

  public getNormalVector(): [number, number, number] {
    const [rx, ry, rz] = this.rowCosines;
    const [cx, cy, cz] = this.columnCosines;
    return [
      ry * cz - rz * cy,
      rz * cx - rx * cz,
      rx * cy - ry * cx
    ];
  }

  public toArray(): number[] {
    return [...this.rowCosines, ...this.columnCosines];
  }
}

export class PixelSpacing {
  constructor(
    public readonly rowSpacing: number,
    public readonly columnSpacing: number
  ) {}

  public toArray(): [number, number] {
    return [this.rowSpacing, this.columnSpacing];
  }
}

export class FrameOfReference {
  constructor(public readonly uid: string) {}
}

export class ImageReference {
  constructor(
    public readonly imageId: string,
    public readonly sopInstanceUid: string,
    public readonly frameIndex: number = 0
  ) {}
}

export interface IInstanceData {
  sopInstanceUid: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  sopClassUid?: string;
  instanceNumber?: number;
  rows?: number;
  columns?: number;
  imagePositionPatient?: [number, number, number];
  imageOrientationPatient?: [number, number, number, number, number, number];
  pixelSpacing?: [number, number];
  sliceThickness?: number;
  bitsAllocated?: number;
  bitsStored?: number;
  highBit?: number;
  pixelRepresentation?: number;
  samplesPerPixel?: number;
  photometricInterpretation?: string;
  windowCenter?: number | number[];
  windowWidth?: number | number[];
  rescaleIntercept?: number;
  rescaleSlope?: number;
  numberOfFrames?: number;
  frameOfReferenceUid?: string;
}

export class Instance {
  public readonly sopInstanceUid: string;
  public readonly seriesInstanceUid: string;
  public readonly studyInstanceUid: string;
  public readonly sopClassUid: string;
  public readonly instanceNumber: number;
  public readonly rows: number;
  public readonly columns: number;
  public readonly imagePositionPatient: [number, number, number];
  public readonly orientation: ImageOrientation;
  public readonly pixelSpacing: PixelSpacing;
  public readonly sliceThickness: number;
  public readonly bitsAllocated: number;
  public readonly bitsStored: number;
  public readonly highBit: number;
  public readonly pixelRepresentation: number;
  public readonly samplesPerPixel: number;
  public readonly photometricInterpretation: string;
  public readonly windowCenter: number;
  public readonly windowWidth: number;
  public readonly rescaleIntercept: number;
  public readonly rescaleSlope: number;
  public readonly numberOfFrames: number;
  public readonly frameOfReferenceUid: string;
  public imageId?: string;

  constructor(data: IInstanceData) {
    this.sopInstanceUid = data.sopInstanceUid;
    this.seriesInstanceUid = data.seriesInstanceUid;
    this.studyInstanceUid = data.studyInstanceUid;
    this.sopClassUid = data.sopClassUid || '1.2.840.10008.5.1.4.1.1.2'; // CT Storage default
    this.instanceNumber = data.instanceNumber !== undefined ? Number(data.instanceNumber) : 1;
    this.rows = Number(data.rows || 512);
    this.columns = Number(data.columns || 512);
    this.imagePositionPatient = data.imagePositionPatient || [0, 0, 0];

    const rawIop = data.imageOrientationPatient || [1, 0, 0, 0, 1, 0];
    this.orientation = new ImageOrientation(
      [rawIop[0], rawIop[1], rawIop[2]],
      [rawIop[3], rawIop[4], rawIop[5]]
    );

    const rawPs = data.pixelSpacing || [1.0, 1.0];
    this.pixelSpacing = new PixelSpacing(Number(rawPs[0]), Number(rawPs[1]));

    this.sliceThickness = Number(data.sliceThickness || 1.25);
    this.bitsAllocated = Number(data.bitsAllocated ?? 16);
    this.bitsStored = Number(data.bitsStored ?? 16);
    this.highBit = Number(data.highBit ?? 15);
    this.pixelRepresentation = Number(data.pixelRepresentation ?? 0);
    this.samplesPerPixel = Number(data.samplesPerPixel ?? 1);
    this.photometricInterpretation = data.photometricInterpretation || 'MONOCHROME2';

    let wc = Array.isArray(data.windowCenter) ? data.windowCenter[0] : data.windowCenter;
    let ww = Array.isArray(data.windowWidth) ? data.windowWidth[0] : data.windowWidth;
    this.windowCenter = Number(wc !== undefined ? wc : 40);
    this.windowWidth = Number(ww !== undefined ? ww : 400);

    this.rescaleIntercept = Number(data.rescaleIntercept ?? 0);
    this.rescaleSlope = Number(data.rescaleSlope ?? 1);
    this.numberOfFrames = Number(data.numberOfFrames || 1);
    this.frameOfReferenceUid = data.frameOfReferenceUid || '1.2.840.10008.1.1';
  }

  /**
   * Calculate distance of slice position along plane normal (Dot Product Projection)
   * d = P • N
   */
  public getSpatialProjectionDistance(): number {
    const [px, py, pz] = this.imagePositionPatient;
    const [nx, ny, nz] = this.orientation.getNormalVector();
    return px * nx + py * ny + pz * nz;
  }
}

export class DisplaySet {
  public readonly displaySetInstanceUid: string;
  public readonly seriesInstanceUid: string;
  public readonly studyInstanceUid: string;
  public readonly modality: string;
  public readonly label: string;
  public readonly isVolumeEligible: boolean;
  public readonly imageIds: string[];
  public readonly instances: Instance[];

  constructor(params: {
    displaySetInstanceUid: string;
    seriesInstanceUid: string;
    studyInstanceUid: string;
    modality: string;
    label: string;
    isVolumeEligible: boolean;
    imageIds: string[];
    instances: Instance[];
  }) {
    this.displaySetInstanceUid = params.displaySetInstanceUid;
    this.seriesInstanceUid = params.seriesInstanceUid;
    this.studyInstanceUid = params.studyInstanceUid;
    this.modality = params.modality;
    this.label = params.label;
    this.isVolumeEligible = params.isVolumeEligible;
    this.imageIds = params.imageIds;
    this.instances = params.instances;
  }
}

export class Series {
  public readonly seriesInstanceUid: string;
  public readonly studyInstanceUid: string;
  public readonly seriesNumber: number;
  public readonly modality: string;
  public readonly seriesDescription: string;
  public readonly instances: Instance[] = [];
  public displaySets: DisplaySet[] = [];

  constructor(params: {
    seriesInstanceUid: string;
    studyInstanceUid: string;
    seriesNumber?: number;
    modality?: string;
    seriesDescription?: string;
  }) {
    this.seriesInstanceUid = params.seriesInstanceUid;
    this.studyInstanceUid = params.studyInstanceUid;
    this.seriesNumber = params.seriesNumber !== undefined ? Number(params.seriesNumber) : 1;
    this.modality = params.modality || 'CT';
    this.seriesDescription = params.seriesDescription || 'DICOM Series';
  }

  public addInstance(instance: Instance): void {
    this.instances.push(instance);
  }
}

export class Study {
  public readonly studyInstanceUid: string;
  public readonly patientName: string;
  public readonly patientId: string;
  public readonly patientBirthDate: string;
  public readonly patientSex: string;
  public readonly studyDate: string;
  public readonly studyTime: string;
  public readonly studyDescription: string;
  public readonly modalitiesInStudy: string[];
  public readonly seriesList: Series[] = [];

  constructor(params: {
    studyInstanceUid: string;
    patientName?: string;
    patientId?: string;
    patientBirthDate?: string;
    patientSex?: string;
    studyDate?: string;
    studyTime?: string;
    studyDescription?: string;
    modalitiesInStudy?: string[];
  }) {
    this.studyInstanceUid = params.studyInstanceUid;
    this.patientName = params.patientName || 'Anonymous';
    this.patientId = params.patientId || 'UNKNOWN';
    this.patientBirthDate = params.patientBirthDate || '';
    this.patientSex = params.patientSex || 'O';
    this.studyDate = params.studyDate || '';
    this.studyTime = params.studyTime || '';
    this.studyDescription = params.studyDescription || 'DICOM Study';
    this.modalitiesInStudy = params.modalitiesInStudy || [];
  }

  public addSeries(series: Series): void {
    this.seriesList.push(series);
  }

  public getSeries(seriesInstanceUid: string): Series | undefined {
    return this.seriesList.find((s) => s.seriesInstanceUid === seriesInstanceUid);
  }
}
