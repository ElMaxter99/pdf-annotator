import type { PageField } from '../models/annotation.model';
import {
  DEFAULT_SAMPLE_VALUES,
  normalizeSampleValues,
  parseMapPath,
  resolveFieldPreview,
  resolveMapPath,
  type PreviewContext,
} from './preview-values.utils';

const field = (overrides: Partial<PageField> = {}): PageField => ({
  x: 1,
  y: 1,
  mapField: 'holder[0].fullname',
  fontSize: 14,
  color: '#000000',
  type: 'text',
  ...overrides,
});

const DATA = {
  holder: [{ fullname: 'Lucía Fernández', age: 41 }],
  generalData: { month: 'noviembre', total: 1284.5 },
};

const ctx = (mode: PreviewContext['mode'], data: unknown = DATA): PreviewContext => ({
  mode,
  samples: DEFAULT_SAMPLE_VALUES,
  data,
});

describe('resolveMapPath', () => {
  it('resolves nested paths and array indexes', () => {
    expect(resolveMapPath(DATA, 'holder[0].fullname')).toBe('Lucía Fernández');
    expect(resolveMapPath(DATA, 'generalData.month')).toBe('noviembre');
    expect(resolveMapPath(DATA, 'holder[0].age')).toBe('41');
  });

  it('returns undefined for missing data, bad paths and prototype keys', () => {
    expect(resolveMapPath(DATA, 'holder[3].fullname')).toBeUndefined();
    expect(resolveMapPath(DATA, 'generalData.nope')).toBeUndefined();
    expect(resolveMapPath(DATA, 'generalData')).toBeUndefined();
    expect(resolveMapPath(DATA, '')).toBeUndefined();
    expect(resolveMapPath(DATA, 'a..b')).toBeUndefined();
    expect(resolveMapPath(DATA, '__proto__.polluted')).toBeUndefined();
    expect(resolveMapPath(DATA, 'generalData.constructor')).toBeUndefined();
  });

  it('parses paths', () => {
    expect(parseMapPath('a.b[2].c')).toEqual(['a', 'b', 2, 'c']);
    expect(parseMapPath('a[x]')).toBeNull();
  });
});

describe('normalizeSampleValues', () => {
  it('falls back to the defaults and trims what is stored', () => {
    expect(normalizeSampleValues(null)).toEqual(DEFAULT_SAMPLE_VALUES);
    expect(normalizeSampleValues({ text: '  ', check: 5 })).toEqual(DEFAULT_SAMPLE_VALUES);
    expect(normalizeSampleValues({ text: 'ABCDEFGHIJKLMNOP' }).text).toBe('ABCDEFGHIJKL');
  });
});

describe('resolveFieldPreview', () => {
  it('paints the value before anything else, in every mode', () => {
    const f = field({ value: 'Pendiente' });
    for (const mode of ['sample', 'map', 'data'] as const) {
      expect(resolveFieldPreview(f, ctx(mode))).toEqual({ text: 'Pendiente', source: 'value' });
    }
  });

  it('paints sample values per type by default', () => {
    expect(resolveFieldPreview(field(), ctx('sample', null)).text).toBe('XXXXX');
    expect(resolveFieldPreview(field({ type: 'check' }), ctx('sample', null)).text).toBe('X');
    expect(resolveFieldPreview(field({ type: 'radio' }), ctx('sample', null)).text).toBe('X');
    expect(resolveFieldPreview(field({ type: 'number' }), ctx('sample', null)).text).toBe('00000');
  });

  it('applies decimals and appender to the number sample', () => {
    const f = field({ type: 'number', decimals: 2, appender: ' €' });
    expect(resolveFieldPreview(f, ctx('sample', null)).text).toBe('0.00 €');
  });

  it('paints the mapField in map mode', () => {
    expect(resolveFieldPreview(field(), ctx('map')).text).toBe('holder[0].fullname');
    expect(resolveFieldPreview(field({ type: 'check' }), ctx('map')).text).toBe('X');
  });

  it('resolves test data and falls back to the sample when it is missing', () => {
    expect(resolveFieldPreview(field(), ctx('data'))).toEqual({
      text: 'Lucía Fernández',
      source: 'data',
    });
    expect(resolveFieldPreview(field({ mapField: 'holder[0].email' }), ctx('data'))).toEqual({
      text: 'XXXXX',
      source: 'sample',
    });
  });

  it('formats resolved numbers with decimals and appender', () => {
    const f = field({ type: 'number', mapField: 'generalData.total', decimals: 2, appender: ' €' });
    expect(resolveFieldPreview(f, ctx('data')).text).toBe('1284.50 €');
  });

  it('keeps check and radio as the sample even with data', () => {
    expect(resolveFieldPreview(field({ type: 'check' }), ctx('data')).text).toBe('X');
  });
});
