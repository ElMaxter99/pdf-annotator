import { isEditableElement } from '../../utils/json-text.utils';
import {
  centerScrollLeft,
  clampScale,
  doubleClickZoomTarget,
  fitPageScale,
  fitPageScaleForOverflow,
  fitWidthScale,
  homeScrollLeft,
  isDoubleClick,
  panScrollPosition,
  stepScale,
  wheelZoomFactor,
  workMarginFor,
  zoomAnchorScrollDelta,
  zoomLimitFor,
  type ViewerClick,
  type ZoomLimit,
} from '../../utils/zoom.utils';
import { initialWheelPageState, wheelEdgeStep } from '../../utils/wheel-page.utils';
import { clampPageNumber, holdPageOfB, linkedPageTotal } from '../../utils/page-link.utils';
import { REFERENCE_MODE_KEY, WHEEL_PAGING_KEY, WheelEdgeIndicator } from './workspace.types';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * Vista del visor: modos de referencia y «Dividida», páginas de A y B, zoom, rueda, mover el lienzo, espacio de trabajo ampliado y ajustar a página o ancho.
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
export class WorkspaceView {
  storedReferenceMode(this: WorkspacePageComponent): 'overlay' | 'toggle' | 'split' {
    try {
      const value =
        typeof localStorage !== 'undefined' ? localStorage.getItem(REFERENCE_MODE_KEY) : null;
      return value === 'toggle' || value === 'split' ? value : 'overlay';
    } catch {
      return 'overlay';
    }
  }

  /** Changes how A is shown. «Dividida» also fits both pages in the viewer. */
  async setReferenceMode(
    this: WorkspacePageComponent,
    mode: 'overlay' | 'toggle' | 'split',
  ): Promise<void> {
    this.referenceMode.set(mode);
    if (mode !== 'split') {
      this.splitLinked.set(true);
    }
    try {
      localStorage.setItem(REFERENCE_MODE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
    if (mode === 'split') {
      await this.fitSplit();
    } else if (this.scaleBeforeSplit !== null) {
      this.scale.set(this.scaleBeforeSplit);
      this.scaleBeforeSplit = null;
      await this.render();
      this.redrawAllForPage();
    }
    this.resetViewerScroll();
  }

  /** True while «Dividida» is active and A has its own zoom and scroll (P-61). */
  unlinkedSplit(this: WorkspacePageComponent): boolean {
    return this.splitActive() && !this.splitLinked();
  }

  /** Scale used to draw A: its own while unlinked, otherwise B's. */
  scaleOfA(this: WorkspacePageComponent): number {
    return this.unlinkedSplit() ? this.scaleA() : this.scale();
  }

  splitAPane(this: WorkspacePageComponent): HTMLElement | null {
    return (
      (this.splitLayerRef?.nativeElement.closest(
        '.canvas-container--split-a',
      ) as HTMLElement | null) ?? null
    );
  }

  isOverSplitA(this: WorkspacePageComponent, evt: { clientX: number; clientY: number }): boolean {
    const pane = this.splitAPane();
    if (!pane) return false;
    const r = pane.getBoundingClientRect();
    return (
      evt.clientX >= r.left &&
      evt.clientX <= r.right &&
      evt.clientY >= r.top &&
      evt.clientY <= r.bottom
    );
  }

  /** Chip «Enlazado / Desenlazado»: A and B stop (or start again) sharing zoom and scroll. */
  async toggleSplitLink(this: WorkspacePageComponent): Promise<void> {
    if (!this.splitActive()) return;
    if (this.splitLinked()) {
      this.scaleA.set(this.scale());
      this.splitLinked.set(false);
      this.updateSplitHeight();
      this.toast.show(
        this.translationService.translate('batch.editor.split.unlinkedToast'),
        'info',
        4000,
      );
    } else {
      const pane = this.splitAPane();
      const before = {
        scale: this.scaleA(),
        left: pane?.scrollLeft ?? 0,
        top: pane?.scrollTop ?? 0,
      };
      this.splitLinked.set(true);
      if (pane) {
        pane.scrollLeft = 0;
        pane.scrollTop = 0;
      }
      this.toast.show(
        this.translationService.translate('batch.editor.split.linkedToast', {
          percent: Math.round(this.scale() * 100),
        }),
        'info',
        4000,
        false,
        {
          label: this.translationService.translate('controls.undo'),
          run: () => void this.undoSplitLink(before),
        },
      );
    }
    await this.renderSplit();
    this.resetViewerScroll();
  }

  /** «Deshacer» of the relink notice: A goes back to its own zoom and position. */
  async undoSplitLink(
    this: WorkspacePageComponent,
    before: { scale: number; left: number; top: number },
  ): Promise<void> {
    if (!this.splitActive() || !this.splitLinked()) return;
    this.scaleA.set(before.scale);
    this.splitLinked.set(false);
    this.updateSplitHeight();
    await this.renderSplit();
    // Espera a que el panel A termine de crecer (su margen propio, C1) para que la posición no se recorte.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const pane = this.splitAPane();
    if (pane) {
      pane.scrollLeft = before.left;
      pane.scrollTop = before.top;
      this.aHomeLeft = Number.NaN;
    }
  }

  /** Zoom of A alone (unlinked «Dividida»), keeping the point under the cursor. */
  async zoomSplitA(
    this: WorkspacePageComponent,
    requested: number,
    anchor: { clientX: number; clientY: number } | null,
  ) {
    const pane = this.splitAPane();
    const canvas = this.splitCanvasRef?.nativeElement;
    const next = clampScale(requested);
    this.showZoomHud(next, zoomLimitFor(requested), 'A');
    const previous = this.scaleA();
    if (next === previous || !pane || !canvas) return;
    const before = canvas.getBoundingClientRect();
    const atHome = Math.abs(pane.scrollTop - this.aHomeTop) <= 2;
    this.scaleA.set(next);
    await this.renderSplit();
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (anchor) {
      const after = canvas.getBoundingClientRect();
      const ux = (anchor.clientX - before.left) / previous;
      const uy = (anchor.clientY - before.top) / previous;
      pane.scrollLeft += after.left + ux * next - anchor.clientX;
      pane.scrollTop += after.top + uy * next - anchor.clientY;
      if (atHome) pane.scrollTop = Math.max(pane.scrollTop, this.aHomeTop);
    }
  }

  /** Zoom so that two pages fit side by side in the viewer. */
  async fitSplit(this: WorkspacePageComponent): Promise<void> {
    const viewer = this.pdfViewerRef?.nativeElement.closest('.viewer') as HTMLElement | null;
    if (!viewer || !this.pdfDoc()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve));
    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const baseWidth = page.getViewport({ scale: 1 }).width;
    const style = getComputedStyle(viewer);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = (viewer.clientWidth - padding - 24) / 2;
    if (!(baseWidth > 0) || !(available > 0)) {
      return;
    }
    if (this.scaleBeforeSplit === null) {
      this.scaleBeforeSplit = this.scale();
    }
    this.scale.set(Math.min(4, Math.max(0.25, Math.floor((available / baseWidth) * 100) / 100)));
    await this.render();
    this.redrawAllForPage();
    this.resetViewerScroll();
  }

  /** «Dividida»: the field under the pointer (in A or in B) is highlighted in both panes. */
  onSplitHover(this: WorkspacePageComponent, event: MouseEvent): void {
    if (!this.splitActive()) {
      return;
    }
    const aLayer = this.splitLayerRef?.nativeElement;
    const bLayer = this.annotationsLayerRef?.nativeElement;
    if (!aLayer || !bLayer) {
      return;
    }
    const hit = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    };
    let name: string | null = null;
    for (const el of Array.from(aLayer.querySelectorAll<HTMLElement>('.reference-field'))) {
      if (hit(el)) {
        name = el.dataset['name'] ?? null;
        break;
      }
    }
    if (name === null) {
      const fields = this.coords().find((page) => page.num === this.pageIndex())?.fields ?? [];
      for (const el of Array.from(bLayer.querySelectorAll<HTMLElement>('.annotation'))) {
        if (hit(el)) {
          const field = fields[Number(el.dataset['fieldIndex'])];
          name = field ? (field.mapField || field.value || '').trim() : null;
          break;
        }
      }
    }
    this.markPair(name);
    this.hoverPairB(event);
  }

  clearSplitHover(this: WorkspacePageComponent): void {
    this.markPair(null);
  }

  /** Draws A (its PDF and its fields) in the left pane of «Dividida». */
  async renderSplit(this: WorkspacePageComponent): Promise<void> {
    this.updateSplitHeight();
    const token = ++this.splitToken;
    const item = this.batch.activeItem();
    if (!this.splitActive() || !item) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve));
    const canvas = this.splitCanvasRef?.nativeElement;
    const layer = this.splitLayerRef?.nativeElement;
    if (!canvas || !layer || token !== this.splitToken) {
      return;
    }
    try {
      const doc = await this.splitDocOf(item.aPdf);
      const wanted = this.aPage();
      if (wanted === null || wanted > doc.numPages) {
        // A has no page here: an empty pane of the size of B's page (the template draws the text).
        this.splitTask?.cancel();
        const bCanvas = this.pdfCanvasRef?.nativeElement;
        canvas.width = bCanvas?.width || 1;
        canvas.height = bCanvas?.height || 1;
        layer.textContent = '';
        return;
      }
      const pageNumber = wanted;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.scaleOfA() });
      const ctx = canvas.getContext('2d');
      if (!ctx || token !== this.splitToken) {
        return;
      }
      const geometry = this.geometryForA(page);
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      // pdf.js refuses two renders at once on a canvas: the newer one cancels the older.
      this.splitTask?.cancel();
      const task = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: geometry.transform,
      });
      this.splitTask = task;
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer render, which draws the fields
      }
      if (token !== this.splitToken) {
        return;
      }
      layer.textContent = '';
      for (const field of this.fieldsOfA(pageNumber)) {
        this.drawReferenceField(
          layer,
          canvas.height,
          field.name,
          field.x,
          field.y,
          field.fontSize,
          field.missing,
          false,
          this.scaleOfA(),
        );
      }
      this.drawAdjustPins(layer, canvas.height, 'a');
      // A is drawn asynchronously: a hover that started before it finished is applied now.
      this.markAdjustHoverInSplit();
    } catch (error) {
      console.warn('No se pudo dibujar la versión A en la vista dividida.', error);
    }
  }

  /** Back to «Páginas enlazadas» on `page` (a new PDF, a restored session). */
  resetPageLink(this: WorkspacePageComponent, page: number): void {
    this.pagesLinked.set(true);
    this.commonPage.set(page);
    this.freeAPage.set(page);
  }

  /**
   * Goes to a page of the header: with A and B linked it is the shared position (1…max(A, B)),
   * otherwise a page of B.
   */
  async setPageIndex(this: WorkspacePageComponent, pageNumber: number) {
    if (!this.pdfDoc()) {
      return;
    }

    if (this.comparing() && this.pagesLinked()) {
      const target = clampPageNumber(
        pageNumber,
        this.pageMap()
          ? this.pdfDoc()!.numPages
          : linkedPageTotal(this.pageCountA(), this.pdfDoc()!.numPages),
      );
      if (target === this.commonPage() && !(this.pageMap() && target !== this.pageIndex())) {
        return;
      }
      this.commonPage.set(target);
      const held = holdPageOfB(target, this.pdfDoc()!.numPages);
      if (held === this.pageIndex()) {
        // B keeps its page (it may show the empty state): only A changes.
        this.selection.set(null);
        await this.refreshAfterLinkedMove();
        return;
      }
      await this.goToBPage(held);
      return;
    }

    await this.goToBPage(clampPageNumber(pageNumber, this.pdfDoc()!.numPages));
  }

  async refreshAfterLinkedMove(this: WorkspacePageComponent): Promise<void> {
    if (this.unlinkedSplit()) {
      const pane = this.splitAPane();
      if (pane) pane.scrollTop = 0;
      this.resetSplitAScroll();
    }
    this.redrawAllForPage();
  }

  /** A page of A on its own (free pages). Moving A while linked first frees the pages. */
  async setPageIndexA(this: WorkspacePageComponent, pageNumber: number): Promise<void> {
    if (!this.comparing()) {
      return;
    }
    const total = this.pageCountA();
    if (this.pagesLinked()) {
      this.pagesLinked.set(false);
      this.freeAPage.set(clampPageNumber(this.aPage() ?? total, total));
    }
    const target = clampPageNumber(pageNumber, total);
    if (target === this.freeAPage()) {
      return;
    }
    this.freeAPage.set(target);
    this.resetSplitAScroll();
  }

  /** Chip «Páginas enlazadas / libres»: A and B stop (or start again) sharing the page. */
  togglePagesLink(this: WorkspacePageComponent): void {
    if (!this.comparing()) {
      return;
    }
    if (this.pagesLinked()) {
      this.freeAPage.set(clampPageNumber(this.aPage() ?? this.pageCountA(), this.pageCountA()));
      this.pagesLinked.set(false);
      return;
    }
    const before = this.freeAPage();
    this.commonPage.set(this.pageIndex());
    this.pagesLinked.set(true);
    if (before === this.pageIndex()) {
      return;
    }
    this.toast.show(
      this.translationService.translate('batch.editor.pages.linkedToast', {
        page: this.pageIndex(),
      }),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('controls.undo'),
        run: () => {
          if (this.pagesLinked() && this.comparing()) {
            this.freeAPage.set(clampPageNumber(before, this.pageCountA()));
            this.pagesLinked.set(false);
          }
        },
      },
    );
  }

  setPagesLinked(this: WorkspacePageComponent, linked: boolean): void {
    this.pagesMenuOpen.set(false);
    if (linked !== this.pagesLinked()) {
      this.togglePagesLink();
    }
  }

  onPagesMenuFocusOut(this: WorkspacePageComponent, event: FocusEvent): void {
    const holder = event.currentTarget as HTMLElement | null;
    if (!holder?.contains(event.relatedTarget as Node | null)) {
      this.pagesMenuOpen.set(false);
    }
  }

  setPaneFocus(this: WorkspacePageComponent, pane: 'a' | 'b'): void {
    this.paneFocus.set(pane);
  }

  /** ‹ › and PgUp/PgDn: the shared page, or the page of the pane under the pointer when free. */
  async stepPage(this: WorkspacePageComponent, direction: -1 | 1): Promise<void> {
    if (this.comparing() && !this.pagesLinked() && this.splitActive() && this.paneFocus() === 'a') {
      await this.setPageIndexA(this.freeAPage() + direction);
      return;
    }
    await this.setPageIndex(this.pageShown() + direction);
  }

  /** Mayús + ← →: only A moves (the pages become free). */
  async stepPageA(this: WorkspacePageComponent, direction: -1 | 1): Promise<void> {
    if (!this.comparing()) {
      return;
    }
    const current = this.pagesLinked() ? (this.aPage() ?? this.pageCountA()) : this.freeAPage();
    await this.setPageIndexA(current + direction);
  }

  async goToBPage(this: WorkspacePageComponent, clamped: number) {
    if (clamped === this.pageIndex()) {
      return;
    }

    this.selection.set(null);
    this.pageIndex.set(clamped);
    if (!this.comparing() || this.pageMap()) {
      // Without A, or with the table, the shared position is simply B's page.
      this.commonPage.set(clamped);
    }
    await this.render();
    this.redrawAllForPage();
    if (this.unlinkedSplit()) {
      // Each pane goes back to «fit» on the new page; they stay unlinked.
      await this.fitSplit();
      this.scaleA.set(this.scale());
      const pane = this.splitAPane();
      if (pane) pane.scrollTop = 0;
      await this.renderSplit();
      this.resetSplitAScroll();
    }
  }

  async prevPage(this: WorkspacePageComponent) {
    await this.stepPage(-1);
  }

  async nextPage(this: WorkspacePageComponent) {
    await this.stepPage(1);
  }

  async zoomIn(this: WorkspacePageComponent) {
    await this.zoomToScale(stepScale(this.zoomBase(), 1), this.viewerCenter());
  }

  async zoomOut(this: WorkspacePageComponent) {
    await this.zoomToScale(stepScale(this.zoomBase(), -1), this.viewerCenter());
  }

  /** Real size (100 %), centred on the viewer. */
  async zoomActualSize(this: WorkspacePageComponent) {
    await this.zoomToScale(1, this.viewerCenter());
  }

  /** Anota un clic del visor y dice si es el segundo de un doble clic (P-106). */
  isViewerDoubleClick(
    this: WorkspacePageComponent,
    kind: ViewerClick['kind'],
    evt: MouseEvent,
  ): boolean {
    const click: ViewerClick = { kind, x: evt.clientX, y: evt.clientY, time: Date.now() };
    const double = isDoubleClick(this.lastViewerClick, click);
    this.lastViewerClick = double ? null : click;
    return double;
  }

  /**
   * Doble clic del visor (P-106): alterna 100 % y «ajustar al ancho» en el panel bajo el puntero
   * (en «Dividida» con zoom desenlazado, solo ese panel; enlazado, los dos). Ignorado con un
   * editor de anotación abierto.
   */
  async toggleFitActual(
    this: WorkspacePageComponent,
    at: { clientX: number; clientY: number },
  ): Promise<void> {
    if (!this.pdfDoc() || this.editing() || this.preview()) return;
    if (this.unlinkedSplit() && this.isOverSplitA(at)) {
      await this.toggleFitActualA(at);
      return;
    }
    if (doubleClickZoomTarget(this.zoomBase()) === 'actual') {
      await this.zoomToScale(1, at);
      return;
    }
    await (this.splitActive() ? this.fitSplit() : this.fitWidth());
    this.showZoomHud(this.scale(), null, this.unlinkedSplit() ? 'B' : undefined);
  }

  /** Lo mismo para A cuando «Dividida» está desenlazada y el puntero está sobre A. */
  async toggleFitActualA(
    this: WorkspacePageComponent,
    at: { clientX: number; clientY: number },
  ): Promise<void> {
    const pane = this.splitAPane();
    const canvas = this.splitCanvasRef?.nativeElement;
    if (!pane || !canvas) return;
    if (doubleClickZoomTarget(this.scaleA()) === 'actual') {
      await this.zoomSplitA(1, at);
      return;
    }
    const style = getComputedStyle(pane);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const baseWidth = canvas.getBoundingClientRect().width / this.scaleA();
    const fit = fitWidthScale(baseWidth, pane.clientWidth - padding);
    if (fit === null) return;
    await this.zoomSplitA(fit, null);
    this.resetSplitAScroll();
  }

  /** Zoom picked from the footer menu. */
  async setZoomPercent(this: WorkspacePageComponent, percent: number) {
    this.zoomMenuOpen.set(false);
    await this.zoomToScale(percent / 100, this.viewerCenter());
  }

  /**
   * Ctrl/⌘ + wheel and trackpad pinch (they arrive as wheel events with Ctrl) zoom towards the
   * cursor. A plain wheel at the edge of the sheet may change page (P-63).
   */
  onViewerWheel(this: WorkspacePageComponent, evt: WheelEvent): void {
    if (!this.pdfDoc()) {
      return;
    }
    if (!evt.ctrlKey && !evt.metaKey) {
      this.onWheelEdge(evt);
      return;
    }
    evt.preventDefault();
    if (this.splitActive() && !this.splitLinked() && this.isOverSplitA(evt)) {
      void this.zoomSplitA(this.scaleA() * wheelZoomFactor(evt.deltaY, evt.deltaMode), evt);
      return;
    }
    const requested = this.zoomBase() * wheelZoomFactor(evt.deltaY, evt.deltaMode);
    void this.zoomToScale(requested, { clientX: evt.clientX, clientY: evt.clientY });
  }

  setWheelPaging(this: WorkspacePageComponent, on: boolean): void {
    this.wheelPaging.set(on);
    this.wheelState = initialWheelPageState();
    this.wheelEdge.set(null);
    try {
      localStorage.setItem(WHEEL_PAGING_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  storedWheelPaging(this: WorkspacePageComponent): boolean {
    try {
      return typeof localStorage === 'undefined' || localStorage.getItem(WHEEL_PAGING_KEY) !== '0';
    } catch {
      return true;
    }
  }

  onWheelEdge(this: WorkspacePageComponent, evt: WheelEvent): void {
    const viewer = evt.currentTarget as HTMLElement | null;
    if (
      !this.wheelPaging() ||
      !viewer ||
      !this.pdfDoc() ||
      this.pdfDoc()!.numPages < 1 ||
      this.preview() ||
      this.editing() ||
      this.panReady() ||
      this.panning() ||
      this.lasso() ||
      evt.shiftKey ||
      Math.abs(evt.deltaX) > Math.abs(evt.deltaY) ||
      isEditableElement(document.activeElement as HTMLElement | null) ||
      (this.splitActive() && !this.splitLinked() && this.isOverSplitA(evt))
    ) {
      return;
    }
    const pixels =
      evt.deltaMode === 1 ? evt.deltaY * 33 : evt.deltaMode === 2 ? evt.deltaY * 400 : evt.deltaY;
    const asA =
      this.comparing() && !this.pagesLinked() && this.splitActive() && this.isOverSplitA(evt);
    const pane: 'A' | 'B' | undefined =
      this.comparing() && !this.pagesLinked() ? (asA ? 'A' : 'B') : undefined;
    const page = asA ? this.freeAPage() : this.pageShown();
    const total = asA ? this.pageCountA() : this.pageTotalShown();
    // El margen vertical (P-120) es zona vacía: el borde de la hoja es donde la rueda pasa de página.
    const marginY = workMarginFor(viewer.clientHeight);
    const atTop = viewer.scrollTop <= marginY;
    const atBottom = viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - marginY - 1;
    if (evt.cancelable && (pixels > 0 ? atBottom : atTop)) evt.preventDefault();
    const step = wheelEdgeStep(this.wheelState, {
      deltaY: pixels,
      now: performance.now(),
      atTop,
      atBottom,
      hasPrev: page > 1,
      hasNext: page < total,
    });
    this.wheelState = step.state;
    const rect = viewer.getBoundingClientRect();
    const place = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    if (step.change) {
      const target = page + step.change;
      this.showWheelEdge({ pane, kind: 'now', progress: 1, page: target, total, ...place }, 900);
      void (asA ? this.setPageIndexA(target) : this.setPageIndex(target)).then(() => {
        viewer.scrollTop =
          step.change > 0
            ? marginY
            : Math.max(0, viewer.scrollHeight - marginY - viewer.clientHeight);
      });
      return;
    }
    if (step.limit) {
      this.showWheelEdge(
        { pane, kind: pixels > 0 ? 'last' : 'first', progress: 0, page, total, ...place },
        900,
      );
    } else if (step.progress > 0) {
      const dir = pixels > 0 ? 1 : -1;
      this.showWheelEdge(
        {
          pane,
          kind: dir > 0 ? 'next' : 'prev',
          progress: step.progress,
          page: page + dir,
          total,
          ...place,
        },
        500,
      );
    } else if (this.wheelEdge()?.kind === 'next' || this.wheelEdge()?.kind === 'prev') {
      this.wheelEdge.set(null);
    }
  }

  showWheelEdge(this: WorkspacePageComponent, value: WheelEdgeIndicator, ms: number): void {
    this.wheelEdge.set(value);
    if (this.wheelEdgeTimer) clearTimeout(this.wheelEdgeTimer);
    this.wheelEdgeTimer = setTimeout(() => this.wheelEdge.set(null), ms);
  }

  zoomBase(this: WorkspacePageComponent): number {
    return clampScale(this.zoomPending?.requested ?? this.scale());
  }

  viewerCenter(this: WorkspacePageComponent): { clientX: number; clientY: number } | null {
    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  viewerScroller(this: WorkspacePageComponent): HTMLElement | null {
    return (this.pdfViewerRef?.nativeElement.closest('.viewer') as HTMLElement | null) ?? null;
  }

  /**
   * Espacio de trabajo ampliado (P-109): el visor deja a cada lado un margen vacío de la mitad de
   * su ancho para poder llevar cualquier PDF al centro. Se publica como `--work-margin` y se
   * mantiene al cambiar el tamaño del visor.
   */
  updateWorkMargin(this: WorkspacePageComponent): void {
    const viewer = this.viewerScroller();
    if (!viewer) return;
    viewer.style.setProperty('--work-margin', `${workMarginFor(viewer.clientWidth)}px`);
    const beforeY = viewer.style.getPropertyValue('--work-margin-y');
    const marginY = `${workMarginFor(viewer.clientHeight)}px`;
    viewer.style.setProperty('--work-margin-y', marginY);
    // El margen vertical (P-120) cambia con la altura del visor: si nadie ha movido el lienzo, el reposo
    // sigue con la hoja arriba.
    if (
      beforeY !== marginY &&
      !this.reHoming &&
      (beforeY === '' || Math.abs(viewer.scrollTop - this.viewerHomeTop) <= 2)
    ) {
      this.reHoming = true;
      try {
        this.resetViewerScroll();
      } finally {
        this.reHoming = false;
      }
    }
    if (!this.workMarginObserver && typeof ResizeObserver !== 'undefined') {
      this.workMarginObserver = new ResizeObserver(() => this.updateWorkMargin());
      this.workMarginObserver.observe(viewer);
    }
    // C1: con «Dividida» desenlazada el panel A se desplaza solo y lleva su propio margen (mitad de su
    // ancho). El panel cambia de tamaño al desenlazar (crece desde 0) y al cambiar la ventana: se
    // observa y, si A sigue en su reposo (nadie la ha movido), vuelve al reposo con el margen nuevo.
    const pane = this.unlinkedSplit() ? this.splitAPane() : null;
    if (!pane) return;
    if (pane !== this.observedAPane && this.workMarginObserver) {
      if (this.observedAPane) this.workMarginObserver.unobserve(this.observedAPane);
      this.workMarginObserver.observe(pane);
      this.observedAPane = pane;
    }
    const before = pane.style.getPropertyValue('--a-margin');
    const margin = workMarginFor(pane.clientWidth);
    pane.style.setProperty('--a-margin', `${margin}px`);
    pane.style.setProperty('--a-margin-y', `${workMarginFor(pane.clientHeight)}px`);
    const untouched =
      before === '' ||
      before === '0px' ||
      (Math.abs(pane.scrollLeft - this.aHomeLeft) <= 2 &&
        Math.abs(pane.scrollTop - this.aHomeTop) <= 2);
    if (margin > 0 && `${margin}px` !== before && untouched) this.resetSplitAScroll();
  }

  /**
   * Publica el desplazamiento horizontal como `--vx` para que las capas ancladas al visor (tarjeta
   * de primeros pasos, pista, indicador de zoom) sigan en pantalla aunque el lienzo esté movido.
   */
  onViewerScroll(this: WorkspacePageComponent, evt: Event): void {
    const viewer = evt.currentTarget as HTMLElement | null;
    viewer?.style.setProperty('--vx', `${Math.round(viewer.scrollLeft)}px`);
    viewer?.style.setProperty('--vy', `${Math.round(viewer.scrollTop)}px`);
  }

  /**
   * Lo mismo para el panel A desenlazado, que se desplaza solo: `--ax`/`--ay` mantienen a la vista su
   * etiqueta y su paginador aunque A esté movida o ampliada (C1 de la 1.17).
   */
  onSplitAScroll(this: WorkspacePageComponent, evt: Event): void {
    const pane = evt.currentTarget as HTMLElement | null;
    if (!pane) return;
    pane.style.setProperty('--ax', `${Math.round(pane.scrollLeft)}px`);
    pane.style.setProperty('--ay', `${Math.round(pane.scrollTop)}px`);
  }

  /** Hoja de A dentro de su panel (canvas y capas), en coordenadas del contenido desplazable del panel. */
  splitASheet(this: WorkspacePageComponent): HTMLElement | null {
    return (this.splitLayerRef?.nativeElement.parentElement as HTMLElement | null) ?? null;
  }

  /** Reposo del panel A desenlazado: A centrada en su panel, o su borde izquierdo si no cabe (C1). */
  resetSplitAScroll(this: WorkspacePageComponent, smooth = false): void {
    if (!this.unlinkedSplit()) return;
    this.updateWorkMargin();
    const pane = this.splitAPane();
    const sheet = this.splitASheet();
    if (!pane || !sheet) return;
    const box = this.contentBox(pane, sheet);
    const padding = parseFloat(getComputedStyle(pane).paddingLeft) || 0;
    const home = homeScrollLeft({
      contentLeft: box.left,
      contentWidth: box.width,
      viewportWidth: pane.clientWidth,
      padding,
    });
    const homeTop = workMarginFor(pane.clientHeight);
    this.scrollViewerTo(pane, home, smooth, homeTop);
    this.aHomeLeft = smooth ? home : pane.scrollLeft;
    this.aHomeTop = smooth ? homeTop : pane.scrollTop;
  }

  scrollViewerTo(
    this: WorkspacePageComponent,
    viewer: HTMLElement,
    left: number,
    smooth: boolean,
    top?: number,
  ): void {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof viewer.scrollTo === 'function') {
      viewer.scrollTo({
        left,
        ...(top === undefined ? {} : { top }),
        behavior: smooth && !reduce ? 'smooth' : 'auto',
      });
    } else {
      viewer.scrollLeft = left;
      if (top !== undefined) viewer.scrollTop = top;
    }
  }

  /** Posición del elemento en coordenadas del contenido desplazable del visor. */
  contentBox(
    this: WorkspacePageComponent,
    viewer: HTMLElement,
    el: HTMLElement,
  ): { left: number; width: number; top: number; height: number } {
    const v = viewer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      left: r.left - v.left + viewer.scrollLeft,
      width: r.width,
      top: r.top - v.top + viewer.scrollTop,
      height: r.height,
    };
  }

  /** Devuelve el visor a su posición de siempre (PDFs centrados, o su borde izquierdo si no caben). */
  resetViewerScroll(this: WorkspacePageComponent, smooth = false): void {
    this.updateWorkMargin();
    const viewer = this.viewerScroller();
    const b = this.pdfViewerRef?.nativeElement;
    if (!viewer || !b) return;
    const boxes = [this.splitActive() ? this.splitAPane() : null, b]
      .filter((el): el is HTMLElement => !!el)
      .map((el) => this.contentBox(viewer, el));
    const left = Math.min(...boxes.map((x) => x.left));
    const right = Math.max(...boxes.map((x) => x.left + x.width));
    const style = getComputedStyle(viewer);
    const padding = parseFloat(style.paddingLeft) || 0;
    const homeTop = workMarginFor(viewer.clientHeight);
    this.scrollViewerTo(
      viewer,
      homeScrollLeft({
        contentLeft: left,
        contentWidth: right - left,
        viewportWidth: viewer.clientWidth,
        padding,
      }),
      smooth,
      homeTop,
    );
    this.viewerHomeTop = smooth ? homeTop : viewer.scrollTop;
    this.resetSplitAScroll(smooth);
  }

  /**
   * Doble clic en la etiqueta «A» o «B» de «Dividida»: lleva ese PDF al centro del visor; otro
   * doble clic con el mismo PDF ya centrado reencuadra los dos (P-109). Desenlazada (C1), la «A»
   * centra A dentro de su propio panel (y otro doble clic la devuelve al reposo); la «B» no aplica.
   */
  centerPane(this: WorkspacePageComponent, which: 'a' | 'b'): void {
    if (!this.splitActive()) return;
    if (this.unlinkedSplit()) {
      if (which === 'a') this.centerSplitA();
      return;
    }
    this.updateWorkMargin();
    const viewer = this.viewerScroller();
    const el = which === 'a' ? this.splitAPane() : (this.pdfViewerRef?.nativeElement ?? null);
    if (!viewer || !el) return;
    const box = this.contentBox(viewer, el);
    const target = centerScrollLeft(box, viewer.clientWidth);
    // Si la hoja es más alta que el visor no se centra en vertical (se perdería su etiqueta): queda arriba.
    const targetTop =
      box.height <= viewer.clientHeight
        ? centerScrollLeft({ left: box.top, width: box.height }, viewer.clientHeight)
        : workMarginFor(viewer.clientHeight);
    if (
      Math.abs(target - viewer.scrollLeft) < 4 &&
      Math.abs(targetTop - viewer.scrollTop) < 4
    ) {
      this.resetViewerScroll(true);
      return;
    }
    this.scrollViewerTo(viewer, target, true, targetTop);
  }

  centerSplitA(this: WorkspacePageComponent): void {
    this.updateWorkMargin();
    const pane = this.splitAPane();
    const sheet = this.splitASheet();
    if (!pane || !sheet) return;
    const box = this.contentBox(pane, sheet);
    const target = centerScrollLeft(box, pane.clientWidth);
    const targetTop =
      box.height <= pane.clientHeight
        ? centerScrollLeft({ left: box.top, width: box.height }, pane.clientHeight)
        : workMarginFor(pane.clientHeight);
    if (Math.abs(target - pane.scrollLeft) < 4 && Math.abs(targetTop - pane.scrollTop) < 4) {
      this.resetSplitAScroll(true);
      return;
    }
    this.scrollViewerTo(pane, target, true, targetTop);
  }

  /**
   * Zooms keeping the point under `anchor` fixed. Requests that arrive while a render is
   * running are merged into the latest one, so a fast wheel never queues stale renders.
   */
  async zoomToScale(
    this: WorkspacePageComponent,
    requested: number,
    anchor: { clientX: number; clientY: number } | null = null,
  ) {
    if (!this.pdfDoc()) return;
    this.zoomPending = { requested, anchor };
    if (this.zoomBusy) return;
    this.zoomBusy = true;
    try {
      while (this.zoomPending) {
        const { requested: wanted, anchor: at } = this.zoomPending;
        this.zoomPending = null;
        const next = clampScale(wanted);
        this.showZoomHud(next, zoomLimitFor(wanted), this.unlinkedSplit() ? 'B' : undefined);
        const previous = this.scale();
        if (next === previous) continue;
        const canvas = this.pdfCanvasRef?.nativeElement;
        const container = this.pdfViewerRef?.nativeElement.parentElement;
        const before = canvas?.getBoundingClientRect();
        // En reposo (hoja arriba) el zoom no la despega del borde, como antes del margen vertical (P-120).
        const atHome = !!container && Math.abs(container.scrollTop - this.viewerHomeTop) <= 2;
        this.scale.set(next);
        await this.render();
        this.redrawAllForPage();
        if (at && canvas && container && before) {
          const after = canvas.getBoundingClientRect();
          const { dx, dy } = zoomAnchorScrollDelta(before, after, at, previous, next);
          container.scrollLeft += dx;
          container.scrollTop += dy;
          if (atHome) container.scrollTop = Math.max(container.scrollTop, this.viewerHomeTop);
        }
      }
    } finally {
      this.zoomBusy = false;
    }
  }

  showZoomHud(this: WorkspacePageComponent, scale: number, limit: ZoomLimit, side?: 'A' | 'B') {
    this.zoomHud.set({ percent: Math.round(scale * 100), limit, side });
    if (this.zoomHudTimer) clearTimeout(this.zoomHudTimer);
    this.zoomHudTimer = setTimeout(() => this.zoomHud.set(null), 1200);
    this.maybeShowWebZoomHint();
  }

  /** On the web, the browser zoom keeps working outside the viewer: say so once. */
  maybeShowWebZoomHint(this: WorkspacePageComponent) {
    if (typeof window === 'undefined' || (window as unknown as { desktop?: unknown }).desktop)
      return;
    try {
      if (localStorage.getItem('pdf-annotator.zoomHint') === '1') return;
      localStorage.setItem('pdf-annotator.zoomHint', '1');
    } catch {
      return;
    }
    this.toast.show(this.translationService.translate('zoom.hintWeb'), 'info', 10000);
  }

  onPanPointerDown(this: WorkspacePageComponent, evt: PointerEvent) {
    if (!this.pdfDoc() || this.panDrag) return;
    const target = evt.target as HTMLElement | null;
    const viewer =
      this.unlinkedSplit() && this.isOverSplitA(evt)
        ? this.splitAPane()
        : (target?.closest?.('.viewer') as HTMLElement | null);
    const wanted = evt.button === 1 || (evt.button === 0 && this.panReady());
    if (!viewer || !wanted || isEditableElement(target)) return;
    if (evt.button === 1 && this.isViewerDoubleClick('middle', evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      void this.toggleFitActual(evt);
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    this.panDrag = {
      x: evt.clientX,
      y: evt.clientY,
      left: viewer.scrollLeft,
      top: viewer.scrollTop,
      viewer,
    };
    this.panning.set(true);
    window.addEventListener('pointermove', this.panMoveHandler);
    window.addEventListener('pointerup', this.panUpHandler);
    window.addEventListener('pointercancel', this.panUpHandler);
  }

  onPanPointerMove(this: WorkspacePageComponent, evt: PointerEvent) {
    const drag = this.panDrag;
    if (!drag) return;
    const { left, top } = panScrollPosition(drag, evt);
    drag.viewer.scrollLeft = left;
    drag.viewer.scrollTop = top;
  }

  endPan(this: WorkspacePageComponent) {
    if (!this.panDrag) return;
    this.panDrag = null;
    this.panning.set(false);
    window.removeEventListener('pointermove', this.panMoveHandler);
    window.removeEventListener('pointerup', this.panUpHandler);
    window.removeEventListener('pointercancel', this.panUpHandler);
    // The click that follows a drag must not place or select an annotation.
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 0);
  }

  async fitPage(this: WorkspacePageComponent) {
    if (!this.pdfDoc()) {
      return;
    }

    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) {
      return;
    }
    this.updateWorkMargin();

    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const base = page.getViewport({ scale: 1 });
    const style = getComputedStyle(container);
    const availableW =
      container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableH =
      container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fit = fitPageScale(base.width, base.height, availableW, availableH);
    if (fit === null) {
      return;
    }

    this.scale.set(fit);
    await this.render();
    const overflow =
      container.scrollHeight - container.clientHeight - 2 * workMarginFor(container.clientHeight);
    if (overflow > 0) {
      this.scale.set(fitPageScaleForOverflow(base.height, this.scale(), overflow));
      await this.render();
    }
    this.redrawAllForPage();
    this.resetViewerScroll();
  }

  async fitWidth(this: WorkspacePageComponent) {
    if (!this.pdfDoc()) {
      return;
    }

    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) {
      return;
    }
    this.updateWorkMargin();

    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const baseWidth = page.getViewport({ scale: 1 }).width;
    const style = getComputedStyle(container);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = container.clientWidth - padding;
    const fit = fitWidthScale(baseWidth, available);
    if (fit === null) {
      return;
    }

    this.scale.set(fit);
    await this.render();
    this.redrawAllForPage();
    this.resetViewerScroll();
  }
}
