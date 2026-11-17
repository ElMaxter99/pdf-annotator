import { pdfPointToPixel, pixelToPdfPoint } from './pdf-coords.utils';

describe('pixelToPdfPoint', () => {
  it('la esquina de arriba a la izquierda es (0, alto)', () => {
    expect(pixelToPdfPoint(0, 0, 800, 1)).toEqual({ x: 0, y: 800 });
  });

  it('la esquina de abajo a la izquierda es el origen', () => {
    expect(pixelToPdfPoint(0, 800, 800, 1)).toEqual({ x: 0, y: 0 });
  });

  it('divide entre la escala', () => {
    expect(pixelToPdfPoint(300, 400, 1600, 2)).toEqual({ x: 150, y: 600 });
  });

  it('redondea a dos decimales', () => {
    expect(pixelToPdfPoint(100, 100, 700, 3)).toEqual({ x: 33.33, y: 200 });
  });

  it('con zoom pequeño sigue en puntos PDF', () => {
    expect(pixelToPdfPoint(50, 100, 400, 0.5)).toEqual({ x: 100, y: 600 });
  });
});

describe('pdfPointToPixel', () => {
  it('invierte el eje Y', () => {
    expect(pdfPointToPixel(10, 0, 800, 1)).toEqual({ left: 10, top: 800 });
    expect(pdfPointToPixel(10, 800, 800, 1)).toEqual({ left: 10, top: 0 });
  });

  it('multiplica por la escala', () => {
    expect(pdfPointToPixel(150, 600, 1600, 2)).toEqual({ left: 300, top: 400 });
  });

  it('ida y vuelta con pixelToPdfPoint', () => {
    for (const scale of [0.5, 1, 1.5, 2.25]) {
      const px = pdfPointToPixel(123.45, 67.89, 842 * scale, scale);
      const back = pixelToPdfPoint(px.left, px.top, 842 * scale, scale);
      expect(back.x).toBeCloseTo(123.45, 2);
      expect(back.y).toBeCloseTo(67.89, 2);
    }
  });
});
