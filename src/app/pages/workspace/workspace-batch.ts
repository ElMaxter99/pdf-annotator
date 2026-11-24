import { prepareFieldForStorage } from '../../utils/field-style.utils';
import { serializeFieldForJson } from '../../utils/json-text.utils';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { PageAnnotations, PageField } from '../../models/annotation.model';
import { PageSize, sizeOfPage } from '../../utils/page-scale.utils';
import { FieldState, fieldKey } from '../../utils/migration.utils';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { BATCH_ITEM_PARAM, BATCH_OPEN_VIEW, batchItemOpening } from '../../utils/batch-open.utils';
import type { BatchItem, PageMapData } from '../../models/batch.model';
import { type PageSuggestion, suggestPageMap } from '../../utils/page-map.utils';
import { matchTemplate, parsePastedTemplates } from '../../utils/template-paste.utils';
import { addFieldToPages } from '../../utils/annotation-pages.utils';
import { parseLooseJson } from '../../utils/loose-json';
import { buildJsonExportPayload, jsonExportText } from '../../utils/json-export.utils';
import { readPageTexts } from '../../services/pdf-text.service';
import type { AiRow } from '../../utils/ai-proposal.utils';
import { PairTarget } from './workspace.types';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * Lote y traslado A→B: capa de referencia de A, tamaños y páginas de A y B, plantilla A, tabla de páginas, estados de los campos, guardado de B y acciones del PDF del lote.
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
export class WorkspaceBatch {
  /** Paints the fields of A (read only) behind those of B. */
  redrawReference(this: WorkspacePageComponent) {
    const layer = this.referenceLayerRef?.nativeElement;
    if (!layer) {
      return;
    }
    layer.textContent = '';
    layer.classList.remove('reference-layer--interactive');
    const m = this.migration();
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (this.adjust()?.phase === 'ready' && canvas) {
      this.drawAdjustPreview(layer, canvas.height);
      return;
    }
    if (this.ai()?.phase === 'ready' && canvas) {
      this.drawAiPreview(layer, canvas.height);
      return;
    }
    if (!m || !canvas || this.splitActive()) {
      return;
    }
    const onlyA = this.showingOnlyA();
    if (!onlyA && this.referenceMode() === 'toggle') {
      return;
    }

    const page = this.pageIndex();
    const pageA = this.aPage();
    const draw = (name: string, x: number, y: number, fontSize: number, missing: boolean) =>
      this.drawReferenceField(layer, canvas.height, name, x, y, fontSize, missing, onlyA);

    if (onlyA) {
      void this.drawReferencePdf(layer, canvas);
      for (const field of pageA === null ? [] : this.fieldsOfA(pageA)) {
        draw(field.name, field.x, field.y, field.fontSize, field.missing);
      }
      return;
    }
    if (pageA === null || this.bGhost()) {
      return;
    }
    if (pageA !== page && !this.tableLinked()) {
      // Free pages: the fields of the page of A that is open, with no state against B.
      for (const field of this.fieldsOfA(pageA)) {
        draw(field.name, field.x, field.y, field.fontSize, false);
      }
      return;
    }

    for (const state of m.states) {
      if (state.page !== page || !state.a || state.status === 'same') {
        continue;
      }
      if (state.a.page !== undefined && state.a.page !== page) {
        continue; // the field of A lives on another page of A: nothing to draw on this one
      }
      draw(state.a.name, state.a.x, state.a.y, state.a.fontSize, state.status === 'missing');
    }
  }

  /** Holding «A» swaps the page for the PDF of A, even when A has no template. */
  async drawReferencePdf(
    this: WorkspacePageComponent,
    layer: HTMLElement,
    bCanvas: HTMLCanvasElement,
  ): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const token = ++this.referencePdfToken;
    try {
      const doc = await this.splitDocOf(item.aPdf);
      const wanted = this.aPage();
      if (wanted === null || wanted > doc.numPages) {
        return;
      }
      const page = await doc.getPage(wanted);
      const viewport = page.getViewport({ scale: this.scale() });
      const geometry = this.geometryForA(page);
      const canvas = document.createElement('canvas');
      canvas.className = 'reference-pdf';
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      canvas.style.width = `${bCanvas.clientWidth || canvas.width}px`;
      canvas.style.height = `${bCanvas.clientHeight || canvas.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      await page.render({ canvasContext: ctx, canvas, viewport, transform: geometry.transform })
        .promise;
      if (token === this.referencePdfToken && this.showingOnlyA() && layer.isConnected) {
        layer.querySelectorAll('.reference-pdf').forEach((old) => old.remove());
        layer.prepend(canvas);
      }
    } catch {
      /* the fields of A are still shown */
    }
  }

  async updatePagesDiffer(this: WorkspacePageComponent, aPdf: Blob | null): Promise<void> {
    if (!aPdf) {
      this.pagesDiffer.set(null);
      this.pageCountA.set(0);
      this.pageSizesA.set([]);
      this.pageSizesB.set([]);
      return;
    }
    try {
      const docA = await this.splitDocOf(aPdf);
      const docB = this.pdfDoc();
      const a = docA.numPages;
      const b = docB?.numPages ?? 0;
      this.pagesDiffer.set(b > 0 && a !== b ? { a, b } : null);
      this.pageCountA.set(a);
      if (!this.pagesLinked() && this.freeAPage() > a) {
        this.freeAPage.set(a);
      }
      if (this.commonPage() < this.pageIndex()) {
        this.commonPage.set(this.pageIndex());
      }
      if (docB && (this.pageSizesKey?.a !== aPdf || this.pageSizesKey?.b !== docB)) {
        this.pageSizesKey = { a: aPdf, b: docB };
        const sizesOf = async (doc: PDFDocumentProxy) => {
          const sizes: PageSize[] = [];
          for (let num = 1; num <= doc.numPages; num++) {
            const view = (await doc.getPage(num)).getViewport({ scale: 1 });
            sizes.push({ w: view.width, h: view.height });
          }
          return sizes;
        };
        const [sizesA, sizesB] = await Promise.all([sizesOf(docA), sizesOf(docB)]);
        if (this.pageSizesKey?.a === aPdf && this.pageSizesKey?.b === docB) {
          this.pageSizesA.set(sizesA);
          this.pageSizesB.set(sizesB);
        }
      }
    } catch {
      this.pagesDiffer.set(null);
      this.pageCountA.set(0);
    }
  }

  /** «Ajustar» / «Dejarlas como están»: remembers the choice for the open PDF of the batch. */
  setFitA(this: WorkspacePageComponent, fit: boolean | undefined): void {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.setFitA(item.id, fit);
    }
  }

  /**
   * Size and transform to draw the page of A: its own size, or the size of B with the page
   * stretched to it when the coordinates of A are scaled.
   */
  geometryForA(
    this: WorkspacePageComponent,
    page: PDFPageProxy,
  ): {
    width: number;
    height: number;
    transform: number[] | undefined;
  } {
    const scale = this.scaleOfA();
    const own = page.getViewport({ scale });
    const target = sizeOfPage(this.pageSizesB(), this.pageIndex());
    if (!this.fitA() || !target) {
      return { width: Math.floor(own.width), height: Math.floor(own.height), transform: undefined };
    }
    const base = page.getViewport({ scale: 1 });
    return {
      width: Math.floor(target.w * scale),
      height: Math.floor(target.h * scale),
      transform: [target.w / base.width, 0, 0, target.h / base.height, 0, 0],
    };
  }

  splitDocOf(this: WorkspacePageComponent, blob: Blob): Promise<PDFDocumentProxy> {
    if (!this.splitDoc || this.splitDoc.blob !== blob) {
      const doc = blob
        .arrayBuffer()
        .then((buffer) => pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise);
      this.splitDoc = { blob, doc };
    }
    return this.splitDoc.doc;
  }

  /** Every field of A on a page, flagged when B does not have it yet. */
  fieldsOfA(this: WorkspacePageComponent, page: number) {
    const m = this.migration();
    if (!m) {
      return [];
    }
    const out: { name: string; x: number; y: number; fontSize: number; missing: boolean }[] = [];
    for (const aPage of this.aPagesView()) {
      if (aPage.num !== page) {
        continue;
      }
      for (const field of aPage.fields) {
        const name = (field.mapField || field.value || '').trim();
        const sameAsB = this.tableLinked() ? page === this.aPage() : page === this.pageIndex();
        const missing =
          sameAsB &&
          m.states.some(
            (state) =>
              state.status === 'missing' && state.page === this.pageIndex() && state.name === name,
          );
        out.push({ name, x: field.x, y: field.y, fontSize: field.fontSize, missing });
      }
    }
    return out;
  }

  drawReferenceField(
    this: WorkspacePageComponent,
    layer: HTMLElement,
    canvasHeight: number,
    name: string,
    x: number,
    y: number,
    fontSize: number,
    missing: boolean,
    solo: boolean,
    scale = this.scale(),
  ) {
    const px = Number(x);
    const py = Number(y);
    const size = Math.max(6, Number(fontSize) || 12);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return;
    }
    const el = document.createElement('div');
    el.className = 'reference-field';
    el.classList.toggle('reference-field--missing', missing);
    el.classList.toggle('reference-field--solo', solo);
    el.textContent = name;
    el.title = name;
    el.dataset['name'] = name;
    el.style.left = `${px * scale}px`;
    el.style.top = `${canvasHeight - py * scale - size * scale}px`;
    el.style.height = `${size * scale * 1.2}px`;
    el.style.minWidth = `${Math.max(24, name.length * size * 0.55 * scale)}px`;
    el.style.fontSize = `${Math.max(10, size * scale * 0.8)}px`;
    layer.appendChild(el);
  }

  /** The template of A by the page of B it goes with (the table decides; without one, by number). */
  normalizedTemplateA(this: WorkspacePageComponent): PageAnnotations[] {
    return this.normalizeTemplate(this.aPagesForB());
  }

  /** The template of A by its own page numbers (what the AI helper and free pages work with). */
  normalizedTemplateOfA(this: WorkspacePageComponent): PageAnnotations[] {
    return this.normalizeTemplate(this.aPagesView());
  }

  normalizeTemplate(this: WorkspacePageComponent, pages: PageAnnotations[]): PageAnnotations[] {
    if (!this.batch.activeItem()) {
      return [];
    }
    return (
      this.annotationImport.normalizeImportedCoordinates({ pages }, (field) =>
        this.prepareFieldForStorage(field),
      ) ?? []
    );
  }

  /** Puts A's template into B: everything (replaces B) or only what B still lacks. One undo step. */
  applyTemplateA(this: WorkspacePageComponent, mode: 'replace' | 'missing') {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const pageA = this.aPage();
    if (this.pageOffset() && pageA !== null) {
      this.confirmCopyPageOfA(mode, pageA, this.pageIndex());
      return;
    }
    const map = this.pageMap();
    if (mode === 'replace') {
      if (map) {
        // Only the pages of B that have a page of A are replaced; the others are left alone.
        const kept = this.coords().filter((page) => map.pairs[page.num - 1] === null);
        this.replaceCoords([...kept, ...this.normalizedTemplateA()].sort((x, y) => x.num - y.num));
      } else {
        this.replaceCoords(this.normalizedTemplateA());
      }
    } else {
      this.addMissingFromA(
        this.migration()?.states.filter((state) => state.status === 'missing') ?? [],
      );
    }
    if (map) {
      this.toast.show(
        this.translationService.translate('batch.editor.pageMap.copied', {
          count: map.pairs.filter((a) => a !== null).length,
          unmapped: map.pairs.filter((a) => a === null).length,
        }),
      );
      return;
    }
    if (this.fitA()) {
      this.toast.show(this.translationService.translate('toast.batch.copiedAdjusted'));
    }
  }

  // ---- «Emparejar páginas» (tabla A↔B, P-78 a P-81) -------------------------------------------

  openPageMap(this: WorkspacePageComponent): void {
    if (this.comparing()) {
      this.pageMapOpen.set(true);
    }
  }

  closePageMap(this: WorkspacePageComponent): void {
    this.pageMapToken += 1;
    this.pageMapOpen.set(false);
  }

  /** Stops a text reading that is still running (the dialog's «Cancelar lectura»). */
  cancelPageMapReading(this: WorkspacePageComponent): void {
    this.pageMapToken += 1;
  }

  pageTagKey(
    this: WorkspacePageComponent,
    kind: 'missing' | 'offset' | 'mapped' | 'unmapped',
  ): string {
    return `batch.editor.pages.tag${kind[0].toUpperCase()}${kind.slice(1)}`;
  }

  /** Saves the table of the open pair (`undefined` = by number again). «Deshacer» for 10 s. */
  applyPageMap(this: WorkspacePageComponent, map: PageMapData | undefined): void {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const before = item.pageMap;
    const change = (next: PageMapData | undefined) => {
      this.batch.setPageMap(item.id, next);
      this.commonPage.set(this.pageIndex());
      this.selection.set(null);
    };
    change(map);
    this.closePageMap();
    this.toast.show(
      this.translationService.translate(
        map ? 'batch.editor.pageMap.applied' : 'batch.editor.pageMap.cleared',
        { count: map?.pairs.filter((a) => a !== null).length ?? 0, total: map?.pairs.length ?? 0 },
      ),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('controls.undo'),
        run: () => change(before),
      },
    );
  }

  /** Reads the text of every page of A and B and suggests the table; rows set by hand are kept. */
  async suggestPageMapFromTexts(
    this: WorkspacePageComponent,
    keep: PageMapData | null,
    onProgress: (done: number, total: number) => void,
  ): Promise<PageSuggestion | 'noText' | null> {
    const item = this.batch.activeItem();
    const docB = this.pdfDoc();
    if (!item || !docB) {
      return 'noText';
    }
    const token = ++this.pageMapToken;
    try {
      const docA = await this.splitDocOf(item.aPdf);
      const total = docA.numPages + docB.numPages;
      let done = 0;
      const read = async (doc: PDFDocumentProxy): Promise<string[]> => {
        const out: string[] = [];
        for (let num = 1; num <= doc.numPages; num++) {
          if (token !== this.pageMapToken) {
            throw new Error('cancelled');
          }
          out.push((await readPageTexts(doc, num)).map((text) => text.text).join(' '));
          done += 1;
          onProgress(done, total);
        }
        return out;
      };
      const textsA = await read(docA);
      const textsB = await read(docB);
      if (!textsA.some((text) => text.trim()) || !textsB.some((text) => text.trim())) {
        return 'noText';
      }
      return suggestPageMap(textsA, textsB, keep);
    } catch {
      return token !== this.pageMapToken ? null : 'noText';
    }
  }

  /** Free pages: «Poner plantilla A» copies the page of A that is open into the page of B that is open. */
  confirmCopyPageOfA(
    this: WorkspacePageComponent,
    mode: 'replace' | 'missing',
    pageA: number,
    pageB: number,
  ): void {
    this.toast.show(
      this.translationService.translate('batch.editor.pages.copyConfirm', { a: pageA, b: pageB }),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('batch.editor.pages.copyAction'),
        run: () => this.copyPageOfAToB(mode, pageA, pageB),
      },
    );
  }

  copyPageOfAToB(
    this: WorkspacePageComponent,
    mode: 'replace' | 'missing',
    pageA: number,
    pageB: number,
  ): void {
    const source = this.normalizedTemplateOfA().find((page) => page.num === pageA)?.fields ?? [];
    const nameOf = (field: PageField) => (field.mapField || field.value || '').trim();
    const present = new Set(
      (this.coords().find((page) => page.num === pageB)?.fields ?? []).map(nameOf),
    );
    const toAdd =
      mode === 'replace' ? source : source.filter((field) => !present.has(nameOf(field)));
    if (!toAdd.length && mode !== 'replace') {
      return;
    }
    const changed = this.applyCoordsChange(() => {
      let pages = this.coords();
      if (mode === 'replace') {
        pages = pages.map((page) => (page.num === pageB ? { ...page, fields: [] } : page));
      }
      for (const field of toAdd) {
        pages = addFieldToPages(pageB, { ...field }, pages);
      }
      this.coords.set(pages);
    });
    if (changed) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
  }

  placeMissing(this: WorkspacePageComponent, state: FieldState) {
    this.addMissingFromA([state]);
  }

  addMissingFromA(this: WorkspacePageComponent, states: readonly FieldState[]) {
    const template = this.normalizedTemplateA();
    const toAdd: Array<{ page: number; field: PageField }> = [];
    for (const state of states) {
      const source = template
        .find((page) => page.num === state.page)
        ?.fields.find(
          (field) =>
            (field.mapField || field.value || '').trim() === state.name &&
            field.x === state.a?.x &&
            field.y === state.a?.y,
        );
      if (source) {
        toAdd.push({ page: state.page, field: { ...source } });
      }
    }
    if (!toAdd.length) {
      return;
    }
    const changed = this.applyCoordsChange(() => {
      let pages = this.coords();
      for (const { page, field } of toAdd) {
        pages = addFieldToPages(page, field, pages);
      }
      this.coords.set(pages);
    });
    if (changed) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
  }

  /** Página de B que usan los estados y los descartes para un campo de A (con tabla A↔B, la página de A renumerada a B). */
  aiStatePage(this: WorkspacePageComponent, row: AiRow): number {
    const pairs = this.pageMap()?.pairs;
    const at = pairs ? pairs.indexOf(row.page) : -1;
    return at >= 0 ? at + 1 : row.page;
  }

  /** «Validar: no existe»: da por resuelto un campo de A de la propuesta de la IA que no se coloca en B. */
  validateAbsent(this: WorkspacePageComponent, row: AiRow) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.dismiss(item.id, fieldKey(this.aiStatePage(row), this.aiFieldName(row)));
    }
  }

  unvalidateAbsent(this: WorkspacePageComponent, row: AiRow) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.restore(item.id, fieldKey(this.aiStatePage(row), this.aiFieldName(row)));
    }
  }

  dismissMissing(this: WorkspacePageComponent, state: FieldState) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.dismiss(item.id, fieldKey(state.page, state.name));
    }
  }

  restoreDismissed(this: WorkspacePageComponent, key: string) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.restore(item.id, key);
    }
  }

  dismissedLabel(this: WorkspacePageComponent, key: string): string {
    const separator = key.indexOf('|');
    return separator >= 0 ? key.slice(separator + 1) : key;
  }

  linkField(this: WorkspacePageComponent, state: FieldState, aName: string) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.link(item.id, { page: state.page, b: state.name, a: aName });
    }
  }

  unlinkField(this: WorkspacePageComponent, state: FieldState) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.unlink(item.id, state.page, state.name);
    }
  }

  /** Goes to the field's page and selects it in B (missing fields only change the page). */
  async focusField(this: WorkspacePageComponent, state: FieldState) {
    if (state.page !== this.pageIndex()) {
      await this.setPageIndex(state.page);
    }
    if (state.b) {
      this.selection.set({ pageIndex: state.b.pageIndex, fields: [state.b.fieldIndex] });
      this.redrawAllForPage();
    }
    // La pareja de A (misma página de B por la tabla o el número) resaltada y unida con una línea.
    const target: PairTarget = {
      aName: state.a?.name ?? '',
      aPage:
        state.a && (state.a.page === undefined || state.a.page === state.page)
          ? this.aPage()
          : null,
      aX: state.a?.x,
      aY: state.a?.y,
      b: state.b
        ? {
            kind: 'field',
            page: state.page,
            pageIndex: state.b.pageIndex,
            index: state.b.fieldIndex,
          }
        : null,
    };
    await this.revealPair(target);
    if (!state.b) {
      this.runAfterRender(() =>
        this.showPairTip(this.findPairElementA(target), 'pairing.noPartnerB'),
      );
    } else if (!state.a) {
      this.runAfterRender(() =>
        this.showPairTip(this.findPairElementB(target), 'pairing.noPartnerA'),
      );
    }
  }

  scheduleBatchSave(this: WorkspacePageComponent) {
    if (this.batchSaveTimer) {
      clearTimeout(this.batchSaveTimer);
      this.batchSaveTimer = null;
    }
    if (!this.batch.activeItem() || !this.pdfDoc() || typeof window === 'undefined') {
      return;
    }
    this.batchSaveTimer = setTimeout(() => {
      this.batchSaveTimer = null;
      this.flushBatchSave();
    }, 300);
  }

  /** Stores B in the batch. Skips the write when nothing changed so opening never un-validates. */
  flushBatchSave(this: WorkspacePageComponent, force = false) {
    if (this.batchSaveTimer) {
      clearTimeout(this.batchSaveTimer);
      this.batchSaveTimer = null;
    }
    const item = this.batch.activeItem();
    if (!item || !this.pdfDoc()) {
      return;
    }
    const pages = this.store.snapshot();
    const json = jsonExportText(
      buildJsonExportPayload(pages, (field) => this.serializeFieldForJson(field)),
    );
    if (!force && json === item.bJson) {
      return;
    }
    this.batch.saveB(item.id, pages, json);
  }

  /** Moves to the previous (-1) or next (+1) PDF of the batch without leaving the editor. */
  async goBatchItem(this: WorkspacePageComponent, delta: number) {
    const ctx = this.batchCtx();
    if (!ctx) {
      return;
    }
    const target = this.batch.items()[ctx.index + delta];
    if (!target) {
      return;
    }
    await this.switchBatchItem(target);
  }

  async switchBatchItem(this: WorkspacePageComponent, target: BatchItem): Promise<void> {
    this.flushBatchSave();
    this.cancelAi();
    this.batch.activate(target.id);
    this.clearSelection();
    void this.router.navigate(['/workspace'], {
      queryParams: { [BATCH_ITEM_PARAM]: target.id },
      replaceUrl: true,
    });
    await this.openBatchPdf(target);
  }

  /** Loads the PDF to edit for a batch item: B when it has one, otherwise A with its template. */
  async openBatchPdf(
    this: WorkspacePageComponent,
    item: BatchItem,
    coordsOverride: PageAnnotations[] | null = null,
  ): Promise<void> {
    const opening = batchItemOpening(item);
    const coords = coordsOverride ?? opening.coords;
    await this.loadPdfFile(opening.file, coords ? { coords, ...BATCH_OPEN_VIEW } : null);
  }

  /** «Documento» tab of a batch PDF: swaps the PDF being edited and keeps its annotations. */
  async batchReplacePdf(this: WorkspacePageComponent, file: File): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    this.flushBatchSave(true);
    this.batch.replacePdf(item.id, file);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated, this.store.snapshot());
    }
  }

  /** Adds the new version (B). Annotations already placed become the template A if it was empty. */
  async batchAddVersionB(this: WorkspacePageComponent, file: File): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    const placed = this.store.snapshot();
    if (
      !item.bPdf &&
      !item.aPages.some((page) => page.fields.length) &&
      placed.some((p) => p.fields.length)
    ) {
      this.batch.setTemplate(item.id, placed);
      this.toast.show(this.translationService.translate('toast.batch.templateFromAnnotations'));
    }
    this.batch.setB(item.id, file);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated);
    }
  }

  /** Drops B and goes back to editing the original PDF with its template. */
  async batchRemoveVersionB(this: WorkspacePageComponent): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    this.batch.removeB(item.id);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated);
    }
  }

  /**
   * Sets the template A from a JSON file or pasted text. Returns an error key, or `null` when it
   * worked. Without B the template is also loaded into the editor (one undo step).
   */
  async batchSetTemplate(
    this: WorkspacePageComponent,
    source: { file: File } | { text: string },
  ): Promise<'tooBig' | 'json' | 'noPages' | null> {
    const item = this.batch.activeItem();
    if (!item) {
      return null;
    }
    let data: unknown;
    try {
      if ('file' in source) {
        if (source.file.size > 5 * 1024 * 1024) {
          return 'tooBig';
        }
        data = parseLooseJson(await source.file.text());
      } else {
        if (source.text.length > 5 * 1024 * 1024) {
          return 'tooBig';
        }
        const { templates, error } = parsePastedTemplates(source.text);
        if (error) {
          return 'json';
        }
        data = (matchTemplate(item.name, templates, new Set()) ?? templates[0])?.data;
        if (data === undefined) {
          return 'noPages';
        }
      }
    } catch {
      return 'json';
    }
    const pages = this.annotationImport.normalizeImportedCoordinates(data, (field) => field);
    if (pages === null) {
      return 'noPages';
    }
    const count = pages.reduce((sum, page) => sum + page.fields.length, 0);
    if (count === 0) {
      return 'noPages';
    }
    this.batch.setTemplate(item.id, pages);
    if (!item.bPdf) {
      this.replaceCoords(this.normalizedTemplateA());
    } else {
      this.redrawReference();
    }
    this.toast.show(this.translationService.translate('toast.batch.templateApplied', { count }));
    return null;
  }

  batchRemoveTemplate(this: WorkspacePageComponent): void {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.setTemplate(item.id, []);
      this.redrawReference();
    }
  }

  async backToBatch(this: WorkspacePageComponent) {
    this.flushBatchSave();
    await this.router.navigate(['/lote']);
  }

  async markReady(this: WorkspacePageComponent) {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    this.flushBatchSave(true);
    this.batch.setStatus(item.id, 'ready');
    await this.router.navigate(['/lote']);
  }
}
