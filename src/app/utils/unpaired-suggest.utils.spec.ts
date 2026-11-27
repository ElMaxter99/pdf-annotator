import { nameScore, suggestPairs } from './unpaired-suggest.utils';

const opt = (id: string, label: string) => ({ id, label });

describe('unpaired-suggest.utils', () => {
  it('scores names by how alike they are', () => {
    expect(nameScore('contrato-01-nuevo.pdf', 'contrato-01.pdf')).toBe(4);
    expect(nameScore('Contrato_01.pdf', 'contrato 01.pdf')).toBe(4);
    expect(nameScore('ContratoGarcía01.pdf', 'contrato garcia 01.pdf')).toBe(3);
    expect(nameScore('asesoramiento-07 final.pdf', 'asesoramiento-07.pdf')).toBe(2);
    expect(nameScore('ase-0412.pdf', 'asesoramiento-412.pdf')).toBe(1);
    expect(nameScore('scan_0031.pdf', 'asesoramiento-12.pdf')).toBe(0);
    // el número distingue: mismo texto, distinto número, no se parecen
    expect(nameScore('asesoramiento-07 final.pdf', 'asesoramiento-12.pdf')).toBe(0);
  });

  it('suggests only clear pairs and never the same PDF twice', () => {
    const options = [
      opt('a', 'asesoramiento-07.pdf'),
      opt('b', 'asesoramiento-12.pdf'),
      opt('c', 'contrato-01.pdf'),
    ];
    const files = [
      { name: 'asesoramiento-07 final.pdf' },
      { name: 'scan_0031.pdf' },
      { name: 'contrato-01-nuevo.pdf' },
      { name: 'contrato-01 copia.pdf' },
    ];
    const out = suggestPairs(files, options);
    expect(out.get(0)).toBe('a');
    expect(out.has(1)).toBeFalse();
    // dos archivos quieren «contrato-01»: gana el más claro (4 frente a 2)
    expect(out.get(2)).toBe('c');
    expect(out.has(3)).toBeFalse();
  });

  it('leaves out ties: two PDFs equally alike', () => {
    const out = suggestPairs(
      [{ name: 'informe.pdf' }],
      [opt('a', 'informe-x.pdf'), opt('b', 'informe-y.pdf')],
    );
    expect(out.size).toBe(0);
  });

  it('leaves out two files that want the same PDF equally', () => {
    const out = suggestPairs(
      [{ name: 'acta final.pdf' }, { name: 'acta copia.pdf' }],
      [opt('a', 'acta.pdf')],
    );
    expect(out.size).toBe(0);
  });
});
