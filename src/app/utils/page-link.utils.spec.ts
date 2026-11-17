import {
  clampPageNumber,
  holdPageOfB,
  linkedPageTotal,
  pageOfVersion,
  pageOffsetLabel,
} from './page-link.utils';

describe('page-link.utils', () => {
  it('uses the longer version as the linked range', () => {
    expect(linkedPageTotal(2, 1)).toBe(2);
    expect(linkedPageTotal(3, 5)).toBe(5);
    expect(linkedPageTotal(0, 0)).toBe(1);
  });

  it('clamps and rounds page numbers', () => {
    expect(clampPageNumber(0, 3)).toBe(1);
    expect(clampPageNumber(9, 3)).toBe(3);
    expect(clampPageNumber(2.4, 3)).toBe(2);
    expect(clampPageNumber(Number.NaN, 3)).toBe(1);
  });

  it('says when a version has no page at the linked position', () => {
    expect(pageOfVersion(2, 2)).toBe(2);
    expect(pageOfVersion(2, 1)).toBeNull();
    expect(pageOfVersion(0, 1)).toBeNull();
  });

  it('keeps B on its last page past the end', () => {
    expect(holdPageOfB(3, 1)).toBe(1);
    expect(holdPageOfB(1, 4)).toBe(1);
  });

  it('labels an offset only when the pages differ', () => {
    expect(pageOffsetLabel(2, 1)).toBe('A 2 · B 1');
    expect(pageOffsetLabel(1, 1)).toBeNull();
    expect(pageOffsetLabel(null, 1)).toBeNull();
  });
});
