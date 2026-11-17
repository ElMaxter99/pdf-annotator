import type { PageField } from '../models/annotation.model';
import { offsetFieldCopy } from './paste-offset.utils';

const field = (x: number, y: number) => ({ x, y, value: 'a', fontSize: 12 }) as PageField;

describe('offsetFieldCopy', () => {
  it('desplaza 8 px de pantalla en puntos PDF', () => {
    const copy = offsetFieldCopy(field(100, 100), 2, 1200, 1600, 1);
    expect(copy.x).toBe(104);
    expect(copy.y).toBe(104);
  });

  it('puede desplazar hacia abajo', () => {
    expect(offsetFieldCopy(field(100, 100), 1, 600, 800, -1).y).toBe(92);
  });

  it('mantiene la copia dentro del lienzo', () => {
    const copy = offsetFieldCopy(field(599, 1), 1, 600, 800, -1);
    expect(copy.x).toBe(600);
    expect(copy.y).toBe(0);
  });

  it('no modifica el original', () => {
    const original = field(10, 10);
    offsetFieldCopy(original, 1, 600, 800, 1);
    expect(original.x).toBe(10);
  });
});
