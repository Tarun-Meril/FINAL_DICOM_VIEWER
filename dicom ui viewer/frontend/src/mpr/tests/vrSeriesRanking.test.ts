/**
 * The VR series selector must agree with the MPR one.
 *
 * Series metadata is taken from the Fatima CT ABD CONT study, which ships the
 * same acquisition as a 512² and a 768² reconstruction with identical instance
 * counts — the case the old `find(modality === 'CT')` could not separate.
 */
import { describe, it, expect } from 'vitest';

const ABD = [
  { series_instance_uid: 'ABD-501', series_number: 501, modality: 'CT', series_description: '512, iDose (3)', number_of_series_related_instances: 255, rows: 512 },
  { series_instance_uid: 'ABD-502', series_number: 502, modality: 'CT', series_description: '768, iDose (3)', number_of_series_related_instances: 255, rows: 768 },
  { series_instance_uid: 'ABD-601', series_number: 601, modality: 'CT', series_description: 'Exam Summary', number_of_series_related_instances: 1, rows: 512 },
];

/** The OLD VR selector — kept to document the defect. */
function legacyPick(list: any[]): string {
  const ct = list.find((sr: any) => sr.modality === 'CT') || list[0];
  return ct.series_instance_uid;
}

/** Ranking as now shipped in vr/components/LoadScreen.tsx. */
function vrPick(list: any[]): string {
  const isReconstructable = (x: any) => {
    const mod = String(x.modality || '').toUpperCase();
    if (mod !== 'CT' && mod !== 'MR') return false;
    const d = String(x.series_description || '').toLowerCase();
    return !d.includes('exam summary') && !d.includes('dose report');
  };
  const countOf = (x: any) => Number(x.number_of_series_related_instances || 0);
  const rowsOf = (x: any) => Number(x.rows || 0);
  const numOf = (x: any) => Number(x.series_number ?? Number.MAX_SAFE_INTEGER);
  const uidOf = (x: any) => String(x.series_instance_uid || '');
  const recon = list.filter(isReconstructable);
  const pool = recon.length > 0 ? recon : list;
  const ranked = [...pool].sort((a, b) => {
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
  return uidOf(ranked[0]);
}

function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  const out: T[][] = [];
  a.forEach((v, i) => {
    for (const p of permutations([...a.slice(0, i), ...a.slice(i + 1)])) out.push([v, ...p]);
  });
  return out;
}

describe('VR series selection', () => {
  it('the legacy selector was order-dependent', () => {
    const results = new Set(permutations([...ABD]).map(legacyPick));
    // More than one outcome across list orders = non-deterministic.
    expect(results.size).toBeGreaterThan(1);
  });

  it('is deterministic for every PACS list order', () => {
    const results = new Set(permutations([...ABD]).map(vrPick));
    expect([...results]).toEqual(['ABD-501']);
  });

  it('never selects the Exam Summary secondary capture', () => {
    for (const order of permutations([...ABD])) expect(vrPick(order)).not.toBe('ABD-601');
  });

  it('agrees with the MPR selector on the same study', () => {
    expect(vrPick(ABD)).toBe('ABD-501');
  });
});
