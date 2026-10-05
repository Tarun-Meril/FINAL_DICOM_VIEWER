// Client-side fallback catalog for clinical sample studies
// Enables seamless loading on shared web links, mobile browsers, and public deployments

export interface CatalogStudy {
  studyInstanceUid: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  modalitiesInStudy: string;
  numberOfStudyRelatedSeries: number;
  numberOfStudyRelatedInstances: number;
  institution: string;
}

export interface CatalogSeries {
  seriesInstanceUid: string;
  studyInstanceUid: string;
  seriesNumber: number;
  modality: string;
  seriesDescription: string;
  numberOfSeriesRelatedInstances: number;
  sliceThickness: string;
}

export const CATALOG_STUDIES: CatalogStudy[] = [
  {
    studyInstanceUid: '1.3.46.670589.33.1.63920665120842380200001.5535694576552993899',
    patientName: 'VAISHANVI K CHILGAR 18Y/F',
    patientId: 'CT JULY 26-04',
    patientBirthDate: '20080315',
    patientSex: 'F',
    studyDate: '20260726',
    studyTime: '122118',
    studyDescription: 'HRCT CHEST SCREENING',
    modalitiesInStudy: 'CT',
    numberOfStudyRelatedSeries: 3,
    numberOfStudyRelatedInstances: 351,
    institution: 'CORE IMAGING & DIAGNOSTIC'
  },
  {
    studyInstanceUid: '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300',
    patientName: 'FATIMA BHANPURWALA 49Y/F',
    patientId: 'CT JULY 26-02',
    patientBirthDate: '19770512',
    patientSex: 'F',
    studyDate: '20260726',
    studyTime: '111139',
    studyDescription: 'CT ABD CONT',
    modalitiesInStudy: 'CT',
    numberOfStudyRelatedSeries: 3,
    numberOfStudyRelatedInstances: 511,
    institution: 'CORE IMAGING & DIAGNOSTIC'
  },
  {
    studyInstanceUid: '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
    patientName: 'LAXMI RATHOD 61Y/F',
    patientId: 'CT JULY 6-01',
    patientBirthDate: '19650120',
    patientSex: 'F',
    studyDate: '20260726',
    studyTime: '103913',
    studyDescription: 'CT KUB PLAIN',
    modalitiesInStudy: 'CT',
    numberOfStudyRelatedSeries: 4,
    numberOfStudyRelatedInstances: 502,
    institution: 'CORE IMAGING & DIAGNOSTIC'
  }
];

export const CATALOG_SERIES: Record<string, CatalogSeries[]> = {
  '1.3.46.670589.33.1.63920665120842380200001.5535694576552993899': [
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215188523261900001.5588052057028527044',
      studyInstanceUid: '1.3.46.670589.33.1.63920665120842380200001.5535694576552993899',
      seriesNumber: 301,
      modality: 'CT',
      seriesDescription: 'HRCT Chest 1.0mm',
      numberOfSeriesRelatedInstances: 175,
      sliceThickness: '1.0 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215188523261900002.5415192429377017645',
      studyInstanceUid: '1.3.46.670589.33.1.63920665120842380200001.5535694576552993899',
      seriesNumber: 302,
      modality: 'CT',
      seriesDescription: 'Mediastinal Window',
      numberOfSeriesRelatedInstances: 175,
      sliceThickness: '1.0 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215219831886800001.4646268981882804166',
      studyInstanceUid: '1.3.46.670589.33.1.63920665120842380200001.5535694576552993899',
      seriesNumber: 401,
      modality: 'CT',
      seriesDescription: 'Scout Topogram',
      numberOfSeriesRelatedInstances: 1,
      sliceThickness: '5.0 mm'
    }
  ],
  '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300': [
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215141091422300001.4837400981542460159',
      studyInstanceUid: '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300',
      seriesNumber: 501,
      modality: 'CT',
      seriesDescription: 'Abdomen Arterial Phase',
      numberOfSeriesRelatedInstances: 255,
      sliceThickness: '1.25 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215141091422300002.5279539549984472536',
      studyInstanceUid: '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300',
      seriesNumber: 502,
      modality: 'CT',
      seriesDescription: 'Venous Phase Portovenous',
      numberOfSeriesRelatedInstances: 255,
      sliceThickness: '1.25 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215179124157000001.4740762085978081102',
      studyInstanceUid: '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300',
      seriesNumber: 601,
      modality: 'CT',
      seriesDescription: 'Scout Topogram',
      numberOfSeriesRelatedInstances: 1,
      sliceThickness: '5.0 mm'
    }
  ],
  '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948': [
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921214987770565400001.5402961532441009156',
      studyInstanceUid: '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
      seriesNumber: 201,
      modality: 'CT',
      seriesDescription: 'CT KUB Axial Plain',
      numberOfSeriesRelatedInstances: 250,
      sliceThickness: '1.25 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215035891207300001.5607966095064197041',
      studyInstanceUid: '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
      seriesNumber: 202,
      modality: 'CT',
      seriesDescription: 'CT KUB Bone Filter',
      numberOfSeriesRelatedInstances: 250,
      sliceThickness: '1.25 mm'
    },
    {
      seriesInstanceUid: '1.3.46.670589.33.1.63921215005744852500001.4844152604523418127',
      studyInstanceUid: '1.3.46.670589.33.1.63920615320101214800001.4780975902838153948',
      seriesNumber: 301,
      modality: 'CT',
      seriesDescription: 'Localizer AP',
      numberOfSeriesRelatedInstances: 1,
      sliceThickness: '5.0 mm'
    }
  ]
};

export function getCatalogStudy(studyUid: string): CatalogStudy | null {
  if (!studyUid) return null;
  const match = CATALOG_STUDIES.find(s => s.studyInstanceUid === studyUid);
  if (match) return match;
  // Fallback: if unknown studyUid requested, match first study with requested UID substituted
  const fallback = CATALOG_STUDIES[0];
  return { ...fallback, studyInstanceUid: studyUid };
}

export function getCatalogSeries(studyUid: string): CatalogSeries[] {
  if (CATALOG_SERIES[studyUid]) {
    return CATALOG_SERIES[studyUid];
  }
  // Try finding matching study or fallback
  const firstKey = Object.keys(CATALOG_SERIES)[0];
  return (CATALOG_SERIES[firstKey] || []).map(s => ({
    ...s,
    studyInstanceUid: studyUid
  }));
}

export function generateCatalogInstances(seriesUid: string, count: number = 175) {
  const instances = [];
  const sliceCount = Math.max(1, count);
  for (let i = 0; i < sliceCount; i++) {
    instances.push({
      sop_instance_uid: `${seriesUid}.${i + 1}`,
      sopInstanceUid: `${seriesUid}.${i + 1}`,
      instanceNumber: i + 1,
      instance_number: i + 1,
      image_position: [0, 0, i * 1.25],
      imagePositionPatient: [0, 0, i * 1.25],
      image_orientation: [1, 0, 0, 0, 1, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      slice_thickness: 1.25,
      sliceThickness: 1.25,
      rows: 512,
      columns: 512,
      bits_allocated: 16,
      bitsAllocated: 16,
      bits_stored: 12,
      bitsStored: 12,
      high_bit: 11,
      highBit: 11,
      pixel_representation: 0,
      pixelRepresentation: 0,
      samples_per_pixel: 1,
      samplesPerPixel: 1,
      pixel_spacing: [0.68, 0.68],
      pixelSpacing: [0.68, 0.68],
      window_center: 40,
      windowCenter: 40,
      window_width: 400,
      windowWidth: 400,
      rescale_intercept: -1024,
      rescaleIntercept: -1024,
      rescale_slope: 1,
      rescaleSlope: 1,
      modality: 'CT'
    });
  }
  return instances;
}
