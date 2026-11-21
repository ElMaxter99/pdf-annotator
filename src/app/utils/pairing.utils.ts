/**
 * Parejas A↔B del editor del lote: qué campo de B corresponde a uno de A (y al revés) y por dónde pasa la línea que
 * los une en «Dividida». Puro, sin DOM: la página le pasa los campos y los rectángulos en pantalla.
 */

/** Nombre con el que se emparejan los campos: `mapField` o, sin él, el valor fijo. */
export function pairName(field: { mapField?: unknown; value?: unknown } | null | undefined): string {
  return String(field?.mapField || field?.value || '').trim();
}

export interface PairSpot {
  /** Página (de A, en su propia numeración, o de B). */
  page: number;
  x: number;
  y: number;
}

export interface PairCandidate<R = unknown> extends PairSpot {
  name: string;
  /** Lo que la página necesita para encontrar el elemento (id de la propuesta, índice del campo…). */
  ref: R;
}

/**
 * El candidato con ese nombre más parecido a `near`: primero la misma página que `near` (si se da) y, dentro, el más
 * cercano; si no hay en esa página, el más cercano de cualquier otra (por número de página y luego por distancia).
 */
export function closestByName<R>(
  name: string,
  candidates: readonly PairCandidate<R>[],
  near?: PairSpot | null,
): PairCandidate<R> | null {
  const wanted = name.trim();
  if (!wanted) {
    return null;
  }
  const same = candidates.filter((c) => c.name === wanted);
  if (!same.length) {
    return null;
  }
  if (!near) {
    return same[0];
  }
  const score = (c: PairCandidate<R>) =>
    (c.page === near.page ? 0 : 1e6 + Math.abs(c.page - near.page) * 1e4) + Math.hypot(c.x - near.x, c.y - near.y);
  return same.reduce((best, c) => (score(c) < score(best) ? c : best));
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Línea que une dos rectángulos en pantalla: del borde de A que mira a B al borde de B que mira a A, a media altura
 * (si están uno al lado del otro) o a media anchura (si están uno encima del otro).
 */
export function lineBetween(a: RectLike, b: RectLike): { x1: number; y1: number; x2: number; y2: number } {
  const ac = { x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2 };
  const bc = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
  if (a.right <= b.left) {
    return { x1: a.right, y1: ac.y, x2: b.left, y2: bc.y };
  }
  if (b.right <= a.left) {
    return { x1: a.left, y1: ac.y, x2: b.right, y2: bc.y };
  }
  if (a.bottom <= b.top) {
    return { x1: ac.x, y1: a.bottom, x2: bc.x, y2: b.top };
  }
  if (b.bottom <= a.top) {
    return { x1: ac.x, y1: a.top, x2: bc.x, y2: b.bottom };
  }
  return { x1: ac.x, y1: ac.y, x2: bc.x, y2: bc.y };
}

/**
 * De varios elementos con el mismo nombre, el que está más cerca del punto esperado (en píxeles de su capa).
 * Devuelve el índice o -1.
 */
export function closestElementIndex(
  spots: readonly { left: number; top: number }[],
  expected: { left: number; top: number },
): number {
  let best = -1;
  let bestD = Infinity;
  spots.forEach((s, i) => {
    const d = Math.hypot(s.left - expected.left, s.top - expected.top);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
