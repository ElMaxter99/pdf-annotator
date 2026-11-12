import type { PageAnnotations } from '../models/annotation.model';
import type { BatchItem } from '../models/batch.model';

/** Query parameter that names the batch PDF open in the workspace (`/workspace?lote=<id>`). */
export const BATCH_ITEM_PARAM = 'lote';

/** Page and zoom a batch PDF opens with. */
export const BATCH_OPEN_VIEW = { pageIndex: 1, scale: 0.75 } as const;

/**
 * What the editor opens for a batch PDF: B when it has a new version (with its own annotations,
 * `null` until first saved), otherwise A with its template.
 */
export function batchItemOpening(
  item: Pick<BatchItem, 'name' | 'aPdf' | 'aPages' | 'bPdf' | 'bName' | 'bPages'>,
): { file: File; coords: PageAnnotations[] | null } {
  const file = new File([item.bPdf ?? item.aPdf], item.bName ?? item.name, {
    type: 'application/pdf',
  });
  return { file, coords: item.bPages ?? (item.bPdf ? null : item.aPages) };
}
