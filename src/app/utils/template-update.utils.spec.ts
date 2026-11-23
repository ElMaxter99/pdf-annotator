import type { PageAnnotations, PageField } from '../models/annotation.model';
import { countFields, diffTemplates } from './template-update.utils';

const field = (mapField: string, x = 10): PageField =>
  ({ x, y: 20, mapField, fontSize: 12, color: '#000000', type: 'text' }) as PageField;
const page = (num: number, ...fields: PageField[]): PageAnnotations => ({ num, fields });

describe('diffTemplates', () => {
  it('reports identical templates as the same', () => {
    const a = [page(1, field('a'), field('b'))];
    const d = diffTemplates(a, [page(1, field('a'), field('b'))]);
    expect(d.same).toBeTrue();
    expect(d.before).toBe(2);
  });

  it('counts added, removed and moved fields', () => {
    const before = [page(1, field('a'), field('b'), field('c'))];
    const after = [page(1, field('a'), field('b', 99), field('d'), field('e'))];
    const d = diffTemplates(before, after);
    expect(d.changed).toBe(2);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(0);
    expect(d.before).toBe(3);
    expect(d.after).toBe(4);
    expect(d.same).toBeFalse();
  });

  it('handles pages that only exist on one side and ignores the AI mark', () => {
    const before = [page(1, { ...field('a'), aiId: 'x' } as PageField)];
    const after = [page(1, field('a')), page(2, field('z'))];
    const d = diffTemplates(before, after);
    expect(d.added).toBe(1);
    expect(d.pages.map((p) => p.num)).toEqual([1, 2]);
    expect(countFields(after)).toBe(2);
  });

  it('counts removals when the new template has fewer fields', () => {
    const d = diffTemplates([page(1, field('a'), field('b'))], [page(1, field('a'))]);
    expect(d.removed).toBe(1);
  });
});
