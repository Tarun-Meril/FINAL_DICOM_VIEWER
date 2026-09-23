# MPR acceptance harness

Runs the real reconstruction pipeline (parseFrames -> DICOMGeometry ->
SeriesValidator -> prepareVolume) against an unpacked DICOM study and prints
what the engine derived: patient identity per frame, candidate series, voxel
spacing, geometry verdict, rescale/units and volume size.

## Install

  cp tests/realStudy.acceptance.test.ts  <frontend>/src/mpr/tests/
  cp stubs/*.ts                          <frontend>/stubs/

Add the aliases to your vitest config so the Node run does not pull in the
browser-only Cornerstone modules:

  resolve: { alias: {
    '@cornerstonejs/dicom-image-loader': './stubs/dicom-image-loader.ts',
    '@cornerstonejs/core':               './stubs/cornerstone-core.ts',
  }}

## Run

  MPR_DATASET_DIR=/path/to/unpacked/study npx vitest run realStudy.acceptance

Skips automatically when MPR_DATASET_DIR is unset.

## What to check in the output

- IDENTITY: exactly ONE patientName and ONE patientId, and
  "identities registered: N of N frames". Anything else is a
  wrong-patient defect.
- GROUPING: one candidate per real acquisition.
- verdict=ok and units=HU for CT. units != HU means the modality LUT
  did not apply and window presets will be empty.
