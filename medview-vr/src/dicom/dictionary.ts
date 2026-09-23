/** dicom-parser uses lowercase 'xGGGGEEEE' tag keys. Centralised so no magic strings leak. */
export const T = {
  TransferSyntaxUID: 'x00020010',
  SOPClassUID: 'x00080016',
  SOPInstanceUID: 'x00080018',
  StudyDate: 'x00080020',
  SeriesDate: 'x00080021',
  Modality: 'x00080060',
  Manufacturer: 'x00080070',
  InstitutionName: 'x00080080',
  StudyDescription: 'x00081030',
  SeriesDescription: 'x0008103e',
  ManufacturerModelName: 'x00081090',
  PatientName: 'x00100010',
  PatientID: 'x00100020',
  PatientBirthDate: 'x00100030',
  PatientSex: 'x00100040',
  PatientAge: 'x00101010',
  BodyPartExamined: 'x00180015',
  ContrastBolusAgent: 'x00180010',
  SliceThickness: 'x00180050',
  KVP: 'x00180060',
  SpacingBetweenSlices: 'x00180088',
  ProtocolName: 'x00181030',
  ReconstructionDiameter: 'x00181100',
  GantryDetectorTilt: 'x00181120',
  ConvolutionKernel: 'x00181210',
  PatientPosition: 'x00185100',
  StudyInstanceUID: 'x0020000d',
  SeriesInstanceUID: 'x0020000e',
  SeriesNumber: 'x00200011',
  AcquisitionNumber: 'x00200012',
  InstanceNumber: 'x00200013',
  ImagePositionPatient: 'x00200032',
  ImageOrientationPatient: 'x00200037',
  FrameOfReferenceUID: 'x00200052',
  SliceLocation: 'x00201041',
  ImageType: 'x00080008',
  SamplesPerPixel: 'x00280002',
  PhotometricInterpretation: 'x00280004',
  PlanarConfiguration: 'x00280006',
  NumberOfFrames: 'x00280008',
  Rows: 'x00280010',
  Columns: 'x00280011',
  PixelSpacing: 'x00280030',
  BitsAllocated: 'x00280100',
  BitsStored: 'x00280101',
  HighBit: 'x00280102',
  PixelRepresentation: 'x00280103',
  SmallestImagePixelValue: 'x00280106',
  LargestImagePixelValue: 'x00280107',
  PixelPaddingValue: 'x00280120',
  PixelPaddingRangeLimit: 'x00281011',
  WindowCenter: 'x00281050',
  WindowWidth: 'x00281051',
  RescaleIntercept: 'x00281052',
  RescaleSlope: 'x00281053',
  RescaleType: 'x00281054',
  LossyImageCompression: 'x00282110',
  SharedFunctionalGroups: 'x52009229',
  PerFrameFunctionalGroups: 'x52009230',
  PixelData: 'x7fe00010',
} as const;

/** SOP Class UIDs that are never volumetric image data. */
export const NON_IMAGE_SOP_CLASSES = new Set<string>([
  '1.2.840.10008.5.1.4.1.1.11.1', // Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.88.11', // Basic Text SR
  '1.2.840.10008.5.1.4.1.1.88.22', // Enhanced SR
  '1.2.840.10008.5.1.4.1.1.88.33', // Comprehensive SR
  '1.2.840.10008.5.1.4.1.1.481.3', // RT Structure Set
  '1.2.840.10008.5.1.4.1.1.66', // Raw Data
  '1.2.840.10008.5.1.4.1.1.66.4', // Segmentation
  '1.2.840.10008.5.1.4.1.1.104.1', // Encapsulated PDF
  '1.2.840.10008.5.1.4.1.1.9.1.1', // 12-lead ECG
]);

export const SECONDARY_CAPTURE_SOP_CLASSES = new Set<string>([
  '1.2.840.10008.5.1.4.1.1.7', // Secondary Capture
  '1.2.840.10008.5.1.4.1.1.7.1',
  '1.2.840.10008.5.1.4.1.1.7.2',
  '1.2.840.10008.5.1.4.1.1.7.3',
  '1.2.840.10008.5.1.4.1.1.7.4',
]);

export const CT_SOP_CLASSES = new Set<string>([
  '1.2.840.10008.5.1.4.1.1.2', // CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.1', // Enhanced CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.2', // Legacy Converted Enhanced CT
]);
