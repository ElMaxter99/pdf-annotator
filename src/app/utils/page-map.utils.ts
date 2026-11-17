/** Table of pages A↔B (P-78 a P-81): which page of A each page of B is compared with. */
import type { PageAnnotations } from '../models/annotation.model';
import type { PageMapData, PageMapOrigin } from '../models/batch.model';
import type { PageSize } from './page-scale.utils';

const ORIGINS: readonly PageMapOrigin[] = ['auto', 'manual', 'number', 'new'];

/** Pages are matched by number: A1↔B1, A2↔B2…; a page of B past the end of A has no match. */
export function identityMap(pagesA: number, pagesB: number): PageMapData {
  const pairs = Array.from({ length: Math.max(0, pagesB) }, (_, i) => (i + 1 <= pagesA ? i + 1 : null));
  return { pairs, origins: pairs.map(() => 'number' as const) };
}

/** Page of A for page `pageB` of B (`null` = none). Without a table it is the same number. */
export function mapPageOfA(map: PageMapData | null | undefined, pageB: number): number | null {
  if (!map) {
    return pageB;
  }
  return map.pairs[pageB - 1] ?? null;
}

/** Keeps a stored table valid after A or B changed size: what no longer fits becomes «new». */
export function reconcileMap(map: PageMapData, pagesA: number, pagesB: number): PageMapData {
  const pairs: (number | null)[] = [];
  const origins: PageMapOrigin[] = [];
  let changed = map.pairs.length !== pagesB;
  for (let i = 0; i < pagesB; i++) {
    const known = i < map.pairs.length;
    const a = known ? map.pairs[i] : null;
    if (!known) {
      pairs.push(null);
      origins.push('new');
    } else if (a !== null && (a < 1 || a > pagesA)) {
      pairs.push(null);
      origins.push('new');
      changed = true;
    } else {
      pairs.push(a);
      origins.push(map.origins[i] ?? 'manual');
    }
  }
  return changed ? { pairs, origins } : map;
}

/** Stored data is untrusted: rebuilds a table or drops it. */
export function sanitizePageMap(raw: unknown): PageMapData | undefined {
  const value = raw as { pairs?: unknown; origins?: unknown } | null | undefined;
  if (!value || !Array.isArray(value.pairs) || value.pairs.length === 0 || value.pairs.length > 2000) {
    return undefined;
  }
  const pairs = value.pairs.map((a) =>
    typeof a === 'number' && Number.isInteger(a) && a >= 1 && a <= 100000 ? a : null,
  );
  const origins = pairs.map((_, i) => {
    const origin = Array.isArray(value.origins) ? value.origins[i] : undefined;
    return ORIGINS.includes(origin as PageMapOrigin) ? (origin as PageMapOrigin) : 'manual';
  });
  return { pairs, origins };
}

/** Offset shared by every matched page (`a - b`), or `null` when the table is not a plain shift. */
export function uniformOffset(pairs: readonly (number | null)[]): number | null {
  let offset: number | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const a = pairs[i];
    if (a === null) {
      continue;
    }
    if (offset === null) {
      offset = a - (i + 1);
    } else if (a - (i + 1) !== offset) {
      return null;
    }
  }
  return offset;
}

/** «Desplazar todas»: moves every match one page (or more); a page that falls outside A loses its match. */
export function shiftMap(map: PageMapData, delta: number, pagesA: number): PageMapData {
  const offset = uniformOffset(map.pairs);
  const pairs =
    offset !== null
      ? map.pairs.map((_, i) => {
          const a = i + 1 + offset + delta;
          return a >= 1 && a <= pagesA ? a : null;
        })
      : map.pairs.map((a) => {
          if (a === null) {
            return null;
          }
          const next = a + delta;
          return next >= 1 && next <= pagesA ? next : null;
        });
  return { pairs, origins: pairs.map(() => 'manual' as const) };
}

export interface PageMapReport {
  /** Pages of B that have a match in A. */
  readonly matched: number;
  /** Pages of A used by more than one page of B → the pages of B that share it. */
  readonly repeated: ReadonlyMap<number, readonly number[]>;
  /** Pages of B whose A page is repeated. */
  readonly repeatedRows: ReadonlySet<number>;
  /** Pages of A no page of B points to. */
  readonly unusedA: readonly number[];
  /** Rows the user set by hand. */
  readonly manual: number;
  /** Rows that still need a choice (a new page of B). */
  readonly pending: number;
}

export function analyzePageMap(map: PageMapData, pagesA: number): PageMapReport {
  const users = new Map<number, number[]>();
  map.pairs.forEach((a, i) => {
    if (a !== null) {
      users.set(a, [...(users.get(a) ?? []), i + 1]);
    }
  });
  const repeated = new Map([...users].filter(([, rows]) => rows.length > 1));
  const repeatedRows = new Set([...repeated.values()].flat());
  const unusedA = Array.from({ length: Math.max(0, pagesA) }, (_, i) => i + 1).filter(
    (a) => !users.has(a),
  );
  return {
    matched: map.pairs.filter((a) => a !== null).length,
    repeated,
    repeatedRows,
    unusedA,
    manual: map.origins.filter((origin) => origin === 'manual').length,
    pending: map.origins.filter((origin, i) => origin === 'new' && map.pairs[i] === null).length,
  };
}

/** The template of A with its pages renumbered to the page of B they are compared with. */
export function remapPagesToB(
  pages: readonly PageAnnotations[],
  pairs: readonly (number | null)[],
): PageAnnotations[] {
  const out: PageAnnotations[] = [];
  pairs.forEach((a, i) => {
    if (a === null) {
      return;
    }
    const page = pages.find((candidate) => candidate.num === a);
    if (page) {
      out.push({ ...page, num: i + 1 });
    }
  });
  return out;
}

/** Sizes of A laid out by page of B (so the scale of a page uses the page it is compared with). */
export function sizesOfAByB(
  sizesA: readonly PageSize[],
  pairs: readonly (number | null)[],
): PageSize[] {
  if (!sizesA.length) {
    return [];
  }
  return pairs.map((a, i) => sizesA[Math.min((a ?? i + 1) - 1, sizesA.length - 1)]);
}

const WORD = /[\p{L}\p{N}]{3,}/gu;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(WORD) ?? []);
}

/** Share of words two pages have in common (0…1). */
export function pageSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) {
    return 0;
  }
  let common = 0;
  for (const word of wa) {
    if (wb.has(word)) {
      common += 1;
    }
  }
  return common / (wa.size + wb.size - common);
}

export const SUGGEST_THRESHOLD = 0.6;

export interface PageSuggestion {
  readonly map: PageMapData;
  /** Similarity of each matched row (0 when it has no match). */
  readonly scores: readonly number[];
}

/**
 * Suggests the table from the text of every page: best matches first, each page of A used once;
 * rows under the threshold stay without a match. Rows in `keep` (set by hand) are not touched.
 */
export function suggestPageMap(
  textsA: readonly string[],
  textsB: readonly string[],
  keep?: PageMapData | null,
  threshold = SUGGEST_THRESHOLD,
): PageSuggestion {
  const pairs: (number | null)[] = textsB.map(() => null);
  const origins: PageMapOrigin[] = textsB.map(() => 'auto');
  const scores: number[] = textsB.map(() => 0);
  const takenB = new Set<number>();
  const takenA = new Set<number>();
  if (keep) {
    keep.origins.forEach((origin, i) => {
      if (origin === 'manual' && i < textsB.length) {
        pairs[i] = keep.pairs[i];
        origins[i] = 'manual';
        takenB.add(i);
        if (keep.pairs[i] !== null) {
          takenA.add(keep.pairs[i]!);
        }
      }
    });
  }
  const candidates: { b: number; a: number; score: number }[] = [];
  textsB.forEach((tb, b) =>
    textsA.forEach((ta, a) => {
      const score = pageSimilarity(ta, tb);
      if (score >= threshold) {
        candidates.push({ b, a, score });
      }
    }),
  );
  candidates.sort((x, y) => y.score - x.score || Math.abs(x.a - x.b) - Math.abs(y.a - y.b));
  for (const { b, a, score } of candidates) {
    if (takenB.has(b) || takenA.has(a + 1)) {
      continue;
    }
    pairs[b] = a + 1;
    scores[b] = score;
    takenB.add(b);
    takenA.add(a + 1);
  }
  return { map: { pairs, origins }, scores };
}
