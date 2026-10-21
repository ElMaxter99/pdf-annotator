import { LooseJsonError, parseLooseJson } from './loose-json';

describe('parseLooseJson', () => {
  it('parses strict JSON', () => {
    expect(parseLooseJson('{"pages":[{"num":1}]}')).toEqual({ pages: [{ num: 1 }] });
  });

  it('accepts single quotes, unquoted keys, comments and trailing commas', () => {
    const input = `{ pages: [ { num: 1, /* c */ fields: [ { x: 1.5, mapField: 'a', }, ], }, ], // end\n}`;
    expect(parseLooseJson(input)).toEqual({ pages: [{ num: 1, fields: [{ x: 1.5, mapField: 'a' }] }] });
  });

  it('accepts raw line breaks inside strings', () => {
    expect(parseLooseJson("{ a: 'x\ny' }")).toEqual({ a: 'x\ny' });
  });

  it('never evaluates code', () => {
    (window as any).__pwned = false;
    expect(() => parseLooseJson('(window.__pwned = true)')).toThrow();
    expect(() => parseLooseJson('{ a: (window.__pwned = true) }')).toThrow();
    expect(() => parseLooseJson('[alert(1)]')).toThrow();
    expect((window as any).__pwned).toBe(false);
  });

  it('ignores __proto__ keys', () => {
    const parsed = parseLooseJson("{ __proto__: { polluted: true }, a: 1 }") as any;
    expect(parsed.polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('rejects excessively nested input', () => {
    expect(() => parseLooseJson('['.repeat(200) + "'a'" + ']'.repeat(200))).toThrow();
  });

  it('reports the line and column of a syntax error', () => {
    const text = '{\n  pages: [\n    { num: 1, fields: [ { x: 1 y: 2 } ] }\n  ]\n}';
    try {
      parseLooseJson(text);
      fail('expected a syntax error');
    } catch (error) {
      expect(error instanceof LooseJsonError).toBeTrue();
      const located = error as LooseJsonError;
      expect(located.line).toBe(3);
      expect(text.split('\n')[2].charAt(located.column - 1)).toBe('y');
    }
  });

  it('reports errors at the end of truncated input', () => {
    try {
      parseLooseJson('{ pages: [');
      fail('expected a syntax error');
    } catch (error) {
      const located = error as LooseJsonError;
      expect(located.line).toBe(1);
      expect(located.column).toBe(11);
    }
  });
});
