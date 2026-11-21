import type { PageAnnotations, PageField } from '../models/annotation.model';
import type { AiRow } from './ai-proposal.utils';
import { extendPagePattern, findPagePatterns, patternName } from './page-pattern.utils';

const field = (mapField: string, x = 540, y = 30, extra: Partial<PageField> = {}): PageField =>
  ({ x, y, mapField, fontSize: 9, color: '#000000', type: 'text', ...extra }) as PageField;
const row = (id: string, page: number, ok = false): AiRow => ({
  id, page, index: 0, ok, newPage: ok ? page : 0, x: ok ? 1 : 0, y: ok ? 1 : 0, confidence: ok ? 0.9 : 0,
  reason: '', anchorA: '', anchorB: '', why: ok ? '' : 'sin_respuesta', source: 'ai',
});
/** 11 páginas con «numpages0…numpages10» abajo a la derecha y un campo normal en la 1. */
const template: PageAnnotations[] = Array.from({ length: 11 }, (_, i) => ({
  num: i + 1,
  fields: i === 0 ? [field('cliente.nombre', 100, 700), field('numpages0', 540, 30)] : [field(`numpages${i}`, 540.5, 30.4)],
}));

describe('page-pattern.utils', () => {
  it('encuentra el número de página repetido y no confunde los campos normales', () => {
    const [p, ...rest] = findPagePatterns(template);
    expect(rest.length).toBe(0);
    expect(p.kind).toBe('indexed');
    expect(p.members.length).toBe(11);
    expect(p.offset).toBe(-1);
    expect(patternName(p, 19)).toBe('numpages18');
  });

  it('respeta el relleno de ceros y el nombre igual en todas las páginas', () => {
    const padded = [1, 2, 3].map((n) => ({ num: n, fields: [field(`pag_0${n}_txt`)] }));
    expect(patternName(findPagePatterns(padded)[0], 12)).toBe('pag_12_txt');
    expect(patternName(findPagePatterns(padded)[0], 4)).toBe('pag_04_txt');
    const same = [1, 2, 3].map((n) => ({ num: n, fields: [field('{{pagina}}')] }));
    expect(findPagePatterns(same)[0].kind).toBe('same');
  });

  it('no es patrón con menos de 3 páginas, con dos en el mismo sitio de una página o con números que no siguen a la página', () => {
    expect(findPagePatterns([1, 2].map((n) => ({ num: n, fields: [field(`p${n}`)] })))).toEqual([]);
    expect(findPagePatterns([1, 2, 3].map((n) => ({ num: n, fields: [field(`p${n}`), field(`q${n}`)] })))).toEqual([]);
    expect(findPagePatterns([1, 2, 3].map((n) => ({ num: n, fields: [field(`p${n * 7}`)] })))).toEqual([]);
  });

  it('completa la propuesta: recoloca los de A y añade uno por página nueva de B (11 → 19)', () => {
    const rows = [row('p1-f1', 1, true), row('p1-f2', 1), ...Array.from({ length: 10 }, (_, i) => row(`p${i + 2}-f1`, i + 2))];
    const r = extendPagePattern(rows, template, 19);
    expect(r.placed).toBe(19);
    expect(r.rows.find((x) => x.id === 'p1-f1')?.source).toBe('ai'); // el campo normal no se toca
    const p5 = r.rows.find((x) => x.id === 'p5-f1')!;
    expect([p5.ok, p5.newPage, p5.source]).toEqual([true, 5, 'pattern']);
    const added = r.rows.filter((x) => x.id.startsWith('pattern-'));
    expect(added.map((x) => x.newPage)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.extra.get('pattern-1-p19')?.mapField).toBe('numpages18');
    expect(r.extra.get('pattern-1-p12')?.x).toBe(540.5);
  });

  it('con B más corta solo recoloca lo que cabe y sin páginas de B no hace nada', () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`p${i + 1}-f${i === 0 ? 2 : 1}`, i + 1));
    const r = extendPagePattern(rows, template, 4);
    expect(r.placed).toBe(4);
    expect(r.extra.size).toBe(0);
    expect(r.rows.find((x) => x.id === 'p6-f1')?.ok).toBe(false);
    expect(extendPagePattern(rows, template, 0).placed).toBe(0);
  });
});
