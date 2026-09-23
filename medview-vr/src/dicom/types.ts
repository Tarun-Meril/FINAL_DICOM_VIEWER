import type { Vec3 } from '@/math/vec3';

/** Pixel-encoding description taken verbatim from the dataset (§5). */
export interface PixelEncoding {
  readonly bitsAllocated: number;
  readonly bitsStored: number;
  readonly highBit: number;
  /** 0 = unsigned, 1 = two's-complement signed. */
  readonly pixelRepresentation: 0 | 1;
  readonly samplesPerPixel: number;
  readonly photometricInterpretation: string;
  readonly planarConfiguration?: number;
}

/** Modality LUT (rescale) parameters. */
export interface RescaleInfo {
  readonly slope: number;
  readonly intercept: number;
  readonly rescaleType?: string;
  readonly pixelPaddingValue?: number;
  readonly pixelPaddingRangeLimit?: number;
}

export interface InstanceGeometry {
  /** (0020,0032) Image Position (Patient), LPS mm. */
  readonly imagePositionPatient?: Vec3;
  /** (0020,0037) Image Orientation (Patient): row cosines then column cosines. */
  readonly imageOrientationPatient?: readonly [number, number, number, number, number, number];
  /** (0028,0030) Pixel Spacing as stored: [betweenRows, betweenColumns] mm. */
  readonly pixelSpacing?: readonly [number, number];
  readonly sliceThickness?: number;
  readonly spacingBetweenSlices?: number;
  readonly sliceLocation?: number;
  readonly frameOfReferenceUID?: string;
  readonly patientPosition?: string;
  readonly gantryDetectorTilt?: number;
}

/** Everything the pipeline needs about one image instance, without pixel data. */
export interface DicomInstanceMeta extends InstanceGeometry {
  readonly fileId: string;
  readonly fileSize: number;
  readonly sopClassUID: string;
  readonly sopInstanceUID: string;
  readonly transferSyntaxUID: string;
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly modality: string;
  readonly seriesNumber?: number;
  readonly instanceNumber?: number;
  readonly acquisitionNumber?: number;
  readonly seriesDescription?: string;
  readonly studyDescription?: string;
  readonly imageType: readonly string[];
  readonly rows: number;
  readonly columns: number;
  readonly numberOfFrames: number;
  readonly encoding: PixelEncoding;
  readonly rescale: RescaleInfo;
  readonly windowCenter?: readonly number[];
  readonly windowWidth?: readonly number[];
  readonly convolutionKernel?: string;
  readonly manufacturer?: string;
  readonly manufacturerModelName?: string;
  readonly kvp?: string;
  readonly contrastBolusAgent?: string;
  readonly studyDate?: string;
  readonly seriesDate?: string;
  readonly protocolName?: string;
  readonly bodyPartExamined?: string;
  readonly lossyImageCompression?: string;
  /** True when PixelData is present (absent for some SR/PR objects). */
  readonly hasPixelData: boolean;
}

export interface DecodedFrame {
  readonly pixelData: Int16Array | Uint16Array | Uint8Array;
  readonly rows: number;
  readonly columns: number;
  readonly samplesPerPixel: number;
  readonly signed: boolean;
  readonly bitsStored: number;
}

export type SeriesRole =
  | 'volumetric'      /** consistent geometry, enough slices to build a volume */
  | 'localizer'       /** scout / topogram */
  | 'secondary'       /** secondary capture / screenshot / results */
  | 'derived'         /** derived, non-primary reconstructions */
  | 'single-image'    /** too few images */
  | 'non-image'       /** SR, PR, RTSTRUCT, ... */
  | 'unsupported';

export interface SeriesSummary {
  readonly seriesInstanceUID: string;
  readonly studyInstanceUID: string;
  readonly frameOfReferenceUID?: string;
  readonly modality: string;
  readonly seriesNumber?: number;
  readonly seriesDescription?: string;
  readonly imageType: readonly string[];
  readonly instanceCount: number;
  readonly frameCount: number;
  readonly rows: number;
  readonly columns: number;
  readonly pixelSpacing?: readonly [number, number];
  readonly sliceThickness?: number;
  readonly spacingBetweenSlices?: number;
  readonly imageOrientationPatient?: readonly [number, number, number, number, number, number];
  readonly patientPosition?: string;
  readonly transferSyntaxUID: string;
  readonly transferSyntaxName: string;
  readonly convolutionKernel?: string;
  readonly manufacturer?: string;
  readonly manufacturerModelName?: string;
  readonly contrastBolusAgent?: string;
  readonly role: SeriesRole;
  /** 0..1 suitability for CT 3D volume rendering. */
  readonly volumeScore: number;
  readonly scoreReasons: readonly string[];
  readonly instances: readonly DicomInstanceMeta[];
}

export interface StudySummary {
  readonly studyInstanceUID: string;
  readonly studyDescription?: string;
  readonly studyDate?: string;
  readonly series: readonly SeriesSummary[];
}
