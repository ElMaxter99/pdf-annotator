import { boxesOverlap, fieldBox, formatPageSize, pageSizeName, pageSizesDiffer, scaleAnnotations } from './page-size.utils';

describe('page size utils', () => {
  it('names known sizes regardless of orientation', () => {
    expect(pageSizeName({ width: 595.28, height: 841.89 })).toBe('A4');
    expect(pageSizeName({ width: 792, height: 612 })).toBe('Letter');
    expect(pageSizeName({ width: 500, height: 500 })).toBe('');
    expect(formatPageSize({ width: 612, height: 792 })).toBe('Letter · 612×792');
  });

  it('detects different sizes with a tolerance', () => {
    expect(pageSizesDiffer({ width: 595, height: 842 }, { width: 595.4, height: 841.6 })).toBeFalse();
    expect(pageSizesDiffer({ width: 595, height: 842 }, { width: 612, height: 792 })).toBeTrue();
  });

  it('scales coordinates without touching the input', () => {
    const pages = [{ num: 1, fields: [{ x: 100, y: 200, mapField: 'a', fontSize: 12, color: '#000000', type: 'text' as const }] }];
    const scaled = scaleAnnotations(pages, { width: 595, height: 842 }, { width: 612, height: 792 });
    expect(scaled[0].fields[0].x).toBeCloseTo(102.86, 2);
    expect(scaled[0].fields[0].y).toBeCloseTo(188.12, 2);
    expect(pages[0].fields[0].x).toBe(100);
  });

  it('computes and compares field boxes', () => {
    const box = fieldBox({ x: 10, y: 10, fontSize: 10 }, 'abcd');
    expect(box).toEqual([10, 10, 30, 20]);
    expect(boxesOverlap(box, [25, 15, 40, 30])).toBeTrue();
    expect(boxesOverlap(box, [30, 10, 40, 20])).toBeFalse();
  });
});
