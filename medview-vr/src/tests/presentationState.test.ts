import { describe, it, expect } from 'vitest';
import {
  encodeMaskRle, decodeMaskRle, parsePresentationState, matchesVolume,
  PRESENTATION_STATE_SCHEMA, PRESENTATION_STATE_VERSION, PresentationStateError,
} from '@/state/presentationState';
import { PRESET_BONE } from '@/rendering/presets';
import { defaultClipState, defaultCropBox } from '@/rendering/clipping';
import type { PresentationState } from '@/state/presentationState';

const base: PresentationState = {
  schema: PRESENTATION_STATE_SCHEMA,
  version: PRESENTATION_STATE_VERSION,
  createdAt: new Date(0).toISOString(),
  application: { name: 'MedView VR', version: '0.1.0' },
  dataset: {
    studyInstanceUID: '1.2.3', seriesInstanceUID: '1.2.3.4', volumeId: 'v',
    dimensions: [4, 4, 4], spacing: [1, 1, 1], origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  camera: { position: [0, -100, 0], focalPoint: [0, 0, 0], viewUp: [0, 0, 1], parallelProjection: false, parallelScale: 50, viewAngle: 30 },
  renderMode: 'volume',
  transferFunction: PRESET_BONE,
  blendMode: 'composite',
  quality: 'high',
  clipping: defaultClipState(),
  cropBox: defaultCropBox(),
  segmentation: { objects: [] },
  measurements: [],
  surfaces: [],
  ui: { orientationCubeVisible: true, directionLabelsVisible: true, backgroundColor: [0, 0, 0] },
};

describe('mask run-length encoding', () => {
  it('round-trips an empty mask', () => {
    const mask = new Uint8Array(1000);
    expect(Array.from(decodeMaskRle(encodeMaskRle(mask), 1000))).toEqual(Array.from(mask));
  });

  it('round-trips a structured mask', () => {
    const mask = new Uint8Array(5000);
    mask.fill(1, 100, 400);
    mask.fill(7, 2000, 2001);
    mask.fill(3, 4000, 5000);
    const back = decodeMaskRle(encodeMaskRle(mask), 5000);
    expect(Array.from(back)).toEqual(Array.from(mask));
  });

  it('round-trips a noisy mask', () => {
    const mask = new Uint8Array(4096);
    for (let i = 0; i < mask.length; i++) mask[i] = (i * 7919) % 5 === 0 ? 2 : 0;
    expect(Array.from(decodeMaskRle(encodeMaskRle(mask), mask.length))).toEqual(Array.from(mask));
  });

  it('compresses runny masks dramatically', () => {
    const mask = new Uint8Array(1_000_000);
    mask.fill(1, 200_000, 800_000);
    expect(encodeMaskRle(mask).length).toBeLessThan(100);
  });
});

describe('presentation state schema', () => {
  it('parses its own output', () => {
    const parsed = parsePresentationState(JSON.stringify(base));
    expect(parsed.dataset.seriesInstanceUID).toBe('1.2.3.4');
    expect(parsed.transferFunction.id).toBe('bone');
  });

  it('rejects non-JSON', () => {
    expect(() => parsePresentationState('not json')).toThrow(PresentationStateError);
  });

  it('rejects a foreign schema', () => {
    expect(() => parsePresentationState('{"schema":"other","version":1}')).toThrow(/not a MedView/);
  });

  it('refuses a newer schema version rather than misreading it', () => {
    expect(() => parsePresentationState(JSON.stringify({ ...base, version: 99 })))
      .toThrow(/newer version \(v99\)/);
  });

  it('requires a series identity', () => {
    const broken = { ...base, dataset: { ...base.dataset, seriesInstanceUID: '' } };
    expect(() => parsePresentationState(JSON.stringify(broken))).toThrow(/does not name a series/);
  });
});

describe('presentation state / volume matching', () => {
  it('accepts the volume it was made on', () => {
    expect(matchesVolume(base, '1.2.3.4', [4, 4, 4]).matches).toBe(true);
  });

  it('rejects a different series and explains why', () => {
    const r = matchesVolume(base, '9.9.9', [4, 4, 4]);
    expect(r.matches).toBe(false);
    expect(r.reason).toMatch(/different series/);
  });

  it('rejects a different grid so masks are never misapplied', () => {
    const r = matchesVolume(base, '1.2.3.4', [8, 8, 8]);
    expect(r.matches).toBe(false);
    expect(r.reason).toMatch(/cannot be transferred/);
  });
});
