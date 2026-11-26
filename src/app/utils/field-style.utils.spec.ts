import { PageField } from '../models/annotation.model';
import {
  areFieldsEqual,
  ensureFieldStyle,
  fieldHasRenderableContent,
  normalizeBackgroundColor,
  normalizeOpacityValue,
  prepareFieldForForm,
  prepareFieldForStorage,
} from './field-style.utils';

const keepFont = (f: string | null | undefined) => f || 'helvetica';

const base = (over: Partial<PageField> = {}): PageField =>
  ({
    x: 1,
    y: 2,
    mapField: 'a',
    fontSize: 12,
    color: '#000000',
    type: 'text',
    ...over,
  }) as PageField;

describe('field-style.utils', () => {
  it('prepareFieldForStorage keeps a clean date format only on dates, with DD/MM/YYYY by default', () => {
    expect(prepareFieldForStorage(base({ type: 'date', dateFormat: ' D.M.YY ' }), keepFont).dateFormat).toBe('D.M.YY');
    expect(prepareFieldForStorage(base({ type: 'date', dateFormat: '' }), keepFont).dateFormat).toBe('DD/MM/YYYY');
    expect(prepareFieldForStorage(base({ type: 'text', dateFormat: 'YYYY' }), keepFont).dateFormat).toBeUndefined();
    expect(prepareFieldForForm(base({ type: 'date' }), keepFont).dateFormat).toBe('');
    expect(
      areFieldsEqual(base({ type: 'date', dateFormat: 'YYYY' }), base({ type: 'date', dateFormat: 'YY' }), keepFont),
    ).toBeFalse();
  });

  it('prepareFieldForStorage conserva la marca interna de la propuesta de la IA', () => {
    const field = { x: 1, y: 2, mapField: 'a', fontSize: 12, type: 'text', color: '#000', aiId: '7:p1-f1' } as PageField;
    expect(prepareFieldForStorage(field, keepFont).aiId).toBe('7:p1-f1');
  });

  it('normalizeOpacityValue limita a 0..1 con dos decimales', () => {
    expect(normalizeOpacityValue(2)).toBe(1);
    expect(normalizeOpacityValue(-1)).toBe(0);
    expect(normalizeOpacityValue(0.456)).toBe(0.46);
    expect(normalizeOpacityValue('x')).toBeUndefined();
  });

  it('normalizeBackgroundColor ignora vacío y transparent', () => {
    expect(normalizeBackgroundColor('transparent')).toBeUndefined();
    expect(normalizeBackgroundColor('  ')).toBeUndefined();
    expect(normalizeBackgroundColor(5)).toBeUndefined();
    expect(normalizeBackgroundColor('#ff0000')).toBeDefined();
  });

  it('fieldHasRenderableContent', () => {
    expect(fieldHasRenderableContent(base({ mapField: ' ' }))).toBeFalse();
    expect(fieldHasRenderableContent(base({ mapField: ' ', value: 'hola' }))).toBeTrue();
    expect(fieldHasRenderableContent(base({ mapField: ' ', type: 'check' }))).toBeTrue();
    expect(fieldHasRenderableContent(base())).toBeTrue();
  });

  it('ensureFieldStyle devuelve el mismo objeto si ya es canónico y limpia lo heredado', () => {
    const styled = ensureFieldStyle(base(), keepFont);
    expect(ensureFieldStyle(styled, keepFont)).toBe(styled);
    const legacy = ensureFieldStyle({ ...styled, fontWeight: 'bold' } as PageField, keepFont);
    expect('fontWeight' in legacy).toBeFalse();
  });

  it('prepareFieldForStorage/Form aplican valores por defecto', () => {
    const stored = prepareFieldForStorage(base(), keepFont);
    expect(stored.opacity).toBe(1);
    expect(stored.locked).toBeFalse();
    expect(stored.backgroundColor).toBeNull();
    const form = prepareFieldForForm(base(), keepFont);
    expect(form.value).toBe('');
    expect(form.decimals).toBeNull();
  });

  it('areFieldsEqual compara tras normalizar', () => {
    expect(areFieldsEqual(base(), base({ opacity: 1, locked: false }), keepFont)).toBeTrue();
    expect(areFieldsEqual(base(), base({ x: 5 }), keepFont)).toBeFalse();
  });
});
