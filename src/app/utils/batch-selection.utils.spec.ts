import type { BatchItem } from '../models/batch.model';
import { planBulk, pruneSelection, rangeBetween } from './batch-selection.utils';

function item(over: Partial<BatchItem>): BatchItem {
  return {
    id: 'x',
    name: 'x.pdf',
    aPdf: new Blob(['a']),
    aPages: [{ num: 1, fields: [{ id: 'f' } as never] }],
    bPdf: null,
    bName: null,
    bPages: null,
    bJson: null,
    links: [],
    dismissed: [],
    status: 'review',
    updatedAt: 0,
    ...over,
  } as BatchItem;
}

describe('batch selection utils', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('rangeBetween covers the ids between anchor and target in either direction', () => {
    expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('rangeBetween falls back to the target when there is no usable anchor', () => {
    expect(rangeBetween(ids, null, 'c')).toEqual(['c']);
    expect(rangeBetween(ids, 'zzz', 'c')).toEqual(['c']);
    expect(rangeBetween(ids, 'a', 'zzz')).toEqual([]);
  });

  it('pruneSelection drops hidden ids and keeps the same set when nothing changes', () => {
    const all = new Set(['a', 'b']);
    expect(pruneSelection(all, ids)).toBe(all);
    expect([...pruneSelection(all, ['b', 'c'])]).toEqual(['b']);
  });

  it('planBulk counts what each action can take', () => {
    const items = [
      item({ id: '1', bPdf: new Blob(['b']) }),
      item({ id: '2', bPdf: new Blob(['b']), status: 'ready', bJson: '{}' }),
      item({ id: '3', aPages: [] }),
    ];
    const plan = planBulk(items, (i) => i.aPages.length === 0 && !i.bPdf);
    expect(plan).toEqual({ total: 3, ai: 1, download: 1, ready: 1 });
  });
});
