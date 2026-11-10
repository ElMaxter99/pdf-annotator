import type { PageAnnotations } from '../models/annotation.model';
import { diffTemplates, moveFieldToPage, templatePageOfField } from './batch-diff.utils';

const f = (mapField: string, x = 10, y = 10) => ({ x, y, mapField, fontSize: 12 }) as never;
const pages = (...p: [number, ...string[]][]): PageAnnotations[] =>
  p.map(([num, ...names]) => ({ num, fields: names.map((n) => f(n)) }));

describe('diffTemplates', () => {
  it('tells same, moved, page change, new and missing apart', () => {
    const a: PageAnnotations[] = [
      { num: 1, fields: [f('nombre'), f('fecha', 60, 560)] },
      { num: 2, fields: [f('domicilio'), f('cp')] },
    ];
    const b: PageAnnotations[] = [
      { num: 1, fields: [f('nombre'), f('fecha', 330, 760), f('domicilio'), f('hoy')] },
    ];
    const report = diffTemplates(a, b);
    expect(report.counts).toEqual({ same: 1, moved: 1, page: 1, new: 1, missing: 1 });
    expect(report.pagesA).toBe(2);
    expect(report.pagesB).toBe(1);
    expect(report.rows.find((r) => r.key === 'domicilio')?.kind).toBe('page');
    expect(report.rows.find((r) => r.key === 'hoy')?.kind).toBe('new');
    expect(report.rows.find((r) => r.key === 'cp')?.kind).toBe('missing');
  });

  it('handles empty sets', () => {
    expect(diffTemplates(null, null).rows).toEqual([]);
  });
});

describe('templatePageOfField', () => {
  it('finds the page of a named field', () => {
    expect(templatePageOfField(pages([1, 'a'], [2, 'b']), 'b')).toBe(2);
    expect(templatePageOfField(pages([1, 'a']), 'zz')).toBeNull();
    expect(templatePageOfField(pages([1, 'a']), undefined)).toBeNull();
  });
});

describe('moveFieldToPage', () => {
  it('moves a field to another page and creates it', () => {
    const out = moveFieldToPage(pages([2, 'a', 'b']), 2, 0, 1);
    expect(out.find((p) => p.num === 1)?.fields.map((x) => x.mapField)).toEqual(['a']);
    expect(out.find((p) => p.num === 2)?.fields.map((x) => x.mapField)).toEqual(['b']);
  });
});
