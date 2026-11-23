export interface PopoverRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PopoverPlacement {
  /** `float` = junto al punto; `sheet` = hoja inferior a todo el ancho del visor. */
  mode: 'float' | 'sheet';
  left: number;
  top: number;
  /** Ancho a aplicar (solo en `sheet`; en `float` es `null` y manda el CSS). */
  width: number | null;
  /** Lado de la caja donde sale el pico hacia el punto. */
  arrow: 'left' | 'right' | 'none';
  /** Distancia del pico al borde superior de la caja. */
  arrowTop: number;
  /** Alto máximo que debe tener la caja para caber en el visor. */
  maxHeight: number;
}

export interface PopoverInput {
  /** Punto de anclaje (donde se hizo clic) en el mismo sistema que `bounds`. */
  anchor: { x: number; y: number };
  /** Tamaño natural de la caja (alto ya acotado por `maxHeightFor`). */
  size: { width: number; height: number };
  /** Zona visible del visor. */
  bounds: PopoverRect;
  gap?: number;
  margin?: number;
}

export const POPOVER_SHEET_MAX_WIDTH = 720;
export const POPOVER_SHEET_MAX_HEIGHT = 520;

/** Alto máximo de la caja: alto visible del visor menos un margen por arriba y por abajo. */
export function popoverMaxHeight(bounds: PopoverRect, margin = 12): number {
  return Math.max(120, bounds.bottom - bounds.top - margin * 2);
}

/** El visor es tan pequeño que la caja pasa a hoja inferior. */
export function popoverUsesSheet(bounds: PopoverRect): boolean {
  return (
    bounds.right - bounds.left < POPOVER_SHEET_MAX_WIDTH ||
    bounds.bottom - bounds.top < POPOVER_SHEET_MAX_HEIGHT
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Coloca la caja de la anotación sin salirse nunca del visor: a la derecha del punto si cabe,
 * si no a la izquierda, y si tampoco, pegada al borde (sin pico). En vertical se desplaza lo justo.
 */
export function placePopover(input: PopoverInput): PopoverPlacement {
  const { anchor, size, bounds } = input;
  const gap = input.gap ?? 14;
  const margin = input.margin ?? 12;
  const maxHeight = popoverMaxHeight(bounds, margin);
  const height = Math.min(size.height, maxHeight);

  if (popoverUsesSheet(bounds)) {
    const width = bounds.right - bounds.left;
    return {
      mode: 'sheet',
      left: bounds.left,
      top: bounds.bottom - height,
      width,
      arrow: 'none',
      arrowTop: 0,
      maxHeight: Math.max(120, Math.round((bounds.bottom - bounds.top) * 0.6)),
    };
  }

  const minLeft = bounds.left + margin;
  const maxLeft = bounds.right - margin - size.width;
  const minTop = bounds.top + margin;
  const maxTop = bounds.bottom - margin - height;
  const top = clamp(anchor.y - 18, minTop, maxTop);

  let left: number;
  let arrow: PopoverPlacement['arrow'];
  const rightLeft = anchor.x + gap;
  const leftLeft = anchor.x - gap - size.width;
  if (rightLeft <= maxLeft) {
    left = Math.max(rightLeft, minLeft);
    arrow = 'left';
  } else if (leftLeft >= minLeft) {
    left = leftLeft;
    arrow = 'right';
  } else {
    left = clamp(rightLeft, minLeft, maxLeft);
    arrow = 'none';
  }

  return {
    mode: 'float',
    left,
    top,
    width: null,
    arrow,
    arrowTop: clamp(anchor.y - top, 16, height - 16),
    maxHeight,
  };
}

/** Cuánto hay que desplazar el visor para que el punto quede visible por encima de la hoja. */
export function sheetScrollDelta(anchorY: number, sheetTop: number, clearance = 28): number {
  return Math.max(0, anchorY - (sheetTop - clearance));
}
