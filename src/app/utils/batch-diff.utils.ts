import type { PageAnnotations, PageField } from '../models/annotation.model';

export type DiffKind = 'same' | 'moved' | 'page' | 'new' | 'missing';

export interface DiffRow {
  readonly kind: DiffKind;
  readonly key: string;
  readonly a?: { readonly page: number; readonly field: PageField };
  readonly b?: { readonly page: number; readonly field: PageField };
}

export interface DiffReport {
  readonly rows: readonly DiffRow[];
  readonly counts: Readonly<Record<DiffKind, number>>;
  readonly pagesA: number;
  readonly pagesB: number;
  readonly fieldsA: number;
  readonly fieldsB: number;
}

const NEAR = 0.5;

function flatten(pages: readonly PageAnnotations[] | null | undefined) {
  const out: { page: number; field: PageField }[] = [];
  for (const page of pages ?? []) {
    for (const field of page.fields) out.push({ page: page.num, field });
  }
  return out;
}

/**
 * Pairs the fields of template A with those of template B by field name (`mapField`) and says what
 * changed: same place, moved on the same page, changed page, only in B, or missing from B.
 * Fields without a name cannot be paired; they count as «missing» (A) or «new» (B).
 */
export function diffTemplates(
  a: readonly PageAnnotations[] | null | undefined,
  b: readonly PageAnnotations[] | null | undefined
): DiffReport {
  const fa = flatten(a);
  const fb = flatten(b);
  const used = new Set<number>();
  const rows: DiffRow[] = [];
  for (const left of fa) {
    const name = left.field.mapField;
    let index = -1;
    if (name) {
      index = fb.findIndex((right, i) => !used.has(i) && right.field.mapField === name && right.page === left.page);
      if (index < 0) index = fb.findIndex((right, i) => !used.has(i) && right.field.mapField === name);
    }
    if (index < 0) {
      rows.push({ kind: 'missing', key: name || `p${left.page}`, a: left });
      continue;
    }
    used.add(index);
    const right = fb[index];
    const samePlace =
      Math.abs(left.field.x - right.field.x) <= NEAR && Math.abs(left.field.y - right.field.y) <= NEAR;
    const kind: DiffKind = left.page !== right.page ? 'page' : samePlace ? 'same' : 'moved';
    rows.push({ kind, key: name, a: left, b: right });
  }
  fb.forEach((right, i) => {
    if (!used.has(i)) rows.push({ kind: 'new', key: right.field.mapField || `p${right.page}`, b: right });
  });
  const counts: Record<DiffKind, number> = { same: 0, moved: 0, page: 0, new: 0, missing: 0 };
  for (const row of rows) counts[row.kind]++;
  return {
    rows,
    counts,
    pagesA: (a ?? []).filter((p) => p.fields.length > 0).length,
    pagesB: (b ?? []).filter((p) => p.fields.length > 0).length,
    fieldsA: fa.length,
    fieldsB: fb.length,
  };
}

/** Name of the A field that the B field `name` stands for, with its page; null when it only exists in B. */
export function templatePageOfField(
  template: readonly PageAnnotations[] | null | undefined,
  name: string | undefined
): number | null {
  if (!name) return null;
  for (const page of template ?? []) {
    if (page.fields.some((f) => f.mapField === name)) return page.num;
  }
  return null;
}

/** Moves one field to another page of the same set (the page is created when it does not exist). */
export function moveFieldToPage(
  pages: readonly PageAnnotations[],
  fromPage: number,
  fieldIndex: number,
  toPage: number
): PageAnnotations[] {
  if (fromPage === toPage) return pages.map((p) => ({ ...p, fields: [...p.fields] }));
  const next = pages.map((p) => ({ ...p, fields: [...p.fields] }));
  const from = next.find((p) => p.num === fromPage);
  const field = from?.fields[fieldIndex];
  if (!from || !field) return next;
  from.fields.splice(fieldIndex, 1);
  let dest = next.find((p) => p.num === toPage);
  if (!dest) {
    dest = { num: toPage, fields: [] };
    next.push(dest);
    next.sort((x, y) => x.num - y.num);
  }
  dest.fields.push({ ...field });
  return next.filter((p) => p.fields.length > 0 || p.num === toPage);
}
