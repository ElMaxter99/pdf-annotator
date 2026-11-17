import type { PageField } from '../models/annotation.model';

const roundToTwo = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Gap, in screen px, between an annotation and its pasted copy. */
export const PASTE_OFFSET_PX = 8;

/**
 * Copy of `field` moved ~8 px on screen and kept inside the canvas (PDF points).
 * `yDirection` is +1 to move up in PDF coordinates and -1 to move down.
 */
export function offsetFieldCopy(
  field: PageField,
  scale: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
  yDirection: 1 | -1,
): PageField {
  const offset = roundToTwo(PASTE_OFFSET_PX / scale);
  const maxX = roundToTwo(canvasWidthPx / scale);
  const maxY = roundToTwo(canvasHeightPx / scale);
  return {
    ...field,
    x: roundToTwo(clamp(field.x + offset, 0, maxX)),
    y: roundToTwo(clamp(field.y + yDirection * offset, 0, maxY)),
  };
}
