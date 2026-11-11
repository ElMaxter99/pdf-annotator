/** Text found in a PDF page, in PDF points (origin bottom-left, baseline of the first character). */
export interface PageTextItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface TextAnchor {
  readonly id: number;
  /** Text as written in A. */
  readonly text: string;
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
  /** Horizontal and vertical move from A to B, in PDF points (positive = right / up). */
  readonly dx: number;
  readonly dy: number;
  /** The text appears more than once; it was paired by reading order. */
  readonly ambiguous: boolean;
}

export type ShiftConfidence = 'high' | 'medium' | 'low' | 'estimated';

export interface FieldShift {
  readonly dx: number;
  readonly dy: number;
  readonly confidence: ShiftConfidence;
  /** Anchors that decided this shift (empty when it is the page-wide estimate). */
  readonly anchorIds: readonly number[];
}

export interface AnchorReport {
  readonly anchors: TextAnchor[];
  /** Anchors that move differently from their neighbours (off by default). */
  readonly outliers: ReadonlySet<number>;
  /** Anchors off by default: outliers and ambiguous ones that disagree with the rest. */
  readonly defaultOff: ReadonlySet<number>;
  readonly aTexts: number;
  readonly bTexts: number;
}

/** Texts shorter than this, or made only of digits and symbols, change between versions: not anchors. */
export const MIN_ANCHOR_LENGTH = 3;
/** An anchor that moves more than this (points) away from the typical move, with no neighbour agreeing, is an outlier. */
export const OUTLIER_TOLERANCE = 12;
/** Anchors farther than this (points) from a field do not decide its position. */
export const ANCHOR_RADIUS = 180;
export const NEAREST_ANCHORS = 3;
export const MIN_RELIABLE_ANCHORS = 3;

export function normalizeAnchorText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isAnchorCandidate(normalized: string): boolean {
  return normalized.length >= MIN_ANCHOR_LENGTH && /\p{L}/u.test(normalized);
}

export function median(values: readonly number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((p, q) => p - q);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function readingOrder(a: PageTextItem, b: PageTextItem): number {
  return b.y - a.y || a.x - b.x;
}

function groupByText(items: readonly PageTextItem[]): Map<string, PageTextItem[]> {
  const groups = new Map<string, PageTextItem[]>();
  for (const item of items) {
    const key = normalizeAnchorText(item.text);
    if (!isAnchorCandidate(key)) {
      continue;
    }
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/**
 * Pairs the texts that A and B have in common. `scale` is applied to the positions of A first,
 * so a resize of the page is not mistaken for a move.
 */
export function findAnchors(
  aItems: readonly PageTextItem[],
  bItems: readonly PageTextItem[],
  scale = 1,
): AnchorReport {
  const aGroups = groupByText(aItems);
  const bGroups = groupByText(bItems);
  const anchors: TextAnchor[] = [];
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;

  for (const [key, aList] of aGroups) {
    const bList = bGroups.get(key);
    if (!bList) {
      continue;
    }
    const ambiguous = aList.length > 1 || bList.length > 1;
    if (ambiguous && aList.length !== bList.length) {
      continue; // cannot tell which is which
    }
    const aSorted = [...aList].sort(readingOrder);
    const bSorted = [...bList].sort(readingOrder);
    aSorted.forEach((a, index) => {
      const b = bSorted[index];
      const ax = a.x * factor;
      const ay = a.y * factor;
      anchors.push({
        id: anchors.length + 1,
        text: a.text.trim(),
        a: { x: ax, y: ay },
        b: { x: b.x, y: b.y },
        dx: b.x - ax,
        dy: b.y - ay,
        ambiguous,
      });
    });
  }

  const typical = (list: readonly TextAnchor[]) => ({
    dx: median(list.map((anchor) => anchor.dx)),
    dy: median(list.map((anchor) => anchor.dy)),
  });
  const farFrom = (anchor: { dx: number; dy: number }, ref: { dx: number; dy: number }) =>
    Math.abs(anchor.dx - ref.dx) > OUTLIER_TOLERANCE ||
    Math.abs(anchor.dy - ref.dy) > OUTLIER_TOLERANCE;

  const outliers = new Set<number>();
  const defaultOff = new Set<number>();
  const unique = anchors.filter((anchor) => !anchor.ambiguous);
  const reference = typical(unique.length ? unique : anchors);
  if (anchors.length >= MIN_RELIABLE_ANCHORS) {
    for (const anchor of anchors) {
      const backed = anchors.some(
        (other) =>
          other.id !== anchor.id &&
          Math.hypot(other.a.x - anchor.a.x, other.a.y - anchor.a.y) <= ANCHOR_RADIUS &&
          !farFrom(other, anchor),
      );
      if (farFrom(anchor, reference) && !backed) {
        outliers.add(anchor.id);
        defaultOff.add(anchor.id);
      }
    }
  }
  for (const anchor of anchors) {
    if (anchor.ambiguous && farFrom(anchor, reference)) {
      defaultOff.add(anchor.id);
    }
  }
  return { anchors, outliers, defaultOff, aTexts: aItems.length, bTexts: bItems.length };
}

export interface ShiftableField {
  readonly x: number;
  readonly y: number;
}

/**
 * Proposes where each field of A goes in B. `near` follows the closest anchors (so a table that
 * moved down does not drag the header); `global` moves every field by the typical shift.
 * Returns null per field when there is no active anchor at all.
 */
export function proposeShifts(
  fields: readonly ShiftableField[],
  anchors: readonly TextAnchor[],
  active: ReadonlySet<number>,
  mode: 'near' | 'global' = 'near',
): Array<FieldShift | null> {
  const usable = anchors.filter((anchor) => active.has(anchor.id));
  if (!usable.length) {
    return fields.map(() => null);
  }
  const global = {
    dx: median(usable.map((anchor) => anchor.dx)),
    dy: median(usable.map((anchor) => anchor.dy)),
  };
  const lowCap = usable.length < MIN_RELIABLE_ANCHORS;
  const cap = (value: ShiftConfidence): ShiftConfidence =>
    lowCap && value !== 'estimated' ? 'low' : value;

  return fields.map((field) => {
    if (mode === 'near') {
      const near = usable
        .map((anchor) => ({
          anchor,
          distance: Math.hypot(anchor.a.x - field.x, anchor.a.y - field.y),
        }))
        .filter((entry) => entry.distance <= ANCHOR_RADIUS)
        .sort((p, q) => p.distance - q.distance)
        .slice(0, NEAREST_ANCHORS)
        .map((entry) => entry.anchor);
      if (near.length) {
        const dxs = near.map((anchor) => anchor.dx);
        const dys = near.map((anchor) => anchor.dy);
        const spread = Math.max(
          Math.max(...dxs) - Math.min(...dxs),
          Math.max(...dys) - Math.min(...dys),
        );
        let confidence: ShiftConfidence = 'low';
        if (near.length >= 2 && spread <= 2) {
          confidence = 'high';
        } else if (spread <= 6) {
          confidence = 'medium';
        }
        return {
          dx: median(dxs),
          dy: median(dys),
          confidence: cap(confidence),
          anchorIds: near.map((anchor) => anchor.id),
        };
      }
    }
    return {
      dx: global.dx,
      dy: global.dy,
      confidence: mode === 'global' ? cap('medium') : 'estimated',
      anchorIds: mode === 'global' ? usable.map((anchor) => anchor.id) : [],
    };
  });
}
