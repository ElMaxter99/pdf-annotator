import type { PageAnnotations } from '../models/annotation.model';

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export type SizeStrategy = 'scale' | 'keep' | 'manual';

const KNOWN_SIZES: readonly { name: string; width: number; height: number }[] = [
  { name: 'A3', width: 842, height: 1191 },
  { name: 'A4', width: 595, height: 842 },
  { name: 'A5', width: 420, height: 595 },
  { name: 'Letter', width: 612, height: 792 },
  { name: 'Legal', width: 612, height: 1008 },
];

/** "A4", "Letter"… or an empty string for custom sizes. Orientation is ignored. */
export function pageSizeName(size: PageSize): string {
  const short = Math.min(size.width, size.height);
  const long = Math.max(size.width, size.height);
  const match = KNOWN_SIZES.find((k) => Math.abs(k.width - short) <= 2 && Math.abs(k.height - long) <= 2);
  return match?.name ?? '';
}

export function formatPageSize(size: PageSize): string {
  const name = pageSizeName(size);
  const dims = `${Math.round(size.width)}×${Math.round(size.height)}`;
  return name ? `${name} · ${dims}` : dims;
}

export function pageSizesDiffer(a: PageSize, b: PageSize, tolerance = 1): boolean {
  return Math.abs(a.width - b.width) > tolerance || Math.abs(a.height - b.height) > tolerance;
}

export function sizeRuleKey(from: PageSize, to: PageSize): string {
  return `${Math.round(from.width)}x${Math.round(from.height)}>${Math.round(to.width)}x${Math.round(to.height)}`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Multiplies x and y by the ratio between the new and the original page. Pure: returns copies. */
export function scaleAnnotations(
  pages: readonly PageAnnotations[],
  from: PageSize,
  to: PageSize
): PageAnnotations[] {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return pages.map((page) => ({
    ...page,
    fields: page.fields.map((field) => ({
      ...field,
      x: round2(field.x * sx),
      y: round2(field.y * sy),
    })),
  }));
}

/** Estimated box of a field in PDF points (origin bottom-left): [left, bottom, right, top]. */
export function fieldBox(
  field: { x: number; y: number; fontSize: number },
  text: string
): [number, number, number, number] {
  const width = Math.max(text.length, 1) * field.fontSize * 0.5;
  return [field.x, field.y, field.x + width, field.y + field.fontSize];
}

export function boxesOverlap(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
