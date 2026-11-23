import {
  placePopover,
  popoverMaxHeight,
  popoverUsesSheet,
  sheetScrollDelta,
  PopoverRect,
} from './popover-placement.utils';

const BOUNDS: PopoverRect = { left: 0, top: 0, right: 1000, bottom: 700 };
const SIZE = { width: 300, height: 380 };

function inside(p: { left: number; top: number }, size = SIZE, b = BOUNDS) {
  expect(p.left).toBeGreaterThanOrEqual(b.left);
  expect(p.top).toBeGreaterThanOrEqual(b.top);
  expect(p.left + size.width).toBeLessThanOrEqual(b.right);
  expect(p.top + size.height).toBeLessThanOrEqual(b.bottom);
}

describe('placePopover', () => {
  it('abre a la derecha del punto y con el pico a la izquierda', () => {
    const p = placePopover({ anchor: { x: 300, y: 200 }, size: SIZE, bounds: BOUNDS });
    expect(p.mode).toBe('float');
    expect(p.arrow).toBe('left');
    expect(p.left).toBe(314);
    expect(p.top).toBe(182);
    inside(p);
  });

  it('un clic abajo del todo sube la caja para que quepa', () => {
    const p = placePopover({ anchor: { x: 300, y: 690 }, size: SIZE, bounds: BOUNDS });
    expect(p.top + SIZE.height).toBeLessThanOrEqual(BOUNDS.bottom - 12);
    expect(p.arrowTop).toBeGreaterThan(300);
    inside(p);
  });

  it('un clic a la derecha del todo abre a la izquierda del punto', () => {
    const p = placePopover({ anchor: { x: 960, y: 300 }, size: SIZE, bounds: BOUNDS });
    expect(p.arrow).toBe('right');
    expect(p.left + SIZE.width).toBeLessThanOrEqual(960 - 14);
    inside(p);
  });

  it('en la esquina inferior derecha sigue dentro del visor', () => {
    const p = placePopover({ anchor: { x: 995, y: 695 }, size: SIZE, bounds: BOUNDS });
    inside(p);
  });

  it('si no cabe ni a un lado ni a otro, se pega al borde sin pico', () => {
    const narrow: PopoverRect = { left: 0, top: 0, right: 740, bottom: 700 };
    const p = placePopover({ anchor: { x: 370, y: 300 }, size: { width: 400, height: 380 }, bounds: narrow });
    expect(p.arrow).toBe('none');
    inside(p, { width: 400, height: 380 }, narrow);
  });

  it('respeta un visor desplazado (límites que no empiezan en 0)', () => {
    const b: PopoverRect = { left: 200, top: 150, right: 1200, bottom: 850 };
    const p = placePopover({ anchor: { x: 260, y: 160 }, size: SIZE, bounds: b });
    inside(p, SIZE, b);
  });

  it('acota el alto máximo al del visor menos los márgenes', () => {
    const low: PopoverRect = { left: 0, top: 0, right: 1000, bottom: 560 };
    expect(popoverMaxHeight(low)).toBe(536);
    const p = placePopover({ anchor: { x: 300, y: 300 }, size: { width: 300, height: 900 }, bounds: low });
    expect(p.maxHeight).toBe(536);
    expect(p.top).toBe(12);
  });

  it('pasa a hoja inferior en un visor estrecho o bajo', () => {
    expect(popoverUsesSheet({ left: 0, top: 0, right: 700, bottom: 800 })).toBeTrue();
    expect(popoverUsesSheet({ left: 0, top: 0, right: 1200, bottom: 500 })).toBeTrue();
    expect(popoverUsesSheet(BOUNDS)).toBeFalse();
    const p = placePopover({ anchor: { x: 100, y: 100 }, size: SIZE, bounds: { left: 10, top: 20, right: 610, bottom: 800 } });
    expect(p.mode).toBe('sheet');
    expect(p.left).toBe(10);
    expect(p.width).toBe(600);
    expect(p.top + SIZE.height).toBe(800);
  });

  it('calcula cuánto desplazar el visor para ver el punto sobre la hoja', () => {
    expect(sheetScrollDelta(300, 500)).toBe(0);
    expect(sheetScrollDelta(560, 500)).toBe(88);
  });
});
