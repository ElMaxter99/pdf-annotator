import {
  proposeShifts,
  type FieldShift,
  type TextAnchor,
} from './text-anchors.utils';

export type AdjustMode = 'near' | 'global';

export interface AdjustField {
  readonly key: string;
  readonly page: number;
  readonly fieldIndex: number;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly shift: FieldShift | null;
  /** The user ticked or unticked it; null = follow the default. */
  readonly override: boolean | null;
  /** Moved by hand: fixed, not recomputed. */
  readonly manual: { readonly dx: number; readonly dy: number } | null;
}

export interface AdjustAnchorRow {
  readonly key: string;
  readonly page: number;
  readonly anchor: TextAnchor;
  readonly on: boolean;
  readonly outlier: boolean;
}

/** By default a field moves when it has a shift and it is reliable; low reliability waits for the user. */
export function isFieldMoved(field: AdjustField): boolean {
  if (field.override !== null) {
    return field.override && (!!field.shift || !!field.manual);
  }
  if (field.manual) {
    return true;
  }
  return !!field.shift && field.shift.confidence !== 'low';
}

export function effectiveShift(field: AdjustField): { dx: number; dy: number } {
  if (!isFieldMoved(field)) {
    return { dx: 0, dy: 0 };
  }
  if (field.manual) {
    return field.manual;
  }
  return field.shift ? { dx: field.shift.dx, dy: field.shift.dy } : { dx: 0, dy: 0 };
}

/** Recomputes every shift from the anchors that are on. */
export function recomputeFields(
  fields: readonly AdjustField[],
  anchors: readonly AdjustAnchorRow[],
  mode: AdjustMode,
): AdjustField[] {
  const out = fields.map((field) => ({ ...field }));
  const pages = new Set(fields.map((field) => field.page));
  for (const page of pages) {
    const rows = anchors.filter((row) => row.page === page);
    const active = new Set(rows.filter((row) => row.on).map((row) => row.anchor.id));
    const indexes = out
      .map((field, index) => (field.page === page ? index : -1))
      .filter((index) => index >= 0);
    const shifts = proposeShifts(
      indexes.map((index) => out[index]),
      rows.map((row) => row.anchor),
      active,
      mode,
    );
    indexes.forEach((index, i) => {
      out[index] = { ...out[index], shift: shifts[i] };
    });
  }
  return out;
}

/** Box a field takes on the page in PDF points, as drawn in the reference layer. */
export function fieldBox(
  field: Pick<AdjustField, 'name' | 'x' | 'y' | 'fontSize'>,
  dx: number,
  dy: number,
  scale: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const size = Math.max(6, Number(field.fontSize) || 12);
  const width = Math.max(24 / scale, field.name.length * size * 0.55);
  const x = field.x + dx;
  const y = field.y + dy;
  return { x0: x, x1: x + width, y0: y - size * 0.2, y1: y + size };
}

/** The field of a page under a point (PDF points), at its proposed place; the last one wins. */
export function hitAdjustField(
  fields: readonly AdjustField[],
  page: number,
  point: { x: number; y: number },
  scale: number,
  original = false,
): AdjustField | null {
  let hit: AdjustField | null = null;
  for (const field of fields) {
    if (field.page !== page) {
      continue;
    }
    const { dx, dy } = original ? { dx: 0, dy: 0 } : effectiveShift(field);
    const box = fieldBox(field, dx, dy, scale);
    if (point.x >= box.x0 && point.x <= box.x1 && point.y >= box.y0 && point.y <= box.y1) {
      hit = field;
    }
  }
  return hit;
}

/** «→ 24 pt · ↓ 32 pt» (PDF y grows upwards, so a negative dy goes down). */
export function formatShift(dx: number, dy: number): string {
  const round = (value: number) => Math.round(Math.abs(value));
  const horizontal = round(dx) === 0 ? '' : `${dx > 0 ? '→' : '←'} ${round(dx)} pt`;
  const vertical = round(dy) === 0 ? '' : `${dy > 0 ? '↑' : '↓'} ${round(dy)} pt`;
  return [horizontal, vertical].filter(Boolean).join(' · ') || '0 pt';
}

/** How a field is drawn on B: moved by the proposal, estimated, low and left, or left where it was. */
export type AdjustVisual = 'proposal' | 'estimated' | 'manual' | 'low' | 'grey';

export function fieldVisual(field: AdjustField): AdjustVisual {
  if (isFieldMoved(field)) {
    if (field.manual) {
      return 'manual';
    }
    return field.shift?.confidence === 'estimated' ? 'estimated' : 'proposal';
  }
  return field.shift?.confidence === 'low' && field.override === null ? 'low' : 'grey';
}
