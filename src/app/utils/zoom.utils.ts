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
