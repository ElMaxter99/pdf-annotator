import { baseName, naturalCompare, suggestOptions } from './search-select.utils';

describe('search-select utils', () => {
  it('orders names naturally', () => {
    expect(['dni10.pdf', 'dni2.pdf', 'Dni1.pdf'].sort(naturalCompare)).toEqual([
      'Dni1.pdf',
      'dni2.pdf',
      'dni10.pdf',
    ]);
  });

  it('strips the extension and the copy marker', () => {
    expect(baseName('DNI-1.pdf')).toBe('dni');
    expect(baseName('dni (2).pdf')).toBe('dni');
    expect(baseName('dni_v3.PDF')).toBe('dni');
    expect(baseName('contrato-final.pdf')).toBe('contrato-final');
  });

  it('suggests the options that look like the file', () => {
    const options = ['alta.pdf', 'dni.pdf', 'dni-anverso.pdf', 'pasaporte.pdf'].map((label) => ({
      id: label,
      label,
    }));
    expect(suggestOptions('dni-1.pdf', options).map((o) => o.id)).toEqual([
      'dni.pdf',
      'dni-anverso.pdf',
    ]);
    expect(suggestOptions('x.pdf', options)).toEqual([]);
  });
});
