import { templateFileBase, templateFileNames, templateZipEntry } from './template-export.utils';

describe('template-export.utils', () => {
  it('cleans unsafe characters and empty names', () => {
    expect(templateFileBase('a/b:c*?')).toBe('a-b-c--');
    expect(templateFileBase('  ..  ')).toBe('plantilla');
  });

  it('makes repeated names unique, ignoring case', () => {
    expect(templateFileNames([{ name: 'Factura' }, { name: 'factura' }, { name: 'Factura' }])).toEqual([
      'Factura.json',
      'factura-2.json',
      'Factura-3.json',
    ]);
  });

  it('serialises only the pages', () => {
    const entry = templateZipEntry({ pages: [{ num: 1, fields: [] }] } as never, 'x.json');
    expect(JSON.parse(new TextDecoder().decode(entry.data))).toEqual({ pages: [{ num: 1, fields: [] }] });
  });
});
