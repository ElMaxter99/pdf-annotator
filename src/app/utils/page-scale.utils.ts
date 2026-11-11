import type { PageAnnotations } from '../models/annotation.model';

/** Size of a PDF page in points. */
export interface PageSize {
  readonly w: number;
  readonly h: number;
}

const TOLERANCE = 2;

/** Size of page number `num` (1-based); pages past the end use the last one. */
export function sizeOfPage(sizes: readonly PageSize[], num: number): PageSize | null {
  if (!sizes.length) {
    return null;
  }
  return sizes[Math.min(Math.max(1, Math.floor(num)), sizes.length) - 1];
}

/** `true` when some page of A is not the same size as its page in B (more than 2 points). */
export function sizesDiffer(a: readonly PageSize[], b: readonly PageSize[]): boolean {
  const count = Math.max(a.length, b.length);
  for (let num = 1; num <= count; num++) {
    const sa = sizeOfPage(a, num);
    const sb = sizeOfPage(b, num);
    if (sa && sb && (Math.abs(sa.w - sb.w) > TOLERANCE || Math.abs(sa.h - sb.h) > TOLERANCE)) {
      return true;
    }
  }
  return false;
}

/** Horizontal and vertical factors that take a point of A to the same place of B. */
export function pageScaleFactors(
  a: PageSize | null,
  b: PageSize | null,
): { sx: number; sy: number } {
  if (!a || !b || a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) {
    return { sx: 1, sy: 1 };
  }
  return { sx: b.w / a.w, sy: b.h / a.h };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Scales the coordinates of A to the size of B, page by page: x by the width ratio, y by the
 * height ratio, the font size by the smaller of the two. It returns new objects.
 */
export function scalePagesToSize(
  pages: readonly PageAnnotations[],
  a: readonly PageSize[],
  b: readonly PageSize[],
): PageAnnotations[] {
  return pages.map((page) => {
    const { sx, sy } = pageScaleFactors(sizeOfPage(a, page.num), sizeOfPage(b, page.num));
    if (sx === 1 && sy === 1) {
      return page;
    }
    return {
      ...page,
      fields: page.fields.map((field) => ({
        ...field,
        x: round2(field.x * sx),
        y: round2(field.y * sy),
        fontSize: round2(field.fontSize * Math.min(sx, sy)),
      })),
    };
  });
}
