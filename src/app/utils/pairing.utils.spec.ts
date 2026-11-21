import { closestByName, closestElementIndex, lineBetween, pairName, PairCandidate } from './pairing.utils';

describe('pairing.utils', () => {
  it('pairName usa mapField o el valor, sin espacios', () => {
    expect(pairName({ mapField: ' {{nif}} ' })).toBe('{{nif}}');
    expect(pairName({ value: 'Fijo' })).toBe('Fijo');
    expect(pairName(null)).toBe('');
  });

  it('closestByName prefiere la misma página y, dentro, el más cercano', () => {
    const c: PairCandidate<string>[] = [
      { name: 'firma', page: 1, x: 100, y: 100, ref: 'p1-lejos' },
      { name: 'firma', page: 2, x: 10, y: 10, ref: 'p2' },
      { name: 'firma', page: 1, x: 300, y: 300, ref: 'p1-cerca' },
      { name: 'otro', page: 1, x: 300, y: 300, ref: 'no' },
    ];
    expect(closestByName('firma', c, { page: 1, x: 290, y: 290 })?.ref).toBe('p1-cerca');
    expect(closestByName('firma', c, { page: 2, x: 0, y: 0 })?.ref).toBe('p2');
    // en otra página: la de número más próximo
    expect(closestByName('firma', c, { page: 3, x: 0, y: 0 })?.ref).toBe('p2');
    expect(closestByName('nada', c, { page: 1, x: 0, y: 0 })).toBeNull();
    expect(closestByName('', c)).toBeNull();
    expect(closestByName('firma', c)?.ref).toBe('p1-lejos');
  });

  it('lineBetween va del borde de A que mira a B al de B', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(lineBetween(a, { left: 100, top: 40, right: 120, bottom: 60 })).toEqual({ x1: 10, y1: 5, x2: 100, y2: 50 });
    expect(lineBetween({ left: 200, top: 0, right: 210, bottom: 10 }, { left: 100, top: 0, right: 120, bottom: 10 })).toEqual({ x1: 200, y1: 5, x2: 120, y2: 5 });
    expect(lineBetween(a, { left: 0, top: 50, right: 10, bottom: 60 })).toEqual({ x1: 5, y1: 10, x2: 5, y2: 50 });
    expect(lineBetween(a, { left: 2, top: 2, right: 8, bottom: 8 })).toEqual({ x1: 5, y1: 5, x2: 5, y2: 5 });
  });

  it('closestElementIndex elige el elemento más cercano al punto esperado', () => {
    expect(closestElementIndex([{ left: 0, top: 0 }, { left: 50, top: 50 }], { left: 45, top: 40 })).toBe(1);
    expect(closestElementIndex([], { left: 0, top: 0 })).toBe(-1);
  });
});
