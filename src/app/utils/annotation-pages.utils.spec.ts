import { PageAnnotations, PageField } from '../models/annotation.model';
import {
  addFieldToPages,
  areAnnotationPagesEqual,
  cloneAnnotationPages,
  removeFieldFromPages,
  updateFieldInPages,
} from './annotation-pages.utils';

const field = (mapField: string, overrides: Partial<PageField> = {}): PageField => ({
  x: 1,
  y: 2,
  mapField,
  fontSize: 12,
  color: '#000000',
  type: 'text',
  ...overrides,
});

describe('annotation pages utils', () => {
  it('clones pages and fields without sharing references', () => {
    const pages: PageAnnotations[] = [{ num: 1, fields: [field('a')] }];
    const copy = cloneAnnotationPages(pages);
    copy[0].fields[0].mapField = 'changed';
    expect(pages[0].fields[0].mapField).toBe('a');
  });

  it('adds fields to existing pages and creates sorted new ones', () => {
    let pages: PageAnnotations[] = [{ num: 2, fields: [field('a')] }];
    pages = addFieldToPages(2, field('b'), pages);
    expect(pages[0].fields.map((f) => f.mapField)).toEqual(['a', 'b']);

    pages = addFieldToPages(1, field('c'), pages);
    expect(pages.map((p) => p.num)).toEqual([1, 2]);
  });

  it('updates a single field and ignores out-of-range indexes', () => {
    const pages: PageAnnotations[] = [{ num: 1, fields: [field('a'), field('b')] }];
    const updated = updateFieldInPages(0, 1, field('B'), pages);
    expect(updated[0].fields.map((f) => f.mapField)).toEqual(['a', 'B']);
    expect(updateFieldInPages(0, 9, field('x'), pages)).toEqual(pages);
    expect(pages[0].fields[1].mapField).toBe('b');
  });

  it('removes fields and drops pages left empty', () => {
    const pages: PageAnnotations[] = [
      { num: 1, fields: [field('a')] },
      { num: 2, fields: [field('b'), field('c')] },
    ];
    expect(removeFieldFromPages(0, 0, pages).map((p) => p.num)).toEqual([2]);
    expect(removeFieldFromPages(1, 0, pages)[1].fields.map((f) => f.mapField)).toEqual(['c']);
    expect(removeFieldFromPages(1, 7, pages)).toEqual(pages);
  });

  it('compares pages with the provided field comparator', () => {
    const a: PageAnnotations[] = [{ num: 1, fields: [field('a')] }];
    const sameText = (x: PageField, y: PageField) => x.mapField === y.mapField;
    expect(areAnnotationPagesEqual(a, cloneAnnotationPages(a), sameText)).toBeTrue();
    expect(areAnnotationPagesEqual(a, [{ num: 1, fields: [field('z')] }], sameText)).toBeFalse();
    expect(areAnnotationPagesEqual(a, [{ num: 2, fields: [field('a')] }], sameText)).toBeFalse();
    expect(areAnnotationPagesEqual(a, [], sameText)).toBeFalse();
  });
});
