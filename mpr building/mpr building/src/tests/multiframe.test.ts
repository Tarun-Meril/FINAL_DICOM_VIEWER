import { describe, expect, it } from 'vitest';
import { FakeDataSet } from './fixtures/fakeDataSet';
import { TAG } from '../dicom/tags';
import { frameDescriptorsFromDataSet } from '../dicom/parseFrames';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import { excludeNonVolumetricFrames } from '../core/volume/SeriesValidator';

const makeId = (sop: string, frame: number) => `dicomfile:${sop}?frame=${frame}`;

/**
 * Build an Enhanced CT/MR object: geometry lives ONLY in the functional groups,
 * never at the top level — which is exactly the case that breaks viewers that
 * read Image Position (Patient) from the root dataset.
 */
function makeEnhanced(options: {
  modality: string;
  frames: number;
  sliceSpacing: number;
  pixelSpacing?: [number, number];
  perFrameOrientation?: boolean;
  localizerFrames?: number[];
}): FakeDataSet {
  const {
    modality,
    frames,
    sliceSpacing,
    pixelSpacing = [0.6, 0.6],
    perFrameOrientation = false,
    localizerFrames = [],
  } = options;

  const shared = new FakeDataSet(
    {},
    {
      [TAG.PixelMeasuresSequence]: [
        new FakeDataSet({
          [TAG.PixelSpacing]: `${pixelSpacing[0]}\\${pixelSpacing[1]}`,
          [TAG.SliceThickness]: `${sliceSpacing}`,
          [TAG.SpacingBetweenSlices]: `${sliceSpacing}`,
        }),
      ],
      ...(perFrameOrientation
        ? {}
        : {
            [TAG.PlaneOrientationSequence]: [
              new FakeDataSet({
                [TAG.ImageOrientationPatient]: '1\\0\\0\\0\\1\\0',
              }),
            ],
          }),
      [TAG.PixelValueTransformationSequence]: [
        new FakeDataSet(
          modality === 'CT'
            ? { [TAG.RescaleSlope]: '1', [TAG.RescaleIntercept]: '-1024' }
            : { [TAG.RescaleSlope]: '1', [TAG.RescaleIntercept]: '0' },
        ),
      ],
    },
  );

  const perFrame: FakeDataSet[] = [];
  for (let f = 0; f < frames; f++) {
    const z = -120 + f * sliceSpacing;
    const sequences: Record<string, FakeDataSet[]> = {
      [TAG.PlanePositionSequence]: [
        new FakeDataSet({
          [TAG.ImagePositionPatient]: `-153.6\\-153.6\\${z}`,
        }),
      ],
      [TAG.FrameContentSequence]: [
        new FakeDataSet({ [TAG.InStackPositionNumber]: `${f + 1}` }),
      ],
    };
    if (perFrameOrientation) {
      sequences[TAG.PlaneOrientationSequence] = [
        new FakeDataSet({ [TAG.ImageOrientationPatient]: '1\\0\\0\\0\\1\\0' }),
      ];
    }
    if (localizerFrames.includes(f)) {
      const frameTypeSeq =
        modality === 'CT' ? TAG.CTImageFrameTypeSequence : TAG.MRImageFrameTypeSequence;
      sequences[frameTypeSeq] = [
        new FakeDataSet({ [TAG.FrameType]: 'DERIVED\\PRIMARY\\LOCALIZER' }),
      ];
    }
    perFrame.push(new FakeDataSet({}, sequences));
  }

  return new FakeDataSet(
    {
      [TAG.SOPInstanceUID]: '1.2.3.4.5.6.7',
      [TAG.SeriesInstanceUID]: '1.2.3.4.5.6',
      [TAG.StudyInstanceUID]: '1.2.3.4.5',
      [TAG.FrameOfReferenceUID]: '1.2.3.4.5.99',
      [TAG.Modality]: modality,
      [TAG.Rows]: '512',
      [TAG.Columns]: '512',
      [TAG.NumberOfFrames]: `${frames}`,
      [TAG.SOPClassUID]:
        modality === 'CT'
          ? '1.2.840.10008.5.1.4.1.1.2.1'
          : '1.2.840.10008.5.1.4.1.1.4.1',
      [TAG.SeriesDescription]: `Enhanced ${modality}`,
      [TAG.ImageType]: 'ORIGINAL\\PRIMARY\\VOLUME',
    },
    {
      [TAG.SharedFunctionalGroupsSequence]: [shared],
      [TAG.PerFrameFunctionalGroupsSequence]: perFrame,
    },
  );
}

describe('25. Enhanced multi-frame CT', () => {
  const ds = makeEnhanced({ modality: 'CT', frames: 80, sliceSpacing: 1.5 });
  const frames = frameDescriptorsFromDataSet(ds as never, { makeId });

  it('produces one descriptor per frame', () => {
    expect(frames).toHaveLength(80);
    expect(frames[0].frameIndex).toBe(0);
    expect(frames[79].frameIndex).toBe(79);
  });

  it('reads geometry from the functional groups, not the root dataset', () => {
    expect(frames[0].imagePositionPatient[2]).toBeCloseTo(-120, 9);
    expect(frames[10].imagePositionPatient[2]).toBeCloseTo(-120 + 15, 9);
    expect(frames[0].imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    expect(frames[0].pixelSpacing).toEqual([0.6, 0.6]);
  });

  it('reads the rescale transform from the Pixel Value Transformation Sequence', () => {
    expect(frames[0].rescaleSlope).toBe(1);
    expect(frames[0].rescaleIntercept).toBe(-1024);
  });

  it('builds a valid volume', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.verdict).toBe('ok');
    expect(g.dimensions).toEqual([512, 512, 80]);
    expect(g.spacing[2]).toBeCloseTo(1.5, 9);
  });

  it('keeps every frame uniquely addressable', () => {
    expect(new Set(frames.map((f) => f.id)).size).toBe(80);
  });
});

describe('25. Enhanced multi-frame MRI', () => {
  const ds = makeEnhanced({
    modality: 'MR',
    frames: 40,
    sliceSpacing: 3,
    pixelSpacing: [0.9, 0.45],
    perFrameOrientation: true,
  });
  const frames = frameDescriptorsFromDataSet(ds as never, { makeId });

  it('resolves per-frame orientation', () => {
    expect(frames[39].imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it('maps anisotropic pixel spacing onto the right axes', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.spacing[0]).toBeCloseTo(0.45, 9); // along rowDirection
    expect(g.spacing[1]).toBeCloseTo(0.9, 9); // along columnDirection
    expect(g.spacing[2]).toBeCloseTo(3, 9);
    expect(g.modality).toBe('MR');
  });

  it('does not invent a CT rescale for MR', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.frames[0].rescaleIntercept).toBe(0);
  });
});

describe('24. Localiser frames inside an Enhanced object', () => {
  it('excludes frames whose frame type declares LOCALIZER', () => {
    const ds = makeEnhanced({
      modality: 'CT',
      frames: 10,
      sliceSpacing: 2,
      localizerFrames: [0, 1],
    });
    const frames = frameDescriptorsFromDataSet(ds as never, { makeId });
    const result = excludeNonVolumetricFrames(frames);
    expect(result.accepted).toHaveLength(8);
    expect(result.excluded).toHaveLength(2);
  });
});
