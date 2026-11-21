import { ensureFieldStyle, prepareFieldForStorage } from '../../utils/field-style.utils';
import { PageField } from '../../models/annotation.model';
import { addFieldToPages } from '../../utils/annotation-pages.utils';
import {
  AlignMode,
  alignBoxes,
  DistributeAxis,
  distributeBoxes,
} from '../../utils/alignment.utils';
import { offsetFieldCopy } from '../../utils/paste-offset.utils';
import { moveFieldWithinPage } from '../../utils/field-move.utils';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * Selección múltiple: seleccionar, recuadro (lasso), mover, alinear, distribuir, copiar, pegar y borrar en grupo (un paso de historial).
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
export class WorkspaceSelection {
  isSelected(this: WorkspacePageComponent, pageIndex: number, fieldIndex: number): boolean {
    const selected = this.selection();
    return !!selected && selected.pageIndex === pageIndex && selected.fields.includes(fieldIndex);
  }

  /** Drops the selection and repaints (call before changing what is shown). */
  clearSelection(this: WorkspacePageComponent): void {
    if (!this.selection()) {
      return;
    }
    this.selection.set(null);
    this.redrawAllForPage();
  }

  toggleSelection(this: WorkspacePageComponent, pageIndex: number, fieldIndex: number): void {
    this.dismissEditors();
    // Pressing on an annotation does not move focus, so leave any text field the user was in;
    // otherwise Delete/arrow/Ctrl+C would keep going to that field instead of the selection.
    this.releaseButtonFocus();
    const selected = this.selection();
    const current = selected && selected.pageIndex === pageIndex ? selected.fields : [];
    const next = current.includes(fieldIndex)
      ? current.filter((index) => index !== fieldIndex)
      : [...current, fieldIndex].sort((a, b) => a - b);
    this.selection.set(next.length ? { pageIndex, fields: next } : null);
    this.redrawAllForPage();
  }

  selectAllOnPage(this: WorkspacePageComponent): void {
    const pageIndex = this.coords().findIndex((page) => page.num === this.pageIndex());
    if (pageIndex < 0) {
      return;
    }
    const fields = this.coords()
      [pageIndex].fields.map((field, index) => ({ field, index }))
      .filter(({ field }) => !field.locked)
      .map(({ index }) => index);
    this.dismissEditors();
    this.selection.set(fields.length ? { pageIndex, fields } : null);
    this.redrawAllForPage();
  }

  /** Aligns the selected annotations (needs at least two) as a single undo step. */
  alignSelection(this: WorkspacePageComponent, mode: AlignMode): void {
    const selected = this.selection();
    const scale = this.scale();
    if (!selected || selected.fields.length < 2 || !scale) {
      return;
    }

    const positions = alignBoxes(this.selectionBoxes(), mode);
    this.updateSelectedFields((field, order) => ({ ...field, ...positions[order] }));
    this.releaseButtonFocus();
  }

  /** Spaces the selected annotations evenly between the outermost ones (needs three or more). */
  distributeSelection(this: WorkspacePageComponent, axis: DistributeAxis): void {
    const selected = this.selection();
    if (!selected || selected.fields.length < 3 || !this.scale()) {
      return;
    }
    const positions = distributeBoxes(this.selectionBoxes(), axis);
    this.updateSelectedFields((field, order) => ({ ...field, ...positions[order] }));
    this.releaseButtonFocus();
  }

  /** Selected annotations as boxes in PDF points (width from the rendered element). */
  selectionBoxes(this: WorkspacePageComponent) {
    const selected = this.selection()!;
    const scale = this.scale();
    const page = this.coords()[selected.pageIndex];
    return selected.fields.map((index) => {
      const field = this.ensureFieldStyle(page.fields[index]);
      return {
        x: field.x,
        y: field.y,
        width: this.annotationWidthPx(selected.pageIndex, index, field) / scale,
        height: field.fontSize,
      };
    });
  }

  onHitboxPointerDown(this: WorkspacePageComponent, evt: PointerEvent): void {
    if (evt.button !== 0 || !this.pdfDoc() || this.editing()) {
      return;
    }
    const target = evt.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.lassoDrag = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      active: false,
      additive: evt.shiftKey || evt.ctrlKey || evt.metaKey,
    };
    target.setPointerCapture?.(evt.pointerId);
  }

  onHitboxPointerMove(this: WorkspacePageComponent, evt: PointerEvent): void {
    const drag = this.lassoDrag;
    if (!drag || evt.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.active) {
      if (Math.hypot(evt.clientX - drag.startX, evt.clientY - drag.startY) <= 4) {
        return;
      }
      drag.active = true;
      this.dismissEditors();
    }
    evt.preventDefault();
    this.lasso.set({
      left: Math.min(drag.startX, evt.clientX) - drag.originLeft,
      top: Math.min(drag.startY, evt.clientY) - drag.originTop,
      width: Math.abs(evt.clientX - drag.startX),
      height: Math.abs(evt.clientY - drag.startY),
    });
  }

  onHitboxPointerUp(this: WorkspacePageComponent, evt: PointerEvent): void {
    const drag = this.lassoDrag;
    if (!drag || evt.pointerId !== drag.pointerId) {
      return;
    }
    this.lassoDrag = null;
    (evt.currentTarget as HTMLElement).releasePointerCapture?.(evt.pointerId);
    this.lasso.set(null);
    if (!drag.active || evt.type === 'pointercancel') {
      return;
    }

    // The click that follows a drag must not create an annotation.
    this.suppressHitboxClick = true;
    setTimeout(() => (this.suppressHitboxClick = false), 0);

    const x1 = Math.min(drag.startX, evt.clientX);
    const x2 = Math.max(drag.startX, evt.clientX);
    const y1 = Math.min(drag.startY, evt.clientY);
    const y2 = Math.max(drag.startY, evt.clientY);
    const layer = this.annotationsLayerRef?.nativeElement;
    const hit = Array.from(layer?.querySelectorAll<HTMLElement>('.annotation') ?? [])
      .filter((el) => el.dataset['locked'] !== 'true')
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right >= x1 && r.left <= x2 && r.bottom >= y1 && r.top <= y2;
      })
      .map((el) => ({
        pageIndex: Number(el.dataset['pageIndex']),
        field: Number(el.dataset['fieldIndex']),
      }));

    const previous = this.selection();
    const pageIndex = hit[0]?.pageIndex ?? previous?.pageIndex ?? 0;
    const base = drag.additive && previous?.pageIndex === pageIndex ? previous.fields : [];
    const fields = Array.from(new Set([...base, ...hit.map((h) => h.field)])).sort((a, b) => a - b);
    this.selection.set(fields.length ? { pageIndex, fields } : null);
    this.redrawAllForPage();
  }

  /** Moves the selection by a delta in PDF points (clamped to the page). */
  moveSelection(this: WorkspacePageComponent, dx: number, dy: number, coalesceKey?: string): void {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    const scale = this.scale();
    if (!this.selection() || !pdfCanvas || !scale) {
      return;
    }
    const maxX = pdfCanvas.width / scale;
    const maxY = pdfCanvas.height / scale;
    this.updateSelectedFields(
      (field) => moveFieldWithinPage(field, dx, dy, maxX, maxY),
      coalesceKey,
    );
  }

  deleteSelection(this: WorkspacePageComponent): void {
    const selected = this.selection();
    if (!selected) {
      return;
    }
    const doomed = new Set(selected.fields);
    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) =>
        pages
          .map((page, index) =>
            index === selected.pageIndex
              ? { ...page, fields: page.fields.filter((_, i) => !doomed.has(i)) }
              : page,
          )
          .filter((page) => page.fields.length > 0),
      ),
    );
    this.selection.set(null);
    if (changed) {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
    this.releaseButtonFocus();
  }

  copySelection(this: WorkspacePageComponent): boolean {
    const fields = this.selectedFields();
    if (!fields.length) {
      return false;
    }
    this.selectionClipboard = fields.map((field) => ({ ...this.prepareFieldForStorage(field) }));
    return true;
  }

  pasteSelection(this: WorkspacePageComponent): boolean {
    return this.insertCopies(this.selectionClipboard);
  }

  duplicateSelection(this: WorkspacePageComponent): void {
    if (this.copySelection()) {
      this.insertCopies(this.selectionClipboard);
    }
    this.releaseButtonFocus();
  }

  /** Adds offset copies on the current page as one undo step and selects them. */
  insertCopies(this: WorkspacePageComponent, fields: readonly PageField[]): boolean {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    const scale = this.scale();
    if (!fields.length || !this.pdfDoc() || !pdfCanvas || !scale) {
      return false;
    }

    const pageNum = this.pageIndex();
    const copies = fields.map((field) =>
      offsetFieldCopy(field, scale, pdfCanvas.width, pdfCanvas.height, -1),
    );

    let firstIndex = 0;
    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) => {
        const existing = pages.find((page) => page.num === pageNum);
        firstIndex = existing ? existing.fields.length : 0;
        return copies.reduce((acc, copy) => addFieldToPages(pageNum, copy, acc), pages);
      }),
    );
    if (!changed) {
      return false;
    }

    const pageIndex = this.coords().findIndex((page) => page.num === pageNum);
    this.dismissEditors();
    this.selection.set({
      pageIndex,
      fields: copies.map((_, i) => firstIndex + i),
    });
    this.syncCoordsTextModel();
    this.redrawAllForPage();
    return true;
  }

  selectedFields(this: WorkspacePageComponent): PageField[] {
    const selected = this.selection();
    if (!selected) {
      return [];
    }
    const page = this.coords()[selected.pageIndex];
    return selected.fields.map((index) => page?.fields[index]).filter((f): f is PageField => !!f);
  }

  /** Applies `update` to every selected field in a single history step. */
  updateSelectedFields(
    this: WorkspacePageComponent,
    update: (field: PageField, order: number) => PageField,
    coalesceKey?: string,
  ): void {
    const selected = this.selection();
    if (!selected) {
      return;
    }
    const order = new Map(selected.fields.map((index, position) => [index, position]));
    const changed = this.applyCoordsChange(
      () =>
        this.coords.update((pages) =>
          pages.map((page, pageIdx) =>
            pageIdx !== selected.pageIndex
              ? page
              : {
                  ...page,
                  fields: page.fields.map((field, fieldIdx) =>
                    order.has(fieldIdx) ? update(field, order.get(fieldIdx)!) : field,
                  ),
                },
          ),
        ),
      coalesceKey ? { coalesceKey } : undefined,
    );
    if (changed) {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
  }

  /** Rendered width of an annotation in px (falls back to a rough estimate before first paint). */
  annotationWidthPx(
    this: WorkspacePageComponent,
    pageIndex: number,
    fieldIndex: number,
    field: PageField,
  ): number {
    const el = this.annotationsLayerRef?.nativeElement.querySelector<HTMLElement>(
      `[data-page-index="${pageIndex}"][data-field-index="${fieldIndex}"]`,
    );
    if (el && el.offsetWidth > 0) {
      return el.offsetWidth;
    }
    return this.getFieldRenderValue(field).length * field.fontSize * 0.5 * this.scale();
  }

  releaseButtonFocus(this: WorkspacePageComponent): void {
    (this.document?.activeElement as HTMLElement | null)?.blur?.();
  }

  /** Commits the new position (points PDF) of one dragged annotation, through the history. */
  setFieldPosition(
    this: WorkspacePageComponent,
    pageIndex: number,
    fieldIndex: number,
    x: number,
    y: number,
  ) {
    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) =>
        pages.map((page, idx) => {
          if (idx !== pageIndex || fieldIndex < 0 || fieldIndex >= page.fields.length) {
            return page;
          }
          const updatedFields = page.fields.map((currentField, fIdx) =>
            fIdx === fieldIndex ? this.ensureFieldStyle({ ...currentField, x, y }) : currentField,
          );
          return { ...page, fields: updatedFields };
        }),
      ),
    );
    if (changed) {
      this.syncCoordsTextModel();
    }
  }
}
