import {
  DEFAULT_ANNOTATION_SNAP_DISTANCE,
  normalizeSnapDistance,
  snapToAnnotations,
} from './annotation-snap.utils';

describe('snapToAnnotations', () => {
  const targets = [
    { x: 100, y: 500, name: 'Sí' },
    { x: 220, y: 300, name: 'Fecha' },
  ];

  it('aligns each axis with the closest annotation', () => {
    const r = snapToAnnotations(101.4, 301.9, targets, 3);
    expect(r.x).toEqual({ value: 100, name: 'Sí' });
    expect(r.y).toEqual({ value: 300, name: 'Fecha' });
  });

  it('aligns only the axis that is close enough', () => {
    const r = snapToAnnotations(101, 400, targets, 3);
    expect(r.x?.value).toBe(100);
    expect(r.y).toBeNull();
  });

  it('keeps the exact tolerance as inside and ignores farther ones', () => {
    expect(snapToAnnotations(103, 0, targets, 3).x?.value).toBe(100);
    expect(snapToAnnotations(103.01, 0, targets, 3).x).toBeNull();
  });

  it('picks the nearest when several are in range', () => {
    const r = snapToAnnotations(102, 0, [{ x: 100, y: 0, name: 'a' }, { x: 103, y: 9, name: 'b' }], 5);
    expect(r.x?.name).toBe('b');
  });

  it('skips a non-finite axis of a target but keeps the other', () => {
    const r = snapToAnnotations(101, 301, [{ x: NaN, y: 300, name: 'a' }], 3);
    expect(r.x).toBeNull();
    expect(r.y?.value).toBe(300);
  });

  it('does nothing without targets, tolerance or finite numbers', () => {
    expect(snapToAnnotations(1, 1, [], 3)).toEqual({ x: null, y: null });
    expect(snapToAnnotations(100, 500, targets, 0)).toEqual({ x: null, y: null });
    expect(snapToAnnotations(NaN, 500, targets, 3).x).toBeNull();
  });
});

describe('normalizeSnapDistance', () => {
  it('accepts only the offered distances', () => {
    expect(normalizeSnapDistance(3)).toBe(3);
    expect(normalizeSnapDistance(10)).toBe(10);
    expect(normalizeSnapDistance(7)).toBe(DEFAULT_ANNOTATION_SNAP_DISTANCE);
    expect(normalizeSnapDistance('3')).toBe(DEFAULT_ANNOTATION_SNAP_DISTANCE);
  });
});
