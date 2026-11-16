import type { BatchItem } from '../models/batch.model';
import { aiReasonOf, buildAiBreakdown, buildFunnel, kindOf, matchesKind } from './batch-summary.utils';

const make = (fields: number, withB: boolean, status: BatchItem['status'] = 'review'): BatchItem =>
  ({
    id: 'x',
    name: 'x.pdf',
    aPdf: new Blob(),
    aPages: fields ? [{ num: 1, fields: Array.from({ length: fields }, () => ({}) as never) }] : [],
    bPdf: withB ? new Blob() : null,
    bName: null,
    bPages: null,
    bJson: null,
    links: [],
    dismissed: [],
    status,
    updatedAt: 0,
  }) as BatchItem;

describe('batch-summary.utils', () => {
  it('classifies what a PDF has', () => {
    expect(kindOf(make(0, false))).toBe('none');
    expect(kindOf(make(2, false))).toBe('onlyA');
    expect(kindOf(make(2, true))).toBe('aPlusB');
    expect(kindOf(make(0, true))).toBe('onlyB');
  });

  it('explains why a PDF stays out of the AI', () => {
    expect(aiReasonOf(make(2, true))).toBe('eligible');
    expect(aiReasonOf(make(2, false))).toBe('noB');
    expect(aiReasonOf(make(0, true))).toBe('noFields');
    expect(aiReasonOf(make(2, true, 'ready'))).toBe('ready');
  });

  it('builds the funnel and the AI breakdown from the same rule', () => {
    const items = [make(2, true), make(2, true), make(0, true), make(3, false), make(0, false), make(2, true, 'ready')];
    const f = buildFunnel(items);
    expect(f).toEqual(jasmine.objectContaining({ total: 6, none: 1, onlyA: 1, aPlusB: 3, onlyB: 1, withA: 4, withB: 4, ai: 2, ready: 1, pending: 4 }));
    const b = buildAiBreakdown(items);
    expect(b).toEqual({ eligible: 2, noB: 2, ready: 1, noFields: 1, withB: 4 });
    expect(items.filter((i) => matchesKind(i, 'ai')).length).toBe(f.ai);
  });
});
