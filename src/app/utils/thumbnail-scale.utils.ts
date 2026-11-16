const THUMBNAIL_TARGET_WIDTH = 120;
const THUMBNAIL_MIN_SCALE = 0.15;
const THUMBNAIL_FALLBACK_SCALE = 0.25;

/** Escala que deja una miniatura de ~120 px de ancho, acotada a [0,15 – 1]. */
export function thumbnailScale(pageWidth: number): number {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) {
    return THUMBNAIL_FALLBACK_SCALE;
  }
  return Math.min(1, Math.max(THUMBNAIL_TARGET_WIDTH / pageWidth, THUMBNAIL_MIN_SCALE));
}
