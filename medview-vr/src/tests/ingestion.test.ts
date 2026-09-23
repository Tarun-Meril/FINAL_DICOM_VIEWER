import { describe, it, expect } from 'vitest';
import { zipSync, gzipSync } from 'fflate';
import { extractArchive, untar, looksLikeArchive } from '@/dicom/archive';
import { detectDicom, isDicom } from '@/dicom/detect';
import { transferSyntax, isSupported } from '@/dicom/transferSyntax';
import { groupIntoStudies, selectVolumeSeries, classifySeries, contrastLikelihood } from '@/dicom/seriesSelector';
import { MedViewError, ErrorCode } from '@/core/errors';
import { makeInstance, axialStack } from './fixtures';

const enc = new TextEncoder();

function part10(payload = 'x'): Uint8Array {
  const b = new Uint8Array(200);
  b.set(enc.encode('DICM'), 128);
  b.set(enc.encode(payload), 132);
  return b;
}

describe('DICOM detection', () => {
  it('accepts a Part-10 file regardless of its name', () => {
    expect(detectDicom(part10())).toEqual({ kind: 'part10', dataOffset: 132 });
    expect(isDicom(part10())).toBe(true);
  });

  it('accepts a preamble-less explicit-VR stream', () => {
    const b = new Uint8Array(32);
    new DataView(b.buffer).setUint16(0, 0x0008, true);
    b.set(enc.encode('CS'), 4);
    expect(detectDicom(b).kind).toBe('raw-explicit');
  });

  it('rejects ordinary files with a reason', () => {
    const d = detectDicom(enc.encode('this is a text file, not a DICOM object at all'));
    expect(d.kind).toBe('not-dicom');
    expect((d as { reason: string }).reason).toMatch(/DICM/);
  });

  it('rejects files too short to classify', () => {
    expect(detectDicom(new Uint8Array(4)).kind).toBe('not-dicom');
  });
});

describe('transfer syntax table', () => {
  it('knows the common CT syntaxes', () => {
    expect(transferSyntax('1.2.840.10008.1.2.4.90').codec).toBe('j2k');
    expect(transferSyntax('1.2.840.10008.1.2.1').codec).toBe('raw-le');
    expect(transferSyntax('1.2.840.10008.1.2').explicitVR).toBe(false);
    expect(transferSyntax('1.2.840.10008.1.2.5').codec).toBe('rle');
    expect(transferSyntax('1.2.840.10008.1.2.4.70').codec).toBe('jpeg-lossless');
    expect(isSupported('1.2.840.10008.1.2.4.90')).toBe(true);
  });

  it('flags unknown syntaxes instead of guessing', () => {
    const ts = transferSyntax('1.2.3.4.5');
    expect(ts.codec).toBe('unsupported');
    expect(isSupported('1.2.3.4.5')).toBe(false);
  });

  it('marks lossy syntaxes', () => {
    expect(transferSyntax('1.2.840.10008.1.2.4.50').lossy).toBe(true);
    expect(transferSyntax('1.2.840.10008.1.2.4.90').lossy).toBe(false);
  });
});

describe('archive expansion', () => {
  it('expands a flat ZIP and ignores junk entries', () => {
    const zip = zipSync({
      'study/1.dcm': part10('a'),
      'study/2': part10('b'),
      '__MACOSX/._1.dcm': enc.encode('junk'),
      'study/.DS_Store': enc.encode('junk'),
    });
    const files = extractArchive(zip, 'study.zip');
    expect(files.map((f) => f.path).sort()).toEqual(['study/1.dcm', 'study/2']);
  });

  it('expands a ZIP nested inside a ZIP', () => {
    const inner = zipSync({ 'a.dcm': part10('a') });
    const outer = zipSync({ 'inner.zip': inner });
    const files = extractArchive(outer, 'outer.zip');
    expect(files).toHaveLength(1);
    expect(isDicom(files[0].bytes)).toBe(true);
  });

  it('expands gzip', () => {
    const files = extractArchive(gzipSync(part10('g')), 'a.dcm.gz');
    expect(files).toHaveLength(1);
    expect(isDicom(files[0].bytes)).toBe(true);
  });

  it('reads a ustar tar', () => {
    // Build a minimal tar with one 3-byte file.
    const block = new Uint8Array(1536);
    const name = enc.encode('a.bin');
    block.set(name, 0);
    block.set(enc.encode('0000644\0'), 100);
    block.set(enc.encode('0000000\0'), 108);
    block.set(enc.encode('0000000\0'), 116);
    block.set(enc.encode('00000000003\0'), 124); // size = 3 octal
    block.set(enc.encode('00000000000\0'), 136);
    block.set(enc.encode('        '), 148);
    block[156] = '0'.charCodeAt(0);
    block.set(enc.encode('ustar'), 257);
    block.set(enc.encode('abc'), 512);
    const entries = untar(block);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('a.bin');
    expect(new TextDecoder().decode(entries[0].bytes)).toBe('abc');
  });

  it('tells the user plainly that 7z is not supported', () => {
    const sevenZip = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 0, 0, 0]);
    expect(looksLikeArchive(sevenZip)).toBe(true);
    try { extractArchive(sevenZip, 'study.7z'); expect.unreachable(); }
    catch (e) {
      expect(e).toBeInstanceOf(MedViewError);
      expect((e as MedViewError).code).toBe(ErrorCode.ARCHIVE_UNREADABLE);
      expect((e as MedViewError).message).toMatch(/7-Zip/);
    }
  });

  it('passes a loose non-archive file through unchanged', () => {
    const f = extractArchive(part10('z'), 'loose.dcm');
    expect(f).toHaveLength(1);
    expect(f[0].path).toBe('loose.dcm');
  });
});

describe('series classification and selection', () => {
  it('classifies a volumetric CT series', () => {
    expect(classifySeries(axialStack(Array.from({ length: 40 }, (_, i) => i)), 16)).toBe('volumetric');
  });

  it('classifies a localizer from ImageType and from the description', () => {
    expect(classifySeries(axialStack([0, 1], { imageType: ['ORIGINAL', 'PRIMARY', 'LOCALIZER'] }), 1)).toBe('localizer');
    expect(classifySeries(axialStack([0, 1], { seriesDescription: 'Surview' }), 1)).toBe('localizer');
  });

  it('classifies a secondary capture and a dose report', () => {
    expect(classifySeries([makeInstance({ sopClassUID: '1.2.840.10008.5.1.4.1.1.7' })], 1)).toBe('secondary');
    expect(classifySeries(axialStack([0, 1], { seriesDescription: 'Dose Report' }), 1)).toBe('secondary');
  });

  it('classifies structured reports as non-image', () => {
    expect(classifySeries([makeInstance({ sopClassUID: '1.2.840.10008.5.1.4.1.1.88.11' })], 1)).toBe('non-image');
  });

  it('rejects a series with too few images', () => {
    expect(classifySeries(axialStack([0, 1, 2]), 16)).toBe('single-image');
  });

  it('rejects an unsupported transfer syntax', () => {
    expect(classifySeries(axialStack([0, 1], { transferSyntaxUID: '1.2.3.4.5' }), 1)).toBe('unsupported');
  });

  it('picks the volumetric CT over a localizer and a secondary capture', () => {
    const instances = [
      ...axialStack(Array.from({ length: 60 }, (_, i) => i)),
      ...axialStack([0, 1], {
        seriesInstanceUID: 'loc', imageType: ['ORIGINAL', 'PRIMARY', 'LOCALIZER'], seriesNumber: 2,
      }),
      makeInstance({ seriesInstanceUID: 'sc', sopClassUID: '1.2.840.10008.5.1.4.1.1.7', seriesNumber: 3 }),
    ];
    const studies = groupIntoStudies(instances);
    expect(studies).toHaveLength(1);
    expect(studies[0].series).toHaveLength(3);
    const chosen = selectVolumeSeries(studies);
    expect(chosen?.seriesInstanceUID).toBe('1.2.3.series');
    expect(chosen?.scoreReasons.join(' ')).toMatch(/CT modality/);
  });

  it('prefers the thinner, larger reconstruction between two candidates', () => {
    const thick = axialStack(Array.from({ length: 40 }, (_, i) => i * 5), { seriesInstanceUID: 'thick', seriesNumber: 1 });
    const thin = axialStack(Array.from({ length: 200 }, (_, i) => i * 0.7), { seriesInstanceUID: 'thin', seriesNumber: 2 });
    const chosen = selectVolumeSeries(groupIntoStudies([...thick, ...thin]));
    expect(chosen?.seriesInstanceUID).toBe('thin');
  });

  it('never merges series that share a UID across frames of reference', () => {
    const a = axialStack([0, 1], { frameOfReferenceUID: 'for-a' });
    const b = axialStack([0, 1], { frameOfReferenceUID: 'for-b' });
    expect(groupIntoStudies([...a, ...b])[0].series).toHaveLength(2);
  });

  it('returns null when nothing is volumetric', () => {
    expect(selectVolumeSeries(groupIntoStudies([makeInstance({ sopClassUID: '1.2.840.10008.5.1.4.1.1.7' })]))).toBeNull();
  });

  it('reports contrast likelihood without asserting anatomy', () => {
    const withAgent = groupIntoStudies(axialStack(Array.from({ length: 30 }, (_, i) => i), { contrastBolusAgent: 'OMNIPAQUE' }))[0].series[0];
    expect(contrastLikelihood(withAgent).likely).toBe(true);
    const without = groupIntoStudies(axialStack(Array.from({ length: 30 }, (_, i) => i)))[0].series[0];
    expect(contrastLikelihood(without).likely).toBe(false);
    expect(contrastLikelihood(without).reason).toMatch(/no Contrast/);
  });
});
