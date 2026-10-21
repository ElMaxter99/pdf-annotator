import type { PageAnnotations, PageField } from '../models/annotation.model';

/** Deep-enough copy: pages and fields are cloned so snapshots never share mutable state. */
export function cloneAnnotationPages(pages: readonly PageAnnotations[]): PageAnnotations[] {
  return pages.map((page) => ({
    num: page.num,
    fields: page.fields.map((field) => ({ ...field })),
  }));
}

export function addFieldToPages(
  pageNum: number,
  field: PageField,
  pages: PageAnnotations[]
): PageAnnotations[] {
  const pageIndex = pages.findIndex((page) => page.num === pageNum);
  if (pageIndex >= 0) {
    return pages.map((page, idx) =>
      idx === pageIndex ? { ...page, fields: [...page.fields, field] } : page
    );
  }
  return [...pages, { num: pageNum, fields: [field] }].sort((a, b) => a.num - b.num);
}

export function updateFieldInPages(
  pageIndex: number,
  fieldIndex: number,
  field: PageField,
  pages: PageAnnotations[]
): PageAnnotations[] {
  return pages.map((page, idx) => {
    if (idx !== pageIndex) {
      return page;
    }
    if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
      return page;
    }
    const updatedFields = page.fields.map((item, itemIdx) =>
      itemIdx === fieldIndex ? { ...field } : item
    );
    return { ...page, fields: updatedFields };
  });
}

/** Removes a field and drops pages that end up empty. */
export function removeFieldFromPages(
  pageIndex: number,
  fieldIndex: number,
  pages: PageAnnotations[]
): PageAnnotations[] {
  return pages
    .map((page, idx) => {
      if (idx !== pageIndex) {
        return page;
      }
      if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
        return page;
      }
      return { ...page, fields: page.fields.filter((_, i) => i !== fieldIndex) };
    })
    .filter((page) => page.fields.length > 0);
}

export function areAnnotationPagesEqual(
  a: readonly PageAnnotations[],
  b: readonly PageAnnotations[],
  fieldsEqual: (x: PageField, y: PageField) => boolean
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    const pageA = a[i];
    const pageB = b[i];
    if (!pageB || pageA.num !== pageB.num || pageA.fields.length !== pageB.fields.length) {
      return false;
    }

    for (let j = 0; j < pageA.fields.length; j += 1) {
      const fieldB = pageB.fields[j];
      if (!fieldB || !fieldsEqual(pageA.fields[j], fieldB)) {
        return false;
      }
    }
  }

  return true;
}
