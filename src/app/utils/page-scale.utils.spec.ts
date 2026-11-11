import { pageScaleFactors, scalePagesToSize, sizeOfPage, sizesDiffer } from './page-scale.utils';

const field = { x: 100, y: 200, mapField: 'a', fontSize: 10, color: '#000', type: 'text' as const };
const A4 = { w: 595, h: 842 };
const A4_LANDSCAPE = { w: 842, h: 595 };

describe('page-scale.utils', () => {
  it('detects different sizes with a 2 point tolerance', () => {
    expect(sizesDiffer([A4], [{ w: 596, h: 841 }])).toBeFalse();
    expect(sizesDiffer([A4], [A4_LANDSCAPE])).toBeTrue();
    expect(sizesDiffer([], [A4])).toBeFalse();
  });

  it('uses the last page when a page is missing', () => {
    expect(sizeOfPage([A4, A4_LANDSCAPE], 5)).toEqual(A4_LANDSCAPE);
    expect(sizeOfPage([], 1)).toBeNull();
  });

  it('scales x and y by the ratios and the font by the smaller one', () => {
    const [page] = scalePagesToSize([{ num: 1, fields: [field] }], [A4], [A4_LANDSCAPE]);
    const sx = 842 / 595;
    const sy = 595 / 842;
    expect(page.fields[0].x).toBeCloseTo(100 * sx, 2);
    expect(page.fields[0].y).toBeCloseTo(200 * sy, 2);
    expect(page.fields[0].fontSize).toBeCloseTo(10 * sy, 2);
  });

  it('does not change the source and leaves equal pages alone', () => {
    const pages = [{ num: 1, fields: [field] }];
    scalePagesToSize(pages, [A4], [A4_LANDSCAPE]);
    expect(pages[0].fields[0].x).toBe(100);
    expect(scalePagesToSize(pages, [A4], [A4])[0]).toBe(pages[0]);
  });

  it('falls back to 1 without sizes', () => {
    expect(pageScaleFactors(null, A4)).toEqual({ sx: 1, sy: 1 });
  });
});
