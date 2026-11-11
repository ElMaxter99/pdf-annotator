import type { PageAnnotations } from '../models/annotation.model';
import type { FieldLink } from '../models/batch.model';

export type FieldStatus = 'same' | 'moved' | 'renamed' | 'new' | 'missing';

export interface FieldState {
  readonly status: FieldStatus;
  readonly page: number;
  /** Name shown to the user: B's name, or A's for fields missing in B. */
  readonly name: string;
  /** Position in B's pages (not for `missing`). */
  readonly b?: { readonly pageIndex: number; readonly fieldIndex: number };
  /** Matching field of A (not for `new`). */
  readonly a?: {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly fontSize: number;
  };
}

export interface StateSummary {
  readonly same: number;
  readonly moved: number;
  readonly renamed: number;
  readonly new: number;
  readonly missing: number;
}

/** Positions closer than this (in PDF points) count as the same place. */
export const SAME_POSITION_TOLERANCE = 0.5;

export function fieldKey(page: number, name: string): string {
  return `${page}|${name}`;
}

export function fieldName(field: { mapField?: string; value?: string }): string {
  return (field.mapField || field.value || '').trim();
}

interface AEntry {
  readonly page: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  used: boolean;
}

/**
 * Compares the fields of B with those of A. The identity of a field is its name (`mapField`);
 * a different name only counts as the same field when the user linked them explicitly.
 */
export function computeFieldStates(
  aPages: readonly PageAnnotations[],
  bPages: readonly PageAnnotations[],
  links: readonly FieldLink[] = [],
  dismissed: readonly string[] = [],
): FieldState[] {
  const entries: AEntry[] = aPages.flatMap((page) =>
    page.fields.map((field) => ({
      page: page.num,
      name: fieldName(field),
      x: field.x,
      y: field.y,
      fontSize: field.fontSize,
      used: false,
    })),
  );
  const states: FieldState[] = [];

  bPages.forEach((page, pageIndex) => {
    page.fields.forEach((field, fieldIndex) => {
      const name = fieldName(field);
      const ref = { pageIndex, fieldIndex };
      const sameName = entries.find((e) => !e.used && e.page === page.num && e.name === name);
      if (sameName) {
        sameName.used = true;
        const unchanged =
          Math.abs(sameName.x - field.x) <= SAME_POSITION_TOLERANCE &&
          Math.abs(sameName.y - field.y) <= SAME_POSITION_TOLERANCE;
        states.push({
          status: unchanged ? 'same' : 'moved',
          page: page.num,
          name,
          b: ref,
          a: sameName,
        });
        return;
      }
      const link = links.find((l) => l.page === page.num && l.b === name);
      const linked = link
        ? entries.find((e) => !e.used && e.page === page.num && e.name === link.a)
        : undefined;
      if (linked) {
        linked.used = true;
        states.push({ status: 'renamed', page: page.num, name, b: ref, a: linked });
        return;
      }
      states.push({ status: 'new', page: page.num, name, b: ref });
    });
  });

  for (const entry of entries) {
    if (!entry.used && !dismissed.includes(fieldKey(entry.page, entry.name))) {
      states.push({ status: 'missing', page: entry.page, name: entry.name, a: entry });
    }
  }
  return states;
}

export function summarizeStates(states: readonly FieldState[]): StateSummary {
  const summary = { same: 0, moved: 0, renamed: 0, new: 0, missing: 0 };
  for (const state of states) {
    summary[state.status] += 1;
  }
  return summary;
}

/** Fields of A that have been neither placed in B nor dismissed. */
export function missingFields(states: readonly FieldState[]): FieldState[] {
  return states.filter((state) => state.status === 'missing');
}

const VERSION_SUFFIX = /[\s._-]*(nuevo|nueva|new|v\d+|b)$/i;

/** Name used to pair a B file with its A: no extension, no case and no «-nuevo», «-v2» or «-b». */
export function pairingKey(fileName: string): string {
  const base = fileName
    .replace(/\.[^./\\]+$/, '')
    .trim()
    .toLowerCase();
  const stripped = base.replace(VERSION_SUFFIX, '');
  return stripped || base;
}

export interface Pairing<T> {
  readonly paired: ReadonlyArray<{ readonly a: T; readonly b: File }>;
  readonly unpaired: readonly File[];
}

/** Pairs each PDF with the item whose name matches (exact name first, then without suffix). */
export function pairByName<T extends { readonly name: string }>(
  items: readonly T[],
  files: readonly File[],
): Pairing<T> {
  const taken = new Set<T>();
  const paired: Array<{ a: T; b: File }> = [];
  const unpaired: File[] = [];
  for (const file of files) {
    const exact = items.find(
      (item) => !taken.has(item) && item.name.toLowerCase() === file.name.toLowerCase(),
    );
    const loose = items.find(
      (item) => !taken.has(item) && pairingKey(item.name) === pairingKey(file.name),
    );
    const match = exact ?? loose;
    if (match) {
      taken.add(match);
      paired.push({ a: match, b: file });
    } else {
      unpaired.push(file);
    }
  }
  return { paired, unpaired };
}
