import type { PageAnnotations, PageField } from '../../models/annotation.model';
import { clampGroupDrag, exceedsDragThreshold } from '../../utils/group-drag.utils';
import type { OverlayGuide, SnapBounds } from '../../utils/guides.utils';

type OverlayRect = { left: number; top: number; width: number; height: number };

/** What the drag needs from the page: the DOM of the viewer and the actions it triggers. */
export interface AnnotationDragHost {
  layer(): HTMLElement | undefined;
  canvas(): HTMLCanvasElement | undefined;
  scale(): number;
  guidesEnabled(): boolean;
  refreshOverlay(rect: OverlayRect | null, guides: OverlayGuide[]): void;
  applySnapping(
    left: number,
    top: number,
    bounds: SnapBounds,
    el: HTMLDivElement,
    canvas: HTMLCanvasElement,
    fontSizePx: number,
  ): { left: number; top: number; guides: OverlayGuide[] };
  coords(): PageAnnotations[];
  /** Field with its style normalized (so a `locked` flag from the style is honoured). */
  styled(field: PageField): PageField;
  selection(): { pageIndex: number; fields: readonly number[] } | null;
  clearSelection(): void;
  toggleSelection(pageIndex: number, fieldIndex: number): void;
  startEditing(pageIndex: number, fieldIndex: number, field: PageField): void;
  /** A plain click on a member of the group: back to a normal click on that annotation. */
  clickOnGroupMember(pageIndex: number, fieldIndex: number): void;
  moveSelection(dxPdf: number, dyPdf: number): void;
  /** Commits the new position, in points PDF, of one annotation (goes through the history). */
  setFieldPosition(pageIndex: number, fieldIndex: number, x: number, y: number): void;
  redrawAllForPage(): void;
}

/** Horizontal limits of an annotation of `width` px inside a canvas of `canvasWidth` px. */
export function horizontalBounds(
  width: number,
  canvasWidth: number,
): { minLeft: number; maxLeft: number } {
  const max = Math.max(canvasWidth - Math.max(width, 0), 0);
  return { minLeft: 0, maxLeft: max };
}

/**
 * Dragging of annotations in the viewer (one annotation, or the whole selection). It is tied to
 * the DOM nodes of the annotations layer, so it keeps its own state and only talks to the page
 * through `AnnotationDragHost`.
 */
export class AnnotationDragController {
  private dragInfo: {
    pageIndex: number;
    fieldIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    fontSize: number;
    width: number;
    moved: boolean;
  } | null = null;
  private draggingElement: HTMLDivElement | null = null;
  private groupDrag: {
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    dx: number;
    dy: number;
    items: {
      el: HTMLElement;
      startLeft: number;
      startTop: number;
      width: number;
      fontPx: number;
    }[];
  } | null = null;

  constructor(private readonly host: AnnotationDragHost) {}

  /** A locked annotation cannot be dragged: pressing it just opens its editor. */
  pointerDownLocked(evt: PointerEvent, pageIndex: number, fieldIndex: number): void {
    evt.preventDefault();
    evt.stopPropagation();
    const field = this.host.coords()[pageIndex]?.fields[fieldIndex];
    if (!field) {
      return;
    }
    this.host.startEditing(pageIndex, fieldIndex, field);
  }

  pointerDown(
    evt: PointerEvent,
    pageIndex: number,
    fieldIndex: number,
    target?: HTMLElement | null,
  ): void {
    evt.preventDefault();
    evt.stopPropagation();
    const el = (target ?? evt.currentTarget) as HTMLDivElement | null;
    if (!el) return;

    const computedFontSize = parseFloat(getComputedStyle(el).fontSize || '0');
    const field = this.host.coords()[pageIndex]?.fields[fieldIndex];
    if (!field || field.locked) {
      return;
    }
    if (this.host.styled(field)?.locked) {
      this.pointerDownLocked(evt, pageIndex, fieldIndex);
      return;
    }

    if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
      this.host.toggleSelection(pageIndex, fieldIndex);
      return;
    }

    const selected = this.host.selection();
    if (
      selected &&
      selected.pageIndex === pageIndex &&
      selected.fields.length > 1 &&
      selected.fields.includes(fieldIndex)
    ) {
      this.startGroupDrag(evt, el, selected.fields);
      return;
    }
    if (selected) {
      this.host.clearSelection();
    }

    this.dragInfo = {
      pageIndex,
      fieldIndex,
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      startLeft: parseFloat(el.style.left || '0'),
      startTop: parseFloat(el.style.top || '0'),
      fontSize: computedFontSize,
      width: el.offsetWidth,
      moved: false,
    };

    this.draggingElement = el;
    el.setPointerCapture(evt.pointerId);
    el.classList.add('dragging');
    el.onpointermove = this.handleAnnotationPointerMove;
    el.onpointerup = this.handleAnnotationPointerUp;
    el.onpointercancel = this.handleAnnotationPointerUp;

    if (this.host.guidesEnabled()) {
      this.host.refreshOverlay(
        {
          left: parseFloat(el.style.left || '0'),
          top: parseFloat(el.style.top || '0'),
          width: el.offsetWidth,
          height: el.offsetHeight,
        },
        [],
      );
    } else {
      this.host.refreshOverlay(null, []);
    }
  }

  private startGroupDrag(evt: PointerEvent, pressed: HTMLElement, fields: readonly number[]) {
    const layer = this.host.layer();
    if (!layer) {
      return;
    }
    const items = fields
      .map((index) => layer.querySelector<HTMLElement>(`[data-field-index="${index}"]`))
      .filter((el): el is HTMLElement => !!el)
      .map((el) => ({
        el,
        startLeft: parseFloat(el.style.left || '0'),
        startTop: parseFloat(el.style.top || '0'),
        width: el.offsetWidth,
        fontPx: parseFloat(getComputedStyle(el).fontSize || '0'),
      }));

    this.groupDrag = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      moved: false,
      dx: 0,
      dy: 0,
      items,
    };
    pressed.setPointerCapture(evt.pointerId);
    pressed.onpointermove = this.handleGroupPointerMove;
    pressed.onpointerup = this.handleGroupPointerUp;
    pressed.onpointercancel = this.handleGroupPointerUp;
  }

  private handleGroupPointerMove = (evt: PointerEvent) => {
    const drag = this.groupDrag;
    const pdfCanvas = this.host.canvas();
    if (!drag || !pdfCanvas || evt.pointerId !== drag.pointerId) {
      return;
    }
    evt.preventDefault();
    const rawDx = evt.clientX - drag.startX;
    const rawDy = evt.clientY - drag.startY;
    if (!drag.moved && !exceedsDragThreshold(rawDx, rawDy)) {
      return;
    }
    drag.moved = true;

    const { dx, dy } = clampGroupDrag(drag.items, pdfCanvas.width, pdfCanvas.height, rawDx, rawDy);
    drag.dx = dx;
    drag.dy = dy;

    for (const item of drag.items) {
      item.el.style.left = `${item.startLeft + drag.dx}px`;
      item.el.style.top = `${item.startTop + drag.dy}px`;
    }
  };

  private handleGroupPointerUp = (evt: PointerEvent) => {
    const drag = this.groupDrag;
    if (!drag || evt.pointerId !== drag.pointerId) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    const pressed = evt.currentTarget as HTMLElement | null;
    pressed?.releasePointerCapture?.(evt.pointerId);
    if (pressed) {
      pressed.onpointermove = null;
      pressed.onpointerup = null;
      pressed.onpointercancel = null;
    }
    this.groupDrag = null;

    if (drag.moved && evt.type !== 'pointercancel') {
      const scale = this.host.scale();
      this.host.moveSelection(drag.dx / scale, -drag.dy / scale);
    } else {
      this.host.redrawAllForPage();
      if (evt.type !== 'pointercancel') {
        this.host.clickOnGroupMember(
          Number(pressed?.dataset['pageIndex']),
          Number(pressed?.dataset['fieldIndex']),
        );
      }
    }
  };

  private handleAnnotationPointerMove = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    const pdfCanvas = this.host.canvas();
    if (!el || !pdfCanvas) return;

    evt.preventDefault();
    const dx = evt.clientX - this.dragInfo.startX;
    const dy = evt.clientY - this.dragInfo.startY;
    const shouldMove = this.dragInfo.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (!shouldMove) return;

    this.dragInfo.moved = true;

    const tentativeLeft = this.dragInfo.startLeft + dx;
    const tentativeTop = this.dragInfo.startTop + dy;

    const minTop = -this.dragInfo.fontSize;
    const maxTop = pdfCanvas.height - this.dragInfo.fontSize;
    const elementWidth = this.dragInfo.width || el.offsetWidth;
    const bounds = horizontalBounds(elementWidth, pdfCanvas.width);
    const clampedLeft = Math.min(Math.max(tentativeLeft, bounds.minLeft), bounds.maxLeft);
    const clampedTop = Math.min(Math.max(tentativeTop, minTop), maxTop);

    this.dragInfo.width = el.offsetWidth;

    if (!this.host.guidesEnabled()) {
      el.style.left = `${clampedLeft}px`;
      el.style.top = `${clampedTop}px`;
      this.host.refreshOverlay(null, []);
      return;
    }

    const snapResult = this.host.applySnapping(
      clampedLeft,
      clampedTop,
      { minLeft: bounds.minLeft, maxLeft: bounds.maxLeft, minTop, maxTop },
      el,
      pdfCanvas,
      this.dragInfo.fontSize,
    );

    el.style.left = `${snapResult.left}px`;
    el.style.top = `${snapResult.top}px`;

    this.host.refreshOverlay(
      {
        left: snapResult.left,
        top: snapResult.top,
        width: el.offsetWidth,
        height: el.offsetHeight,
      },
      snapResult.guides,
    );
  };

  private handleAnnotationPointerUp = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    if (!el) {
      this.dragInfo = null;
      this.host.refreshOverlay(null, []);
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    el.releasePointerCapture(evt.pointerId);
    el.classList.remove('dragging');
    el.onpointermove = null;
    el.onpointerup = null;
    el.onpointercancel = null;

    const drag = this.dragInfo;
    this.dragInfo = null;
    this.draggingElement = null;

    this.host.refreshOverlay(null, []);

    if (drag.moved) {
      this.commitPosition(
        drag.pageIndex,
        drag.fieldIndex,
        parseFloat(el.style.left || '0'),
        parseFloat(el.style.top || '0'),
        drag.fontSize,
        drag.width || el.offsetWidth,
      );
    } else if (evt.type !== 'pointercancel') {
      const field = this.host.coords()[drag.pageIndex]?.fields[drag.fieldIndex];
      if (field) {
        this.host.startEditing(drag.pageIndex, drag.fieldIndex, field);
      }
    }
  };

  private commitPosition(
    pageIndex: number,
    fieldIndex: number,
    leftPx: number,
    topPx: number,
    fontSizePx: number,
    widthPx: number,
  ) {
    const pdfCanvas = this.host.canvas();
    if (!pdfCanvas) return;
    const scale = this.host.scale();
    const field = this.host.coords()[pageIndex]?.fields[fieldIndex];
    if (!field || field.locked) {
      return;
    }
    const bounds = horizontalBounds(widthPx, pdfCanvas.width);
    const boundedLeft = Math.min(Math.max(leftPx, bounds.minLeft), bounds.maxLeft);
    const boundedTop = Math.min(Math.max(topPx, -fontSizePx), pdfCanvas.height - fontSizePx);
    const newX = +(boundedLeft / scale).toFixed(2);
    const newY = +((pdfCanvas.height - (boundedTop + fontSizePx)) / scale).toFixed(2);
    this.host.setFieldPosition(pageIndex, fieldIndex, newX, newY);
    this.host.redrawAllForPage();
  }
}
