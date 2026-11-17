import type { PageMapData } from '../models/batch.model';
import {
  analyzePageMap,
  identityMap,
  mapPageOfA,
  pageSimilarity,
  reconcileMap,
  remapPagesToB,
  sanitizePageMap,
  shiftMap,
  sizesOfAByB,
  suggestPageMap,
  uniformOffset,
} from './page-map.utils';

const map = (pairs: (number | null)[], origin: 'auto' | 'manual' | 'number' | 'new' = 'manual'): PageMapData => ({
  pairs,
  origins: pairs.map(() => origin),
});

describe('page-map.utils', () => {
  it('matches by number without a table or with an identity one', () => {
    expect(mapPageOfA(null, 3)).toBe(3);
    expect(identityMap(3, 4).pairs).toEqual([1, 2, 3, null]);
    expect(mapPageOfA(identityMap(3, 4), 4)).toBeNull();
  });

  it('shifts every match and drops the ones that fall out of A', () => {
    const shifted = shiftMap(identityMap(3, 4), -1, 3);
    expect(shifted.pairs).toEqual([null, 1, 2, 3]);
    expect(shiftMap(shifted, 1, 3).pairs).toEqual([1, 2, 3, null]);
    expect(shiftMap(map([2, null, 1]), 1, 3).pairs).toEqual([3, null, 2]);
    expect(uniformOffset([null, 1, 2, 3])).toBe(-1);
    expect(uniformOffset([2, 1])).toBeNull();
  });

  it('reconciles a stored table when a version changes size', () => {
    const base = map([null, 1, 2, 3]);
    expect(reconcileMap(base, 3, 4)).toBe(base);
    const grown = reconcileMap(base, 3, 5);
    expect(grown.pairs).toEqual([null, 1, 2, 3, null]);
    expect(grown.origins[4]).toBe('new');
    const smallerA = reconcileMap(base, 2, 4);
    expect(smallerA.pairs).toEqual([null, 1, 2, null]);
    expect(smallerA.origins[3]).toBe('new');
  });

  it('reports repeated, unused and pending pages', () => {
    const report = analyzePageMap({ pairs: [1, 1, null, null], origins: ['manual', 'manual', 'new', 'auto'] }, 3);
    expect(report.matched).toBe(2);
    expect([...report.repeatedRows]).toEqual([1, 2]);
    expect(report.unusedA).toEqual([2, 3]);
    expect(report.manual).toBe(2);
    expect(report.pending).toBe(1);
  });

  it('renumbers the pages of A to the pages of B, repeats included', () => {
    const pages = [
      { num: 1, fields: [{ x: 1 }] },
      { num: 2, fields: [{ x: 2 }] },
    ] as never;
    const out = remapPagesToB(pages, [null, 1, 1, 2]);
    expect(out.map((page) => page.num)).toEqual([2, 3, 4]);
    expect(out[0].fields).toEqual([{ x: 1 }] as never);
    expect(out[2].fields).toEqual([{ x: 2 }] as never);
  });

  it('lays the sizes of A out by page of B', () => {
    const sizes = [{ w: 1, h: 1 }, { w: 2, h: 2 }];
    expect(sizesOfAByB(sizes, [null, 1, 2]).map((s) => s.w)).toEqual([1, 1, 2]);
    expect(sizesOfAByB([], [1])).toEqual([]);
  });

  it('rebuilds untrusted tables', () => {
    expect(sanitizePageMap(null)).toBeUndefined();
    expect(sanitizePageMap({ pairs: [] })).toBeUndefined();
    const safe = sanitizePageMap({ pairs: [1, 'x', -2, 3.5, 4], origins: ['auto', 'zzz'] })!;
    expect(safe.pairs).toEqual([1, null, null, null, 4]);
    expect(safe.origins).toEqual(['auto', 'manual', 'manual', 'manual', 'manual']);
  });

  it('compares the words of two pages', () => {
    expect(pageSimilarity('Factura de cliente número', 'factura cliente número total')).toBeGreaterThan(0.5);
    expect(pageSimilarity('', 'algo')).toBe(0);
  });

  it('suggests a table from the texts, keeping what was set by hand', () => {
    const a = ['factura cliente importe total', 'condiciones generales pago plazo', 'firma contrato fecha lugar'];
    const b = ['portada nueva documento', ...a];
    const suggestion = suggestPageMap(a, b);
    expect(suggestion.map.pairs).toEqual([null, 1, 2, 3]);
    expect(suggestion.scores[1]).toBe(1);
    const kept = suggestPageMap(a, b, { pairs: [3, null, null, null], origins: ['manual', 'auto', 'auto', 'auto'] });
    expect(kept.map.pairs[0]).toBe(3);
    expect(kept.map.pairs[3]).toBeNull();
  });
});
