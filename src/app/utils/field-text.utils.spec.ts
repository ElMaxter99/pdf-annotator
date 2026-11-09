import { fieldRenderText } from './field-text.utils';

const base = { x: 0, y: 0, mapField: 'a.b', fontSize: 12, color: '#000000', type: 'text' as const };

describe('fieldRenderText', () => {
  it('prefers a fixed value', () => {
    expect(fieldRenderText({ ...base, value: 'Hola' })).toBe('Hola');
  });
  it('draws an X for checks and radios', () => {
    expect(fieldRenderText({ ...base, type: 'check' })).toBe('X');
    expect(fieldRenderText({ ...base, type: 'radio' })).toBe('X');
  });
  it('formats numbers with decimals and appender', () => {
    expect(fieldRenderText({ ...base, type: 'number', mapField: '12.3456', decimals: 2, appender: ' €' })).toBe('12.34 €');
  });
  it('falls back to the map field', () => {
    expect(fieldRenderText(base)).toBe('a.b');
  });
});
