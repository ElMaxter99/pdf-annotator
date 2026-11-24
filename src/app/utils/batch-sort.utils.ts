export type SortDir = 'asc' | 'desc';

export interface SortSpec<K extends string = string> {
  readonly key: K;
  readonly dir: SortDir;
}

/** Criteria of the batch panel (P-178 a P-180). */
export type BatchSortKey = 'state' | 'name' | 'change' | 'pages' | 'fields' | 'upload';
export type BatchSort = SortSpec<BatchSortKey>;

export const BATCH_SORT_KEYS: readonly BatchSortKey[] = [
  'state',
  'name',
  'change',
  'pages',
  'fields',
  'upload',
];

export const DEFAULT_BATCH_SORT: BatchSort = { key: 'state', dir: 'asc' };

/** Direction a criterion starts with: most recent / most first, names A–Z, upload order as uploaded. */
export function defaultSortDir(key: string): SortDir {
  return key === 'change' || key === 'pages' || key === 'fields' ? 'desc' : 'asc';
}

export function isBatchSortKey(value: unknown): value is BatchSortKey {
  return BATCH_SORT_KEYS.includes(value as BatchSortKey);
}

export function flipDir(dir: SortDir): SortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}

/** The value a row has for each criterion; `undefined`/`null` = no data (goes last whatever the direction). */
export interface SortAccess<T> {
  readonly name: (row: T) => string;
  readonly rank?: (row: T) => number;
  readonly value?: (row: T, key: string) => number | null | undefined;
  readonly index?: (row: T) => number;
}

/**
 * Orders rows by a criterion. Ties are broken by name (natural, A–Z) so the order is always
 * predictable; rows without data for the criterion go last in both directions.
 */
export function sortByCriterion<T>(
  rows: readonly T[],
  spec: SortSpec,
  collator: Intl.Collator,
  access: SortAccess<T>,
): T[] {
  const byName = (a: T, b: T): number => collator.compare(access.name(a), access.name(b));
  const sign = spec.dir === 'asc' ? 1 : -1;
  const list = [...rows];
  if (spec.key === 'state') {
    const rank = access.rank ?? (() => 0);
    return list.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  }
  if (spec.key === 'name') {
    return list.sort((a, b) => sign * byName(a, b));
  }
  if (spec.key === 'upload') {
    const index = access.index ?? (() => 0);
    return list.sort((a, b) => sign * (index(a) - index(b)));
  }
  const value = access.value ?? (() => null);
  return list.sort((a, b) => {
    const va = value(a, spec.key);
    const vb = value(b, spec.key);
    const hasA = typeof va === 'number';
    const hasB = typeof vb === 'number';
    if (!hasA || !hasB) {
      return hasA === hasB ? byName(a, b) : hasA ? -1 : 1;
    }
    return va === vb ? byName(a, b) : sign * (va - vb);
  });
}
