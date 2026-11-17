import {
  clampScale,
  fitPageScale,
  fitPageScaleForOverflow,
  fitWidthScale,
  panScrollPosition,
  stepScale,
  wheelZoomFactor,
  zoomAnchorScrollDelta,
  zoomLimitFor,
} from './zoom.utils';

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

describe('ajuste de zoom', () => {
  it('fitWidthScale redondea hacia abajo al porcentaje y respeta los límites', () => {
    expect(fitWidthScale(600, 900)).toBe(1.5);
    expect(fitWidthScale(600, 1000)).toBe(1.66);
    expect(fitWidthScale(600, 100)).toBe(0.25);
    expect(fitWidthScale(100, 5000)).toBe(4);
  });

  it('fitWidthScale devuelve null con medidas inválidas', () => {
    expect(fitWidthScale(0, 900)).toBeNull();
    expect(fitWidthScale(600, 0)).toBeNull();
    expect(fitWidthScale(NaN, 900)).toBeNull();
  });

  it('fitPageScale usa el eje más ajustado', () => {
    expect(fitPageScale(600, 800, 1200, 800)).toBe(1);
    expect(fitPageScale(600, 800, 600, 1600)).toBe(1);
    expect(fitPageScale(600, 800, 3000, 400)).toBe(0.5);
  });

  it('fitPageScale devuelve null con medidas inválidas', () => {
    expect(fitPageScale(600, 0, 1000, 1000)).toBeNull();
    expect(fitPageScale(600, 800, 1000, -1)).toBeNull();
  });

  it('fitPageScaleForOverflow reduce lo que desborda', () => {
    expect(fitPageScaleForOverflow(800, 1, 80)).toBe(0.9);
    expect(fitPageScaleForOverflow(800, 0.3, 700)).toBe(0.25);
  });
});

describe('mover y anclar el zoom', () => {
  it('panScrollPosition mueve el visor al revés que el puntero', () => {
    const start = { x: 100, y: 100, left: 50, top: 20 };
    expect(panScrollPosition(start, { clientX: 130, clientY: 90 })).toEqual({
      left: 20,
      top: 30,
    });
    expect(panScrollPosition(start, { clientX: 100, clientY: 100 })).toEqual({
      left: 50,
      top: 20,
    });
  });

  it('zoomAnchorScrollDelta no desplaza si el punto ya queda bajo el ancla', () => {
    // Esquina en (0,0) antes y después, ancla en la esquina: sigue en (0,0).
    expect(
      zoomAnchorScrollDelta(
        { left: 0, top: 0 },
        { left: 0, top: 0 },
        { clientX: 0, clientY: 0 },
        1,
        2,
      ),
    ).toEqual({ dx: 0, dy: 0 });
  });

  it('zoomAnchorScrollDelta compensa el crecimiento alrededor del ancla', () => {
    // Lienzo en (100,100); ancla a 200 px de la esquina; al pasar de 1 a 2 ese punto cae a 400 px.
    const delta = zoomAnchorScrollDelta(
      { left: 100, top: 100 },
      { left: 100, top: 100 },
      { clientX: 300, clientY: 300 },
      1,
      2,
    );
    expect(delta).toEqual({ dx: 200, dy: 200 });
  });
});
