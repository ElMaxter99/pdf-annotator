import { computed } from '@angular/core';
import type { PageAnnotations } from '../../models/annotation.model';
import type { BatchItem, PageMapData } from '../../models/batch.model';
import { linkedPageTotal, pageOfVersion, pageOffsetLabel } from '../../utils/page-link.utils';
import { mapPageOfA, reconcileMap, remapPagesToB, sizesOfAByB } from '../../utils/page-map.utils';
import {
  type PageSize,
  pageScaleFactors,
  scalePagesToSize,
  sizeOfPage,
} from '../../utils/page-scale.utils';

/** Reads the page needs to give the derived state (signals or lazy getters, evaluated on demand). */
export interface PageLinkInputs {
  activeItem: () => BatchItem | null;
  fitA: () => boolean;
  pageSizesA: () => PageSize[];
  pageSizesB: () => PageSize[];
  pageCountA: () => number;
  pageCount: () => number;
  /** Real page of B. */
  pageIndex: () => number;
  pagesLinked: () => boolean;
  commonPage: () => number;
  freeAPage: () => number;
  comparing: () => boolean;
  splitActive: () => boolean;
  showingOnlyA: () => boolean;
}

export type PageTag = {
  kind: 'missing' | 'offset' | 'mapped' | 'unmapped';
  a: number;
  b: number;
} | null;

/**
 * Derived state of the pages of A and B in the migration editor (P-74 a P-81): the table A↔B, the
 * page of A that goes with each page of B and the labels of the header and of the viewer. The
 * rules themselves live in `utils/page-link.utils.ts` and `utils/page-map.utils.ts`; this only wires
 * them to the signals of the page, which keeps writing `pagesLinked`, `commonPage` and `freeAPage`.
 */
export function createPageLinkState(i: PageLinkInputs) {
  /** Pages of A as shown and copied: scaled to B when «Ajustar» is on. */
  const aPagesView = computed<PageAnnotations[]>(() => {
    const pages = i.activeItem()?.aPages ?? [];
    return i.fitA() ? scalePagesToSize(pages, i.pageSizesA(), i.pageSizesB()) : pages;
  });
  /**
   * Table of pages A↔B of the open pair (P-78 a P-81), already valid for the current pages. It only
   * needs both PDFs open (not `comparing`, which depends on the states that use it).
   */
  const pageMap = computed<PageMapData | null>(() => {
    const item = i.activeItem();
    const a = i.pageCountA();
    const b = i.pageCount();
    if (!item?.pageMap || !item.bPdf || a < 1 || b < 1) {
      return null;
    }
    return reconcileMap(item.pageMap, a, b);
  });
  /** A and B move together and the table decides which page of A goes with each page of B. */
  const tableLinked = computed(() => !!pageMap() && i.pagesLinked());
  /** The template of A with its pages renumbered to the page of B they go with (the table). */
  const aPagesForB = computed<PageAnnotations[]>(() => {
    const map = pageMap();
    if (!map) {
      return aPagesView();
    }
    const remapped = remapPagesToB(i.activeItem()?.aPages ?? [], map.pairs);
    return i.fitA()
      ? scalePagesToSize(remapped, sizesOfAByB(i.pageSizesA(), map.pairs), i.pageSizesB())
      : remapped;
  });
  /** Page of A to draw, or null when A has no page at the linked position. */
  const aPage = computed<number | null>(() => {
    if (!i.comparing()) return i.pageIndex();
    if (!i.pagesLinked()) return i.freeAPage();
    const map = pageMap();
    return map ? mapPageOfA(map, i.pageIndex()) : pageOfVersion(i.commonPage(), i.pageCountA());
  });
  /** Factors applied to A on the current page (for the notice). */
  const fitFactors = computed(() =>
    pageScaleFactors(
      sizeOfPage(i.pageSizesA(), aPage() ?? i.pageIndex()),
      sizeOfPage(i.pageSizesB(), i.pageIndex()),
    ),
  );
  const fitSizes = computed(() => ({
    a: sizeOfPage(i.pageSizesA(), aPage() ?? i.pageIndex()),
    b: sizeOfPage(i.pageSizesB(), i.pageIndex()),
  }));
  const aGhost = computed(() => i.comparing() && aPage() === null);
  /** B has no page at the linked position: its pane shows the empty state. */
  const bGhost = computed(
    () =>
      i.comparing() &&
      i.pagesLinked() &&
      !pageMap() &&
      i.commonPage() > i.pageCount() &&
      !i.showingOnlyA(),
  );
  const linkedByNumber = () => i.comparing() && i.pagesLinked() && !pageMap();
  /** Page shown in the header: the linked one, or B's while the pages are free. */
  const pageShown = computed(() => (linkedByNumber() ? i.commonPage() : i.pageIndex()));
  const pageTotalShown = computed(() =>
    linkedByNumber() ? linkedPageTotal(i.pageCountA(), i.pageCount()) : i.pageCount(),
  );
  /** «A 2 · B 1» while the pages are free and differ. */
  const pageOffset = computed(() =>
    i.comparing() && !i.pagesLinked() ? pageOffsetLabel(aPage(), i.pageIndex()) : null,
  );
  /** Label over the page when A shows another page than B (or none) outside «Dividida». */
  const pageTag = computed<PageTag>(() => {
    if (!i.comparing() || i.splitActive()) return null;
    const a = aPage();
    if (tableLinked()) {
      return a === null
        ? { kind: 'unmapped', a: 0, b: i.pageIndex() }
        : a !== i.pageIndex()
          ? { kind: 'mapped', a, b: i.pageIndex() }
          : null;
    }
    if (a === null) return { kind: 'missing', a: i.commonPage(), b: i.pageIndex() };
    return !i.pagesLinked() && a !== i.pageIndex() ? { kind: 'offset', a, b: i.pageIndex() } : null;
  });
  return {
    aPagesView,
    pageMap,
    tableLinked,
    aPagesForB,
    aPage,
    fitFactors,
    fitSizes,
    aGhost,
    bGhost,
    pageShown,
    pageTotalShown,
    pageOffset,
    pageTag,
  };
}
