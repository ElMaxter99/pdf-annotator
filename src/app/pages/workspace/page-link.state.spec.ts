import { signal } from '@angular/core';
import type { BatchItem } from '../../models/batch.model';
import { createPageLinkState } from './page-link.state';

function setup(opts: { a?: number; b?: number; pageMap?: unknown; comparing?: boolean } = {}) {
  const item = {
    aPages: [],
    bPdf: {},
    pageMap: opts.pageMap,
  } as unknown as BatchItem;
  const pageCountA = signal(opts.a ?? 3);
  const pageCount = signal(opts.b ?? 2);
  const pageIndex = signal(1);
  const pagesLinked = signal(true);
  const commonPage = signal(1);
  const freeAPage = signal(1);
  const comparing = signal(opts.comparing ?? true);
  const state = createPageLinkState({
    activeItem: () => item,
    fitA: () => false,
    pageSizesA: () => [],
    pageSizesB: () => [],
    pageCountA,
    pageCount,
    pageIndex,
    pagesLinked,
    commonPage,
    freeAPage,
    comparing,
    splitActive: () => false,
    showingOnlyA: () => false,
  });
  return { state, pageIndex, pagesLinked, commonPage, freeAPage, comparing, pageCount };
}

describe('createPageLinkState', () => {
  it('without comparing, A follows the page of B and nothing is tagged', () => {
    const { state, pageIndex } = setup({ comparing: false });
    pageIndex.set(2);
    expect(state.aPage()).toBe(2);
    expect(state.pageTag()).toBeNull();
    expect(state.bGhost()).toBeFalse();
  });

  it('linked pages run to max(A, B) and B shows a ghost past its last page', () => {
    const { state, commonPage, pageIndex } = setup({ a: 3, b: 2 });
    expect(state.pageTotalShown()).toBe(3);
    pageIndex.set(2);
    commonPage.set(3);
    expect(state.pageShown()).toBe(3);
    expect(state.bGhost()).toBeTrue();
    expect(state.aPage()).toBe(3);
  });

  it('A has no page past its last one (ghost of A) and the viewer says it is missing', () => {
    const { state, commonPage, pageIndex } = setup({ a: 1, b: 3 });
    pageIndex.set(2);
    commonPage.set(2);
    expect(state.aPage()).toBeNull();
    expect(state.aGhost()).toBeTrue();
    expect(state.pageTag()).toEqual({ kind: 'missing', a: 2, b: 2 });
  });

  it('free pages give A its own page and label the offset', () => {
    const { state, pagesLinked, freeAPage, pageIndex } = setup({ a: 3, b: 3 });
    pagesLinked.set(false);
    freeAPage.set(2);
    pageIndex.set(1);
    expect(state.aPage()).toBe(2);
    expect(state.pageShown()).toBe(1);
    expect(state.pageTotalShown()).toBe(3);
    expect(state.pageOffset()).not.toBeNull();
    expect(state.pageTag()).toEqual({ kind: 'offset', a: 2, b: 1 });
  });

  it('with a table, A follows the pair of the page of B', () => {
    const { state, pageIndex } = setup({
      a: 2,
      b: 3,
      pageMap: { pairs: [null, 1, 2], origins: ['new', 'auto', 'auto'] },
    });
    expect(state.pageMap()).not.toBeNull();
    expect(state.tableLinked()).toBeTrue();
    expect(state.aPage()).toBeNull();
    expect(state.pageTag()).toEqual({ kind: 'unmapped', a: 0, b: 1 });
    pageIndex.set(2);
    expect(state.aPage()).toBe(1);
    expect(state.pageTag()).toEqual({ kind: 'mapped', a: 1, b: 2 });
    expect(state.bGhost()).toBeFalse();
  });
});
