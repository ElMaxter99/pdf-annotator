import { countMatches, diffRange } from './json-code-editor.component';

describe('diffRange', () => {
  it('reemplaza solo lo que cambia', () => {
    expect(diffRange('{"a":1,"b":2}', '{"a":1,"b":3}')).toEqual({ from: 11, to: 12, insert: '3' });
  });

  it('inserta y borra', () => {
    expect(diffRange('abc', 'abXYc')).toEqual({ from: 2, to: 2, insert: 'XY' });
    expect(diffRange('abXYc', 'abc')).toEqual({ from: 2, to: 4, insert: '' });
  });

  it('sin cambios devuelve un rango vacío', () => {
    expect(diffRange('igual', 'igual')).toEqual({ from: 5, to: 5, insert: '' });
  });
});

describe('countMatches (Ctrl+F «N de M»)', () => {
  const matches = [
    { from: 0, to: 3 },
    { from: 10, to: 13 },
    { from: 20, to: 23 },
  ];

  it('counts the matches and says which one is selected', () => {
    expect(countMatches(matches, { from: 10, to: 13 })).toEqual({
      current: 2,
      total: 3,
      capped: false,
    });
    expect(countMatches(matches, { from: 5, to: 5 })).toEqual({
      current: 0,
      total: 3,
      capped: false,
    });
    expect(countMatches([], { from: 0, to: 0 })).toEqual({ current: 0, total: 0, capped: false });
  });

  it('stops counting at the limit, like VS Code «1000+»', () => {
    expect(countMatches(matches, { from: 0, to: 3 }, 2)).toEqual({
      current: 1,
      total: 2,
      capped: true,
    });
  });
});
