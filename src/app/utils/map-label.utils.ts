import type { PreviewMode } from './preview-values.utils';

/** Which annotations get a mini label with their mapField (P-184 a P-186). */
export type MapLabelScope = 'check' | 'all';
export type MapLabelPosition = 'auto' | 'right' | 'above';

export interface MapLabelSettings {
  readonly show: boolean;
  readonly scope: MapLabelScope;
  /** Longest label, in characters. */
  readonly max: number;
  readonly position: MapLabelPosition;
  /** Full-name tooltip on hover/focus; independent from the label. */
  readonly tooltip: boolean;
}

export const MAP_LABEL_MIN = 8;
export const MAP_LABEL_MAX = 40;
export const MAP_LABEL_DEFAULT_MAX = 18;

export const DEFAULT_MAP_LABEL_SETTINGS: MapLabelSettings = {
  show: false,
  scope: 'check',
  max: MAP_LABEL_DEFAULT_MAX,
  position: 'auto',
  tooltip: true,
};

export function normalizeMapLabelMax(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= MAP_LABEL_MIN && n <= MAP_LABEL_MAX
    ? n
    : null;
}

/** Saved values are untrusted: anything unknown falls back to the default. */
export function normalizeMapLabelSettings(raw: unknown): MapLabelSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MAP_LABEL_SETTINGS;
  return {
    show: typeof src['show'] === 'boolean' ? src['show'] : d.show,
    scope: src['scope'] === 'all' || src['scope'] === 'check' ? src['scope'] : d.scope,
    max: normalizeMapLabelMax(src['max']) ?? d.max,
    position:
      src['position'] === 'right' || src['position'] === 'above' || src['position'] === 'auto'
        ? src['position']
        : d.position,
    tooltip: typeof src['tooltip'] === 'boolean' ? src['tooltip'] : d.tooltip,
  };
}

/** Splits a mapField into the common beginning and its last segment (what tells fields apart). */
export function splitMapField(mapField: string): { prefix: string; tail: string } {
  const cut = mapField.lastIndexOf('.');
  if (cut < 0) {
    return { prefix: '', tail: mapField };
  }
  return { prefix: mapField.slice(0, cut + 1), tail: mapField.slice(cut + 1) };
}

/**
 * Short form of a mapField: the end wins. Keeps the last segment and the `[n]` indices of the rest
 * (`contrato.intervinientes[0].condicion.esTitular` → `[0]…esTitular`).
 */
export function shortenMapField(mapField: string, max: number): string {
  const name = mapField.trim();
  if (name.length <= max) {
    return name;
  }
  const { prefix, tail } = splitMapField(name);
  if (tail.length >= max) {
    return `…${tail.slice(tail.length - (max - 1))}`;
  }
  const indices = (prefix.match(/\[\d+\]/g) ?? []).join('');
  return indices && indices.length + 1 + tail.length <= max ? `${indices}…${tail}` : `…${tail}`;
}

/** Whether an annotation of this type gets a label in this view. */
export function wantsMapLabel(
  type: string,
  scope: MapLabelScope,
  mode: PreviewMode,
  hasOwnValue: boolean,
): boolean {
  const isCheck = type === 'check' || type === 'radio';
  if (scope === 'check' && !isCheck) {
    return false;
  }
  // «Mapeo» already paints the whole name inside text and number boxes.
  return !(mode === 'map' && !isCheck && !hasOwnValue);
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type LabelSlot = 'below' | 'lane2' | 'right' | 'above' | 'above2' | 'hidden';

export interface LabelPlacement {
  readonly slot: LabelSlot;
  readonly x: number;
  readonly y: number;
}

const GAP = 2;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1;
}

function candidates(box: Rect, label: { w: number; h: number }, position: MapLabelPosition) {
  const left = box.x - 4;
  const all: Record<Exclude<LabelSlot, 'hidden'>, { x: number; y: number }> = {
    below: { x: left, y: box.y + box.h + GAP },
    lane2: { x: left, y: box.y + box.h + GAP + label.h + 4 },
    right: { x: box.x + box.w + 4, y: box.y + (box.h - label.h) / 2 },
    above: { x: left, y: box.y - label.h - GAP },
    above2: { x: left, y: box.y - 2 * label.h - GAP - 4 },
  };
  const order: Exclude<LabelSlot, 'hidden'>[] =
    position === 'right' ? ['right'] : position === 'above' ? ['above', 'above2'] : ['below', 'lane2', 'right'];
  return order.map((slot) => ({ slot, ...all[slot] }));
}

/**
 * Greedy placement in reading order: the first free slot wins, a label never covers another label
 * or an annotation, and one that fits nowhere is hidden. `items[i]` ↔ result `[i]`.
 */
export function placeLabels(
  items: readonly { box: Rect; label: { w: number; h: number } }[],
  obstacles: readonly Rect[],
  position: MapLabelPosition,
): LabelPlacement[] {
  const result: LabelPlacement[] = items.map(() => ({ slot: 'hidden', x: 0, y: 0 }));
  const placed: Rect[] = [];
  const order = items
    .map((_, i) => i)
    .sort((a, b) => items[a].box.y - items[b].box.y || items[a].box.x - items[b].box.x);
  for (const i of order) {
    const { box, label } = items[i];
    for (const c of candidates(box, label, position)) {
      const rect: Rect = { x: c.x, y: c.y, w: label.w, h: label.h };
      if (c.x < 0 || c.y < 0) {
        continue;
      }
      if (placed.some((p) => overlaps(rect, p)) || obstacles.some((o) => overlaps(rect, o))) {
        continue;
      }
      placed.push(rect);
      result[i] = { slot: c.slot, x: c.x, y: c.y };
      break;
    }
  }
  return result;
}
