export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type ZoomLimit = 'min' | 'max' | null;

/** Keeps a scale inside 25 %–400 % rounded to whole percents. */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 100) / 100));
}

/** Which limit (if any) a requested scale ran into. */
export function zoomLimitFor(requested: number): ZoomLimit {
  if (requested >= MAX_SCALE) return 'max';
  if (requested <= MIN_SCALE) return 'min';
  return null;
}

/**
 * Multiplicative zoom factor for a wheel event with Ctrl/⌘ pressed. A physical wheel
 * notch (|deltaY| ≥ 50) is about 10 %; trackpad pinches arrive as many small deltas and
 * are finer so the page does not jump. Always within [0.8, 1.25].
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const k = Math.abs(pixels) >= 50 ? 0.001 : 0.01;
  return Math.min(1.25, Math.max(0.8, Math.exp(-pixels * k)));
}

/** Next scale for a zoom step (keyboard / menu): ±25 % like the existing buttons. */
export function stepScale(scale: number, direction: 1 | -1): number {
  return clampScale(scale + direction * 0.25);
}

function floorPercent(value: number): number {
  return Math.floor(value * 100) / 100;
}

function clampFit(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Escala para que la página ocupe todo el ancho disponible; `null` si las medidas no valen. */
export function fitWidthScale(baseWidth: number, availableWidth: number): number | null {
  if (!(baseWidth > 0) || !(availableWidth > 0)) return null;
  return clampFit(floorPercent(availableWidth / baseWidth));
}

/** Escala para que la página entera quepa en el área disponible; `null` si las medidas no valen. */
export function fitPageScale(
  baseWidth: number,
  baseHeight: number,
  availableWidth: number,
  availableHeight: number,
): number | null {
  if (!(baseWidth > 0) || !(baseHeight > 0) || !(availableWidth > 0) || !(availableHeight > 0)) {
    return null;
  }
  return clampFit(floorPercent(Math.min(availableWidth / baseWidth, availableHeight / baseHeight)));
}

/** Segundo ajuste de «página entera» cuando aparece scroll vertical: resta el desbordamiento. */
export function fitPageScaleForOverflow(
  baseHeight: number,
  scale: number,
  overflow: number,
): number {
  return clampFit(floorPercent((baseHeight * scale - overflow) / baseHeight));
}

export interface PanStart {
  /** Posición del puntero al empezar a arrastrar. */
  readonly x: number;
  readonly y: number;
  /** Desplazamiento del visor al empezar a arrastrar. */
  readonly left: number;
  readonly top: number;
}

/** Desplazamiento del visor al mover la mano: el lienzo sigue al puntero. */
export function panScrollPosition(
  start: PanStart,
  pointer: { clientX: number; clientY: number },
): { left: number; top: number } {
  return {
    left: start.left - (pointer.clientX - start.x),
    top: start.top - (pointer.clientY - start.y),
  };
}

/**
 * Cuánto hay que desplazar el visor tras un zoom para que el punto bajo `anchor` siga en su sitio.
 * `before`/`after` son las esquinas (izquierda, arriba) del lienzo antes y después del zoom.
 */
export function zoomAnchorScrollDelta(
  before: { left: number; top: number },
  after: { left: number; top: number },
  anchor: { clientX: number; clientY: number },
  previousScale: number,
  nextScale: number,
): { dx: number; dy: number } {
  const ux = (anchor.clientX - before.left) / previousScale;
  const uy = (anchor.clientY - before.top) / previousScale;
  return {
    dx: after.left + ux * nextScale - anchor.clientX,
    dy: after.top + uy * nextScale - anchor.clientY,
  };
}
