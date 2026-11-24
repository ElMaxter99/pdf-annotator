import {
  buildJsonTreePath,
  buildJsonTreePreview,
  countLineBreaks,
  indentJsonBlock,
  isEditableElement,
  parseNumericList,
  serializeFieldForJson,
} from './json-text.utils';

describe('json-text.utils', () => {
  it('parseNumericList ordena, redondea y quita duplicados y negativos', () => {
    expect(parseNumericList('10, 5;5 -3 abc 2.345')).toEqual([2.35, 5, 10]);
    expect(parseNumericList('')).toEqual([]);
  });

  it('buildJsonTreePath y countLineBreaks', () => {
    expect(buildJsonTreePath(1, 2)).toBe('root/pages/1/fields/2');
    expect(countLineBreaks('')).toBe(0);
    expect(countLineBreaks('a\nb\n\nc')).toBe(3);
  });

  it('buildJsonTreePreview distingue vacío, listo y error', () => {
    expect(buildJsonTreePreview('  ').status).toBe('empty');
    const ok = buildJsonTreePreview('{"pages":[{"num":1,"fields":[{},{}]}]}');
    expect(ok.status).toBe('ready');
    expect(ok.hasPages).toBeTrue();
    expect(ok.fieldCount).toBe(2);
    expect(buildJsonTreePreview('{"pages":').status).toBe('error');
  });

  it('indentJsonBlock sangra cada línea', () => {
    expect(indentJsonBlock({ a: 1 }, '  ')).toBe('  {\n    "a": 1\n  }');
  });

  it('serializeFieldForJson recorta los campos avanzados salvo que se pidan', () => {
    const field = {
      x: 1,
      y: 2,
      mapField: 'a',
      fontSize: 12,
      type: 'text',
      color: '#000',
    } as never;
    expect(Object.keys(serializeFieldForJson(field, false))).toEqual([
      'x',
      'y',
      'mapField',
      'fontSize',
      'type',
    ]);
    expect(serializeFieldForJson(field, true)).toEqual({ ...(field as object) });
  });

  it('serializeFieldForJson nunca escribe la marca interna de la propuesta de la IA', () => {
    const field = { x: 1, y: 2, mapField: 'a', fontSize: 12, type: 'text', aiId: '1:p1-f1' } as never;
    expect(serializeFieldForJson(field, false)).not.toEqual(jasmine.objectContaining({ aiId: jasmine.anything() }));
    expect('aiId' in serializeFieldForJson(field, true)).toBeFalse();
  });

  it('isEditableElement reconoce campos de texto y no botones', () => {
    const text = document.createElement('input');
    const check = document.createElement('input');
    check.type = 'checkbox';
    expect(isEditableElement(text)).toBeTrue();
    expect(isEditableElement(check)).toBeFalse();
    expect(isEditableElement(document.createElement('textarea'))).toBeTrue();
    expect(isEditableElement(null)).toBeFalse();
  });

  it('indents blocks with unquoted keys when asked', () => {
    const block = indentJsonBlock({ x: 1, mapField: 'a' }, '  ', 'bare');
    expect(block).toBe('  {\n    x: 1,\n    mapField: "a"\n  }');
  });
});
