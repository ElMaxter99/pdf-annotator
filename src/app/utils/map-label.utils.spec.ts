import {
  DEFAULT_MAP_LABEL_SETTINGS,
  normalizeMapLabelMax,
  normalizeMapLabelSettings,
  placeLabels,
  shortenMapField,
  splitMapField,
  wantsMapLabel,
} from './map-label.utils';

describe('map-label.utils', () => {
  it('keeps the end of the name and the indices', () => {
    expect(shortenMapField('contrato.intervinientes[0].condicion.esTitular', 18)).toBe('[0]…esTitular');
    expect(shortenMapField('contrato.intervinientes[2].condicion.esCotitular', 18)).toBe(
      '[2]…esCotitular',
    );
    expect(shortenMapField('a.b', 18)).toBe('a.b');
  });

  it('cuts from the start when the last segment alone does not fit', () => {
    expect(shortenMapField('x.esUnaCondicionMuyLarga', 8)).toBe('…uyLarga');
    expect(shortenMapField('x.esUnaCondicionMuyLarga', 8).length).toBe(8);
  });

  it('drops the indices when they do not fit with the tail', () => {
    expect(shortenMapField('a.items[10][3].esCotitular', 14)).toBe('…esCotitular');
  });

  it('splits prefix and tail', () => {
    expect(splitMapField('a.b.c')).toEqual({ prefix: 'a.b.', tail: 'c' });
    expect(splitMapField('solo')).toEqual({ prefix: '', tail: 'solo' });
  });

  it('normalizes saved settings', () => {
    expect(normalizeMapLabelSettings(null)).toEqual(DEFAULT_MAP_LABEL_SETTINGS);
    expect(
      normalizeMapLabelSettings({ show: true, scope: 'all', max: 99, position: 'x', tooltip: false }),
    ).toEqual({ show: true, scope: 'all', max: 18, position: 'auto', tooltip: false });
    expect(normalizeMapLabelMax('24')).toBe(24);
    expect(normalizeMapLabelMax(3)).toBeNull();
    expect(normalizeMapLabelMax('')).toBeNull();
  });

  it('decides who gets a label', () => {
    expect(wantsMapLabel('check', 'check', 'sample', false)).toBeTrue();
    expect(wantsMapLabel('text', 'check', 'sample', false)).toBeFalse();
    expect(wantsMapLabel('text', 'all', 'sample', false)).toBeTrue();
    expect(wantsMapLabel('text', 'all', 'map', false)).toBeFalse();
    expect(wantsMapLabel('text', 'all', 'map', true)).toBeTrue();
    expect(wantsMapLabel('radio', 'all', 'map', false)).toBeTrue();
  });

  it('uses the second lane when labels would collide, then hides', () => {
    const label = { w: 70, h: 12 };
    const boxes = [0, 1, 2].map((i) => ({ x: 30 + i * 40, y: 50, w: 18, h: 18 }));
    const items = boxes.map((box) => ({ box, label }));
    const slots = placeLabels(items, boxes, 'auto').map((p) => p.slot);
    expect(slots[0]).toBe('below');
    expect(slots[1]).toBe('lane2');
    expect(slots[2]).toBe('below');
    const tight = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 30 + i * 20, y: 50, w: 18, h: 18 }));
    const hidden = placeLabels(
      tight.map((box) => ({ box, label })),
      tight,
      'auto',
    ).filter((p) => p.slot === 'hidden');
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('only uses the right side when asked', () => {
    const box = { x: 40, y: 40, w: 18, h: 18 };
    const [p] = placeLabels([{ box, label: { w: 60, h: 12 } }], [box], 'right');
    expect(p.slot).toBe('right');
    expect(p.x).toBe(62);
  });
});
