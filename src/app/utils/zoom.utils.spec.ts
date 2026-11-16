import { clampScale, stepScale, wheelZoomFactor, zoomLimitFor } from './zoom.utils';

describe('zoom.utils', () => {
  it('clamps to 25 %–400 % and rounds to percents', () => {
    expect(clampScale(0.1)).toBe(0.25);
    expect(clampScale(9)).toBe(4);
    expect(clampScale(1.234)).toBe(1.23);
    expect(clampScale(NaN)).toBe(1);
  });

  it('reports the limit that was hit', () => {
    expect(zoomLimitFor(4.4)).toBe('max');
    expect(zoomLimitFor(0.2)).toBe('min');
    expect(zoomLimitFor(1.5)).toBeNull();
  });

  it('zooms about 10 % per wheel notch and finer on pinch', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.105, 2);
    expect(wheelZoomFactor(100)).toBeCloseTo(0.905, 2);
    expect(wheelZoomFactor(-5)).toBeCloseTo(1.051, 2);
    expect(wheelZoomFactor(-10000)).toBe(1.25);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(1.105, 1);
  });

  it('steps by 25 % inside the limits', () => {
    expect(stepScale(1, 1)).toBe(1.25);
    expect(stepScale(0.25, -1)).toBe(0.25);
    expect(stepScale(3.9, 1)).toBe(4);
  });
});
