import type { PageAnnotations } from '../models/annotation.model';
import { cascadeAdjust, type CascadePdf } from './adjust-cascade.utils';

const pdf = (texts: Array<Array<[string, number, number]>>, size = { w: 595, h: 842 }): CascadePdf => ({
  texts: texts.map((page) => page.map(([text, x, y]) => ({ text, x, y }))),
  sizes: texts.map(() => size),
});
const field = (x: number, y: number) => ({ mapField: 'campo', x, y }) as never;
const template: PageAnnotations[] = [{ num: 1, fields: [field(100, 700), field(100, 600)] }];
const labels: Array<[string, number, number]> = [
  ['Nombre completo', 100, 710],
  ['Domicilio fiscal', 100, 650],
  ['Teléfono móvil', 100, 610],
];
const moved = (dy: number) => labels.map(([t, x, y]) => [t, x, y + dy] as [string, number, number]);

describe('cascadeAdjust', () => {
  it('solves a pair when everything moved by the same amount', () => {
    const result = cascadeAdjust(template, pdf([labels]), pdf([moved(-20)]));
    expect(result.solved).toBeTrue();
    expect(result.rows.map((r) => [r.id, r.ok, r.x, r.y])).toEqual([
      ['p1-f1', true, 100, 680],
      ['p1-f2', true, 100, 580],
    ]);
  });

  it('leaves the pair to the AI when the page count or size differ', () => {
    expect(cascadeAdjust(template, pdf([labels]), pdf([moved(0), moved(0)])).why).toBe('pages');
  });

  it('solves a pair whose page changed size when the texts follow one scale and offset', () => {
    const scaled = labels.map(([t, x, y]) => [t, x * 1.2 + 10, y * 0.9 - 5] as [string, number, number]);
    const wide: Array<[string, number, number]> = [...scaled, ['Código postal', 400 * 1.2 + 10, 500 * 0.9 - 5]];
    const base: Array<[string, number, number]> = [...labels, ['Código postal', 400, 500]];
    const result = cascadeAdjust(template, pdf([base]), pdf([wide], { w: 714, h: 758 }));
    expect(result.solved).toBeTrue();
    expect(result.rows.map((r) => [r.x, r.y])).toEqual([
      [130, 625],
      [130, 535],
    ]);
  });

  it('hands a resized pair to the AI when the texts do not agree on one scale', () => {
    const mess: Array<[string, number, number]> = [
      ['Nombre completo', 20, 100],
      ['Domicilio fiscal', 300, 500],
      ['Teléfono móvil', 150, 50],
    ];
    const result = cascadeAdjust(template, pdf([labels]), pdf([mess], { w: 612, h: 792 }));
    expect(result.solved).toBeFalse();
    expect(result.why).toBe('sizes');
  });

  it('hands the pair to the AI when the layout did not just move as a whole', () => {
    const rearranged = labels.map(([t, x, y], i) => [t, x, y - 20 - i * 15] as [string, number, number]);
    const result = cascadeAdjust(template, pdf([labels]), pdf([rearranged]));
    expect(result.solved).toBeFalse();
    expect(result.why).toBe('notUniform');
  });

  it('does not solve without shared texts', () => {
    const result = cascadeAdjust(template, pdf([labels]), pdf([[['Otro texto distinto', 10, 10]]]));
    expect(result.solved).toBeFalse();
    expect(result.rows.every((r) => !r.ok)).toBeTrue();
  });
});
