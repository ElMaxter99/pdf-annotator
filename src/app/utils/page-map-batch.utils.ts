/** Pure rules of «Sugerir tablas» for several PDFs of the batch (P-100 a P-102). */
import type { PageMapData } from '../models/batch.model';
import type { PageSuggestion } from './page-map.utils';

/** Why a PDF of the selection is (or is not) given a table. */
export type PageMapCandidate = 'suggest' | 'noB' | 'hasMap' | 'same';

export interface PageMapBatchPlan {
  /** Marked PDFs. */
  readonly total: number;
  /** PDFs that will get a suggested table. */
  readonly suggest: number;
  /** PDFs left out, by reason. */
  readonly noB: number;
  readonly hasMap: number;
  readonly same: number;
}

/** Decides whether a PDF can get a table: it needs A and B with a different number of pages. */
export function classifyForTable(
  item: { readonly bPdf: unknown; readonly pageMap?: PageMapData },
  pagesA: number,
  pagesB: number,
  replace: boolean,
): PageMapCandidate {
  if (!item.bPdf) {
    return 'noB';
  }
  if (item.pageMap && !replace) {
    return 'hasMap';
  }
  if (pagesA > 0 && pagesA === pagesB) {
    return 'same';
  }
  return 'suggest';
}

export function planTables(kinds: readonly PageMapCandidate[]): PageMapBatchPlan {
  const count = (kind: PageMapCandidate) => kinds.filter((k) => k === kind).length;
  return {
    total: kinds.length,
    suggest: count('suggest'),
    noB: count('noB'),
    hasMap: count('hasMap'),
    same: count('same'),
  };
}

export interface SuggestionVerdict {
  /** `applied`: every page of the shorter version found its match; `doubt`: it is left for review. */
  readonly verdict: 'applied' | 'doubt';
  /** Pages of B with a match. */
  readonly matched: number;
  /** Pages that had to find a match (the pages of the shorter version). */
  readonly expected: number;
}

/**
 * A table is applied without asking only when it is clear: every page of the shorter version (the
 * original for a new cover, B for a removed page) found a page above the threshold. Anything else
 * waits for the person.
 */
export function judgeSuggestion(
  pagesA: number,
  pagesB: number,
  suggestion: PageSuggestion,
): SuggestionVerdict {
  const matched = suggestion.map.pairs.filter((pair) => pair !== null).length;
  const expected = Math.min(pagesA, pagesB);
  return { verdict: expected > 0 && matched >= expected ? 'applied' : 'doubt', matched, expected };
}
