import {
  extractPagesCollection,
  normalizeFieldDecimals,
  normalizeFieldText,
  normalizeFieldType,
  sanitizeOptionalAppender,
  sanitizeTextPreservingSpacing,
} from './annotation-fields.utils';

describe('annotation field utils', () => {
  it('normalizes field types, defaulting to text', () => {
    expect(normalizeFieldType('CHECK')).toBe('check');
    expect(normalizeFieldType('radio')).toBe('radio');
    expect(normalizeFieldType('Number')).toBe('number');
    expect(normalizeFieldType('weird')).toBe('text');
    expect(normalizeFieldType(undefined)).toBe('text');
  });

  it('collapses text and tidies path-like separators', () => {
    expect(normalizeFieldText('  Hola \n  mundo ')).toBe('Hola mundo');
    expect(normalizeFieldText('a . b [ 0 ]')).toBe('a.b[0]');
    expect(normalizeFieldText(42)).toBe('42');
    expect(normalizeFieldText(true)).toBe('true');
    expect(normalizeFieldText(['', '  ', 'x'])).toBe('x');
    expect(normalizeFieldText('   ')).toBeNull();
    expect(normalizeFieldText({})).toBeNull();
  });

  it('normalizes decimals to non-negative integers', () => {
    expect(normalizeFieldDecimals('2')).toBe(2);
    expect(normalizeFieldDecimals(2.6)).toBe(3);
    expect(normalizeFieldDecimals(-1)).toBeUndefined();
    expect(normalizeFieldDecimals('')).toBeUndefined();
    expect(normalizeFieldDecimals(null)).toBeUndefined();
    expect(normalizeFieldDecimals('abc')).toBeUndefined();
  });

  it('keeps meaningful spacing in appenders and values', () => {
    expect(sanitizeOptionalAppender(' €')).toBe(' €');
    expect(sanitizeOptionalAppender('   ')).toBeUndefined();
    expect(sanitizeOptionalAppender(5)).toBeUndefined();
    expect(sanitizeTextPreservingSpacing('  hi ')).toBe('  hi ');
    expect(sanitizeTextPreservingSpacing('')).toBeUndefined();
  });

  it('finds the pages collection in bare arrays or { pages }', () => {
    const pages = [{ num: 1 }];
    expect(extractPagesCollection(pages)).toBe(pages);
    expect(extractPagesCollection({ pages })).toBe(pages);
    expect(extractPagesCollection({ foo: 1 })).toBeNull();
    expect(extractPagesCollection('x')).toBeNull();
  });
});
