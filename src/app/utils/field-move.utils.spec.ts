import type { PageField } from '../models/annotation.model';
import { moveFieldWithinPage } from './field-move.utils';

const field = (x: number, y: number) => ({ x, y, value: 'a', fontSize: 12 }) as PageField;

describe('moveFieldWithinPage', () => {
  it('suma el desplazamiento en puntos PDF', () => {
    const moved = moveFieldWithinPage(field(100, 200), 10, -5, 600, 800);
    expect([moved.x, moved.y]).toEqual([110, 195]);
  });

  it('no sale por los bordes de la página', () => {
    expect(moveFieldWithinPage(field(5, 5), -50, -50, 600, 800)).toEqual(
      jasmine.objectContaining({ x: 0, y: 0 }),
    );
    expect(moveFieldWithinPage(field(595, 795), 50, 50, 600, 800)).toEqual(
      jasmine.objectContaining({ x: 600, y: 800 }),
    );
  });

  it('redondea a dos decimales', () => {
    const moved = moveFieldWithinPage(field(1, 1), 0.333, 0.666, 600, 800);
    expect([moved.x, moved.y]).toEqual([1.33, 1.67]);
  });

  it('conserva el resto de propiedades y no modifica el original', () => {
    const original = field(10, 10);
    const moved = moveFieldWithinPage(original, 1, 1, 600, 800);
    expect(moved.value).toBe('a');
    expect(moved.fontSize).toBe(12);
    expect(original.x).toBe(10);
  });
});
