const roundToTwo = (value: number): number => +value.toFixed(2);

/**
 * Pixel dentro del lienzo (origen arriba-izquierda) → punto PDF (origen abajo-izquierda),
 * con dos decimales.
 */
export function pixelToPdfPoint(
  xPx: number,
  yPx: number,
  canvasHeightPx: number,
  scale: number,
): { x: number; y: number } {
  return { x: roundToTwo(xPx / scale), y: roundToTwo((canvasHeightPx - yPx) / scale) };
}

/** Punto PDF → píxel dentro del lienzo (la inversa de `pixelToPdfPoint`, sin redondear). */
export function pdfPointToPixel(
  x: number,
  y: number,
  canvasHeightPx: number,
  scale: number,
): { left: number; top: number } {
  return { left: x * scale, top: canvasHeightPx - y * scale };
}
