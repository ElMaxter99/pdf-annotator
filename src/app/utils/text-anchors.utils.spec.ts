import {
  findAnchors,
  normalizeAnchorText,
  proposeShifts,
  type PageTextItem,
} from './text-anchors.utils';

const a: PageTextItem[] = [
  { text: 'FACTURA', x: 50, y: 780 },
  { text: 'Fecha', x: 50, y: 700 },
  { text: 'Cliente', x: 50, y: 660 },
  { text: 'Base imponible', x: 50, y: 300 },
  { text: 'TOTAL', x: 50, y: 250 },
];
const shifted = (dx: number, dy: number, from = 0): PageTextItem[] =>
  a.map((item, i) => (i >= from ? { ...item, x: item.x + dx, y: item.y + dy } : item));

describe('text-anchors.utils', () => {
  it('normalizes case, accents and spaces', () => {
    expect(normalizeAnchorText('  Teléfono   Móvil ')).toBe('telefono movil');
  });

  it('pairs equal texts and measures the shift', () => {
    const report = findAnchors(a, shifted(12, -20));
    expect(report.anchors.length).toBe(5);
    expect(report.anchors.every((anchor) => anchor.dx === 12 && anchor.dy === -20)).toBeTrue();
    expect(report.outliers.size).toBe(0);
  });

  it('ignores short texts and numbers', () => {
    const report = findAnchors(
      [{ text: '12', x: 1, y: 1 }, { text: '2024-05', x: 2, y: 2 }, { text: 'No', x: 3, y: 3 }],
      [{ text: '12', x: 5, y: 5 }, { text: '2024-05', x: 6, y: 6 }, { text: 'No', x: 7, y: 7 }],
    );
    expect(report.anchors.length).toBe(0);
  });

  it('applies the scale of A before measuring', () => {
    const report = findAnchors(a, a.map((i) => ({ ...i, x: i.x * 1.1, y: i.y * 1.1 })), 1.1);
    expect(report.anchors.every((anchor) => Math.abs(anchor.dx) < 1e-9)).toBeTrue();
  });

  it('flags an anchor that moves differently as outlier and off by default', () => {
    const b = shifted(10, -10).map((item) =>
      item.text === 'Fecha' ? { ...item, y: item.y - 60 } : item,
    );
    const report = findAnchors(a, b);
    const fecha = report.anchors.find((anchor) => anchor.text === 'Fecha')!;
    expect(report.outliers.has(fecha.id)).toBeTrue();
    expect(report.defaultOff.has(fecha.id)).toBeTrue();
  });

  it('pairs repeated texts by reading order and marks them ambiguous', () => {
    const items = (dy: number): PageTextItem[] => [
      { text: 'Total', x: 50, y: 500 + dy },
      { text: 'Total', x: 50, y: 300 + dy },
    ];
    const report = findAnchors(items(0), items(-8));
    expect(report.anchors.length).toBe(2);
    expect(report.anchors.every((anchor) => anchor.ambiguous && anchor.dy === -8)).toBeTrue();
  });

  it('skips repeated texts whose counts differ', () => {
    const report = findAnchors(
      [{ text: 'Total', x: 1, y: 1 }, { text: 'Total', x: 1, y: 2 }],
      [{ text: 'Total', x: 1, y: 1 }],
    );
    expect(report.anchors.length).toBe(0);
  });

  it('moves each field like its nearest anchors', () => {
    const b = shifted(12, -30, 3); // header stays, table goes down
    b[0] = { ...b[0], x: 62, y: 764 };
    b[1] = { ...b[1], x: 62, y: 684 };
    b[2] = { ...b[2], x: 62, y: 644 };
    const report = findAnchors(a, b);
    const active = new Set(report.anchors.map((anchor) => anchor.id));
    const [top, bottom] = proposeShifts(
      [{ x: 120, y: 700 }, { x: 150, y: 250 }],
      report.anchors,
      active,
    );
    expect(top?.dy).toBe(-16);
    expect(bottom?.dy).toBe(-30);
    expect(bottom?.dx).toBe(12);
  });

  it('estimates fields with no anchor nearby from the typical shift', () => {
    const report = findAnchors(a, shifted(5, -5));
    const active = new Set(report.anchors.map((anchor) => anchor.id));
    const [far] = proposeShifts([{ x: 500, y: 20 }], report.anchors, active);
    expect(far?.confidence).toBe('estimated');
    expect(far?.dx).toBe(5);
  });

  it('caps confidence to low with fewer than three anchors', () => {
    const report = findAnchors(a.slice(0, 2), shifted(5, -5).slice(0, 2));
    const active = new Set(report.anchors.map((anchor) => anchor.id));
    const [only] = proposeShifts([{ x: 50, y: 700 }], report.anchors, active);
    expect(only?.confidence).toBe('low');
  });

  it('gives no shift without active anchors', () => {
    const report = findAnchors(a, shifted(5, -5));
    expect(proposeShifts([{ x: 1, y: 1 }], report.anchors, new Set())).toEqual([null]);
  });

  it('global mode moves everything the same', () => {
    const report = findAnchors(a, shifted(12, -30, 3));
    const active = new Set(report.anchors.map((anchor) => anchor.id));
    const [p, q] = proposeShifts([{ x: 50, y: 700 }, { x: 50, y: 250 }], report.anchors, active, 'global');
    expect(p?.dy).toBe(q?.dy);
  });
});
