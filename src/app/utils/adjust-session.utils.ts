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
