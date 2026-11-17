/** Caja de una anotación al empezar el arrastre en grupo (px de pantalla). */
export interface GroupDragItem {
  startLeft: number;
  startTop: number;
  width: number;
  /** Alto de la caja: el tamaño de letra en px. */
  fontPx: number;
}

/** Umbral (px) por debajo del cual un arrastre en grupo cuenta como un simple clic. */
export const GROUP_DRAG_THRESHOLD_PX = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Si el desplazamiento crudo ya supera el umbral de un arrastre. */
export function exceedsDragThreshold(rawDx: number, rawDy: number): boolean {
  return Math.abs(rawDx) > GROUP_DRAG_THRESHOLD_PX || Math.abs(rawDy) > GROUP_DRAG_THRESHOLD_PX;
}

/**
 * Limita el desplazamiento del grupo entero para que ningún miembro salga de la página y se
 * conserve la separación entre ellos.
 */
export function clampGroupDrag(
  items: readonly GroupDragItem[],
  canvasWidthPx: number,
  canvasHeightPx: number,
  rawDx: number,
  rawDy: number,
): { dx: number; dy: number } {
  if (!items.length) {
    return { dx: rawDx, dy: rawDy };
  }
  const minDx = Math.max(...items.map((i) => -i.startLeft));
  const maxDx = Math.min(...items.map((i) => canvasWidthPx - i.width - i.startLeft));
  const minDy = Math.max(...items.map((i) => -i.fontPx - i.startTop));
  const maxDy = Math.min(...items.map((i) => canvasHeightPx - i.fontPx - i.startTop));
  return {
    dx: clamp(rawDx, Math.min(minDx, 0), Math.max(maxDx, 0)),
    dy: clamp(rawDy, Math.min(minDy, 0), Math.max(maxDy, 0)),
  };
}
