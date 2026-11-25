import { diffRange } from './json-code-editor.component';

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
