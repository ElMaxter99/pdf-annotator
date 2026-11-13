/** «Resuelto sin IA»: the text-based adjustment as a first pass for a whole pair, before spending a request. */
import type { PageAnnotations } from '../models/annotation.model';
import type { AiRow } from './ai-proposal.utils';
import { MIN_RELIABLE_ANCHORS, findAnchors, median, proposeShifts, type PageTextItem } from './text-anchors.utils';

export interface CascadePdf {
  /** Texts per page (index 0 = page 1) with their position in PDF points. */
  readonly texts: ReadonlyArray<readonly PageTextItem[]>;
  /** Width and height per page, rounded to points. */
  readonly sizes: ReadonlyArray<{ readonly w: number; readonly h: number }>;
}

export interface CascadeResult {
  readonly rows: AiRow[];
  /** Every field has a high-confidence position: the AI is not needed for this pair. */
  readonly solved: boolean;
  /** Why it was not solved (for the details), `null` when it was. */
  readonly why: 'sizes' | 'pages' | 'noText' | 'notUniform' | 'lowConfidence' | null;
}

const SIZE_TOLERANCE = 1;
/** Anchors of a page may differ this much (points) from the typical shift for the layout to count as «just moved». */
const UNIFORM_TOLERANCE = 2;
const CONFIDENCE: Record<string, number> = { high: 0.9, medium: 0.75, low: 0.5, estimated: 0.5 };

/** Same page count and size: the shift measured by the texts is then a plain translation. */
function comparable(a: CascadePdf, b: CascadePdf): 'sizes' | 'pages' | null {
  if (a.texts.length !== b.texts.length) {
    return 'pages';
  }
  const same = a.sizes.every(
    (size, i) =>
      Math.abs(size.w - (b.sizes[i]?.w ?? -1)) <= SIZE_TOLERANCE &&
      Math.abs(size.h - (b.sizes[i]?.h ?? -1)) <= SIZE_TOLERANCE,
  );
  return same ? null : 'sizes';
}

/**
 * Proposes the new position of every field of A from the texts both versions share. A pair is only
 * solved when each page with fields has enough anchors that all agree on the same shift (the layout
 * moved as a whole) and every field got a position; anything else goes to the AI.
 * Row ids follow the same `p<page>-f<position>` convention as the AI answer.
 */
export function cascadeAdjust(template: readonly PageAnnotations[], a: CascadePdf, b: CascadePdf): CascadeResult {
  const incompatible = comparable(a, b);
  if (incompatible) {
    return { rows: [], solved: false, why: incompatible };
  }
  const rows: AiRow[] = [];
  let sawText = false;
  let uniform = true;
  let covered = true;
  for (const page of template) {
    const aItems = a.texts[page.num - 1] ?? [];
    const bItems = b.texts[page.num - 1] ?? [];
    if (aItems.length && bItems.length) {
      sawText = true;
    }
    const report = findAnchors(aItems, bItems);
    const used = report.anchors.filter((x) => !report.defaultOff.has(x.id));
    const active = new Set(used.map((x) => x.id));
    if (page.fields.length > 0) {
      const mx = median(used.map((x) => x.dx));
      const my = median(used.map((x) => x.dy));
      const agree = used.every((x) => Math.abs(x.dx - mx) <= UNIFORM_TOLERANCE && Math.abs(x.dy - my) <= UNIFORM_TOLERANCE);
      if (used.length < MIN_RELIABLE_ANCHORS || !agree) {
        uniform = false;
      }
    }
    const shifts = proposeShifts(page.fields, report.anchors, active, 'near');
    page.fields.forEach((field, i) => {
      const shift = shifts[i];
      if (!shift) {
        covered = false;
      }
      rows.push({
        id: `p${page.num}-f${i + 1}`,
        page: page.num,
        index: i,
        ok: !!shift,
        newPage: page.num,
        x: shift ? field.x + shift.dx : 0,
        y: shift ? field.y + shift.dy : 0,
        confidence: shift ? CONFIDENCE[shift.confidence] : 0,
        reason: shift ? 'adjust' : '',
        anchorA: '',
        anchorB: '',
      });
    });
  }
  if (!sawText) {
    return { rows, solved: false, why: 'noText' };
  }
  if (!uniform) {
    return { rows, solved: false, why: 'notUniform' };
  }
  return { rows, solved: covered && rows.length > 0, why: covered ? null : 'lowConfidence' };
}
