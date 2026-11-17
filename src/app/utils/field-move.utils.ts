import type { PageField } from '../models/annotation.model';

const roundToTwo = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Copia de `field` movida `dx`, `dy` puntos PDF y mantenida dentro de la página (2 decimales). */
export function moveFieldWithinPage(
  field: PageField,
  dx: number,
  dy: number,
  pageWidthPt: number,
  pageHeightPt: number,
): PageField {
  return {
    ...field,
    x: roundToTwo(clamp(field.x + dx, 0, pageWidthPt)),
    y: roundToTwo(clamp(field.y + dy, 0, pageHeightPt)),
  };
}
