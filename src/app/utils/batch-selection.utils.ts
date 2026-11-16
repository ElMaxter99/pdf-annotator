/** Pure rules for the multiple selection of the batch panel. */
import type { BatchItem } from '../models/batch.model';
import { isEligibleForAiBatch } from './ai-batch.utils';

/** Ids between `anchor` and `target` (both included) in the order the person sees them. */
export function rangeBetween(
  visible: readonly string[],
  anchor: string | null,
  target: string,
): string[] {
  const to = visible.indexOf(target);
  if (to < 0) {
    return [];
  }
  const from = anchor === null ? -1 : visible.indexOf(anchor);
  if (from < 0) {
    return [target];
  }
  return visible.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Keeps only the ids that are still visible; returns the same set when nothing changes. */
export function pruneSelection(
  selected: ReadonlySet<string>,
  visible: readonly string[],
): ReadonlySet<string> {
  const keep = new Set(visible);
  const next = new Set([...selected].filter((id) => keep.has(id)));
  return next.size === selected.size ? selected : next;
}

export interface BulkPlan {
  /** Marked PDFs. */
  total: number;
  /** Can go to «Trasladar con IA»: B, fields in A and not «Listo». */
  ai: number;
  /** Can be downloaded: validated and with a B template. */
  download: number;
  /** Can be marked «Listo»: not validated yet and with a template. */
  ready: number;
}

export function planBulk(
  items: readonly BatchItem[],
  hasNoTemplate: (item: BatchItem) => boolean,
): BulkPlan {
  return {
    total: items.length,
    ai: items.filter(isEligibleForAiBatch).length,
    download: items.filter((item) => item.status === 'ready' && !!item.bJson).length,
    ready: items.filter((item) => item.status !== 'ready' && !hasNoTemplate(item)).length,
  };
}
