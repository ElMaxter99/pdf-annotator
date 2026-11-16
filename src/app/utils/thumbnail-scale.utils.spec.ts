import { thumbnailScale } from './thumbnail-scale.utils';

describe('thumbnailScale', () => {
  it('apunta a ~120 px de ancho', () => {
    expect(thumbnailScale(600)).toBeCloseTo(0.2);
  });

  it('no amplía páginas pequeñas', () => {
    expect(thumbnailScale(50)).toBe(1);
  });

  it('limita el mínimo en páginas enormes', () => {
    expect(thumbnailScale(5000)).toBe(0.15);
  });

  it('usa un valor por defecto con anchos inválidos', () => {
    expect(thumbnailScale(0)).toBe(0.25);
    expect(thumbnailScale(NaN)).toBe(0.25);
    expect(thumbnailScale(-3)).toBe(0.25);
  });
});
