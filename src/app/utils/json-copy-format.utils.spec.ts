import {
  JSON_COPY_JS,
  JSON_COPY_STRICT,
  formatJsonForCopy,
  isStrictJsonFormat,
  jsonCopyPreset,
  normalizeJsonCopyFormat,
} from './json-copy-format.utils';
import { parseLooseJson } from './loose-json';

const SAMPLE = JSON.stringify({
  pages: [{ num: 1, fields: [{ x: 72, y: 710, mapField: 'O\'Brien "SL"', type: 'text' }] }],
});

describe('json-copy-format.utils', () => {
  it('el formato JSON reproduce JSON.stringify con 2 espacios', () => {
    expect(formatJsonForCopy(SAMPLE, JSON_COPY_STRICT)).toBe(
      JSON.stringify(JSON.parse(SAMPLE), null, 2),
    );
  });

  it('objeto JS: claves sin comillas, textos con comillas simples y coma final', () => {
    const out = formatJsonForCopy(SAMPLE, JSON_COPY_JS)!;
    expect(out).toContain("mapField: 'O\\'Brien \"SL\"',");
    expect(out).toContain('pages: [');
    expect(out).not.toContain('"pages"');
    expect(out.trimEnd().endsWith('}')).toBeTrue();
  });

  it('lo copiado se vuelve a leer igual', () => {
    for (const indent of ['2', '4', 'tab', '0'] as const) {
      const out = formatJsonForCopy(SAMPLE, { ...JSON_COPY_JS, indent })!;
      expect(parseLooseJson(out)).toEqual(JSON.parse(SAMPLE));
    }
  });

  it('claves que no son identificadores siguen entre comillas', () => {
    const out = formatJsonForCopy('{"a-b": 1, "1x": 2, "ok": 3}', {
      ...JSON_COPY_STRICT,
      keys: 'bare',
    })!;
    expect(out).toContain('"a-b": 1');
    expect(out).toContain('"1x": 2');
    expect(out).toContain('ok: 3');
  });

  it('compacta no lleva saltos ni coma final', () => {
    expect(formatJsonForCopy('{"a":[1,2]}', { ...JSON_COPY_JS, indent: '0' })).toBe('{a:[1,2]}');
  });

  it('tabulador y 4 espacios', () => {
    expect(formatJsonForCopy('{"a":1}', { ...JSON_COPY_STRICT, indent: 'tab' })).toBe(
      '{\n\t"a": 1\n}',
    );
    expect(formatJsonForCopy('{"a":1}', { ...JSON_COPY_STRICT, indent: '4' })).toBe(
      '{\n    "a": 1\n}',
    );
  });

  it('__proto__ se escribe como clave calculada fuera de JSON estricto', () => {
    const text = '{"__proto__": {"a": 1}}';
    expect(formatJsonForCopy(text, JSON_COPY_JS)).toContain("['__proto__']: {");
    expect(formatJsonForCopy(text, JSON_COPY_STRICT)).toContain('"__proto__": {');
  });

  it('un texto ilegible devuelve null', () => {
    expect(formatJsonForCopy('{"a":', JSON_COPY_JS)).toBeNull();
  });

  it('atajos y validez', () => {
    expect(jsonCopyPreset(JSON_COPY_STRICT)).toBe('json');
    expect(jsonCopyPreset(JSON_COPY_JS)).toBe('js');
    expect(jsonCopyPreset({ ...JSON_COPY_JS, indent: '4' })).toBe('custom');
    expect(isStrictJsonFormat(JSON_COPY_STRICT)).toBeTrue();
    expect(isStrictJsonFormat(JSON_COPY_JS)).toBeFalse();
    expect(isStrictJsonFormat({ ...JSON_COPY_STRICT, trailingComma: true })).toBeFalse();
  });

  it('normaliza datos no confiables', () => {
    expect(normalizeJsonCopyFormat(null)).toEqual(JSON_COPY_STRICT);
    expect(
      normalizeJsonCopyFormat({ keys: 'x', quote: 7, indent: '9', trailingComma: 'sí' }),
    ).toEqual(JSON_COPY_STRICT);
    expect(normalizeJsonCopyFormat({ keys: 'bare', indent: 'tab', trailingComma: true })).toEqual({
      keys: 'bare',
      quote: 'double',
      indent: 'tab',
      trailingComma: true,
    });
  });
});
