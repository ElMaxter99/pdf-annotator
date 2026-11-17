import { clampGroupDrag, exceedsDragThreshold, type GroupDragItem } from './group-drag.utils';

const item = (startLeft: number, startTop: number, width = 50, fontPx = 10): GroupDragItem => ({
  startLeft,
  startTop,
  width,
  fontPx,
});

describe('exceedsDragThreshold', () => {
  it('2 px o menos es un clic', () => {
    expect(exceedsDragThreshold(2, -2)).toBeFalse();
    expect(exceedsDragThreshold(0, 0)).toBeFalse();
  });

  it('más de 2 px en cualquier eje es un arrastre', () => {
    expect(exceedsDragThreshold(3, 0)).toBeTrue();
    expect(exceedsDragThreshold(0, -3)).toBeTrue();
  });
});

describe('clampGroupDrag', () => {
  it('deja pasar un movimiento que cabe', () => {
    expect(clampGroupDrag([item(100, 100)], 600, 800, 20, -30)).toEqual({ dx: 20, dy: -30 });
  });

  it('no deja salir por la izquierda ni por arriba', () => {
    expect(clampGroupDrag([item(10, 5)], 600, 800, -50, -50)).toEqual({ dx: -10, dy: -15 });
  });

  it('no deja salir por la derecha ni por abajo', () => {
    expect(clampGroupDrag([item(540, 780)], 600, 800, 50, 50)).toEqual({ dx: 10, dy: 10 });
  });

  it('el miembro más limitado manda sobre todo el grupo', () => {
    const items = [item(10, 100), item(300, 100)];
    expect(clampGroupDrag(items, 600, 800, -100, 0).dx).toBe(-10);
    const right = [item(100, 100), item(540, 100)];
    expect(clampGroupDrag(right, 600, 800, 100, 0).dx).toBe(10);
  });

  it('un miembro ya fuera de la página no bloquea el movimiento hacia dentro', () => {
    expect(clampGroupDrag([item(-5, 100)], 600, 800, 20, 0).dx).toBe(20);
    expect(clampGroupDrag([item(-5, 100)], 600, 800, -20, 0).dx).toBe(0);
  });

  it('sin miembros devuelve el movimiento tal cual', () => {
    expect(clampGroupDrag([], 600, 800, 7, 8)).toEqual({ dx: 7, dy: 8 });
  });
});
