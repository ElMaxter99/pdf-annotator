/** Anchor (x, y in PDF points, as stored in the JSON) of an annotation other annotations can align with. */
export interface SnapTarget {
  x: number;
  y: number;
  name: string;
}

export interface AnnotationSnapMatch {
  value: number;
  name: string;
}

export interface AnnotationSnapResult {
  x: AnnotationSnapMatch | null;
  y: AnnotationSnapMatch | null;
}

/** Allowed distances (screen px) of the magnet between annotations; the first is the default. */
export const ANNOTATION_SNAP_DISTANCES = [6, 3, 10] as const;
export const DEFAULT_ANNOTATION_SNAP_DISTANCE = 6;

export function normalizeSnapDistance(value: unknown): number {
  return typeof value === 'number' && (ANNOTATION_SNAP_DISTANCES as readonly number[]).includes(value)
    ? value
    : DEFAULT_ANNOTATION_SNAP_DISTANCE;
}

/**
 * Finds, per axis, the closest stored X / Y of another annotation within `tolerance` (PDF points).
 * Each axis is independent: an annotation can align in X, in Y, in both or in none.
 */
export function snapToAnnotations(
  x: number,
  y: number,
  targets: readonly SnapTarget[],
  tolerance: number,
): AnnotationSnapResult {
  let bestX: AnnotationSnapMatch | null = null;
  let bestY: AnnotationSnapMatch | null = null;
  let dx = Infinity;
  let dy = Infinity;
  if (!(tolerance > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: null, y: null };
  }
  for (const t of targets) {
    // An axis with a non-finite value (e.g. unreachable) is simply not offered; the other still counts.
    const ax = Math.abs(t.x - x);
    if (ax <= tolerance && ax < dx) {
      dx = ax;
      bestX = { value: t.x, name: t.name };
    }
    const ay = Math.abs(t.y - y);
    if (ay <= tolerance && ay < dy) {
      dy = ay;
      bestY = { value: t.y, name: t.name };
    }
  }
  return { x: bestX, y: bestY };
}
