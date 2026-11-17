/** Rules for the page shared by A and B while the editor compares two versions (P-74 a P-77). */

/** Last page reachable when A and B move together: the longer of the two. */
export function linkedPageTotal(pagesA: number, pagesB: number): number {
  return Math.max(pagesA, pagesB, 1);
}

/** Keeps a page number inside 1…total (rounded). */
export function clampPageNumber(page: number, total: number): number {
  const safeTotal = Math.max(1, Math.floor(total) || 1);
  const rounded = Math.round(Number.isFinite(page) ? page : 1);
  return Math.min(safeTotal, Math.max(1, rounded));
}

/** Page of B shown for a linked position, or `null` when B has no such page. */
export function pageOfVersion(linkedPage: number, pages: number): number | null {
  return linkedPage >= 1 && linkedPage <= pages ? linkedPage : null;
}

/** Page of B the editor really holds while the linked position runs past the end of B. */
export function holdPageOfB(linkedPage: number, pagesB: number): number {
  return Math.max(1, Math.min(linkedPage, pagesB));
}

/** Text of the page chip when A and B are not on the same page (`null` when they are). */
export function pageOffsetLabel(pageA: number | null, pageB: number): string | null {
  if (pageA === pageB) return null;
  return pageA === null ? null : `A ${pageA} · B ${pageB}`;
}
