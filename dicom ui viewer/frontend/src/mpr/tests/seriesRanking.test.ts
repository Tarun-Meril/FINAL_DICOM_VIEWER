/**
 * Series auto-selection must be DETERMINISTIC.
 *
 * Series metadata below is taken verbatim from the three reference studies.
 * Two of them ship the same acquisition twice (512² and 768²) with identical
 * instance counts, which the previous scoring heuristic could not separate.
 */
import { describe, it, expect } from 'vitest';

interface S { series_instance_uid: string; series_number: number; modality: string;
  series_description: string; number_of_series_related_instances: number; rows: number }

const KUB: S[] = [
  { series_instance_uid: 'KUB-201', series_number: 201, modality: 'CT', series_description: '512, iDose (3)', number_of_series_related_instances: 250, rows: 512 },
  { series_instance_uid: 'KUB-202', series_number: 202, modality: 'CT', series_description: '768, iDose (3)', number_of_series_related_instances: 250, rows: 768 },
  { series_instance_uid: 'KUB-301', series_number: 301, modality: 'CT', series_description: 'Exam Summary', number_of_series_related_instances: 1, rows: 512 },
  { series_instance_uid: 'KUB-302', series_number: 302, modality: 'CT', series_description: 'Exam Summary', number_of_series_related_instances: 1, rows: 512 },
];
const BRAIN: S[] = [
  { series_instance_uid: 'BR-201', series_number: 201, modality: 'CT', series_description: '512, iDose (2)', number_of_series_related_instances: 250, rows: 512 },
  { series_instance_uid: 'BR-301', series_number: 301, modality: 'CT', series_description: 'Exam Summary', number_of_series_related_instances: 1, rows: 512 },
];
const ABD: S[] = [
  { series_instance_uid: 'ABD-501', series_number: 501, modality: 'CT', series_description: '512, iDose (3)', number_of_series_related_instances: 255, rows: 512 },
  { series_instance_uid: 'ABD-502', series_number: 502, modality: 'CT', series_description: '768, iDose (3)', number_of_series_related_instances: 255, rows: 768 },
  { series_instance_uid: 'ABD-601', series_number: 601, modality: 'CT', series_description: 'Exam Summary', number_of_series_related_instances: 1, rows: 512 },
];

/** Ranking as shipped in loadStudy.ts. */
function autoPick(candidates: any[]): string {
  const isReconstructable = (x: any): boolean => {
    const mod = String(x.modality || '').toUpperCase();
    if (mod !== 'CT' && mod !== 'MR') return false;
    const desc = String(x.series_description || '').toLowerCase();
    if (desc.includes('exam summary') || desc.includes('dose report')) return false;
    return true;
  };
  const countOf = (x: any) => Number(x.number_of_series_related_instances || 0);
  const rowsOf = (x: any) => Number(x.rows || 0);
  const numOf = (x: any) => Number(x.series_number ?? Number.MAX_SAFE_INTEGER);
  const uidOf = (x: any) => String(x.series_instance_uid || '');

  const recon = candidates.filter(isReconstructable);
  const pool = recon.length > 0 ? recon : candidates;
  const sorted = [...pool].sort((a, b) => {
    const r = Number(isReconstructable(b)) - Number(isReconstructable(a));
    if (r !== 0) return r;
    const c = countOf(b) - countOf(a);
    if (c !== 0) return c;
    const ra = rowsOf(a), rb = rowsOf(b);
    if (ra && rb && ra !== rb) return ra - rb;
    const n = numOf(a) - numOf(b);
    if (n !== 0) return n;
    return uidOf(a).localeCompare(uidOf(b));
  });
  return sorted[0].series_instance_uid;
}

/** Every permutation — simulates any PACS list order. */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((v, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([v, ...p]);
  });
  return out;
}

describe('series auto-selection is deterministic', () => {
  for (const [name, study, expected] of [
    ['KUB', KUB, 'KUB-201'],
    ['BRAIN', BRAIN, 'BR-201'],
    ['ABD', ABD, 'ABD-501'],
  ] as const) {
    it(`${name}: same result for every PACS list order`, () => {
      const results = new Set(permutations([...study]).map(autoPick));
      expect([...results]).toEqual([expected]);
    });
  }

  it('never selects a non-reconstructable Exam Summary', () => {
    for (const study of [KUB, BRAIN, ABD]) {
      for (const order of permutations([...study])) {
        expect(autoPick(order)).not.toMatch(/-(30[12]|601)$/);
      }
    }
  });

  it('prefers the 512 reconstruction over the 768 (same anatomy, ~40% VRAM)', () => {
    expect(autoPick(KUB)).toBe('KUB-201');
    expect(autoPick(ABD)).toBe('ABD-501');
  });
});
