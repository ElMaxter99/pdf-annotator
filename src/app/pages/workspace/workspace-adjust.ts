import { PageField } from '../../models/annotation.model';
import { pageScaleFactors, sizeOfPage } from '../../utils/page-scale.utils';
import { mapPageOfA } from '../../utils/page-map.utils';
import { findAnchors, type PageTextItem } from '../../utils/text-anchors.utils';
import {
  type AdjustAnchorRow,
  type AdjustField,
  type AdjustMode,
  effectiveShift,
  fieldVisual,
  formatShift,
  hitAdjustField,
  isFieldMoved,
  collectAdjustFields,
  existingFieldKeys,
  recomputeFields,
} from '../../utils/adjust-session.utils';
import { readPageTexts } from '../../services/pdf-text.service';
import { AdjustSession, ADJUST_UI } from './workspace.types';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * «Copiar y ajustar por textos»: proponer, revisar en la capa de referencia y aplicar (un paso de historial).
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
export class WorkspaceAdjust {
  // ---- «Copiar y ajustar por textos» -------------------------------------------------------------

  /** Looks for the same texts in A and B and opens the review with a proposal. */
  async startAdjust(this: WorkspacePageComponent): Promise<void> {
    const item = this.batch.activeItem();
    if (!item || !this.migration() || !this.pdfDoc() || this.templateFieldsA() === 0) {
      return;
    }
    const token = ++this.adjustToken;
    const template = this.normalizedTemplateA();
    const existing = existingFieldKeys(this.coords());
    const pages = template.filter((page) => page.fields.length > 0).map((page) => page.num);
    const progress = { page: 0, total: pages.length, common: 0 };
    this.adjust.set({
      phase: 'loading',
      progress,
      mode: 'near',
      tab: 'fields',
      fields: [],
      anchors: [],
      skipped: 0,
      textsA: 0,
      textsB: 0,
      ...ADJUST_UI,
    });
    this.reopenNotice('adjust');
    if (this.referenceMode() !== 'split') {
      this.adjustPreviousMode = this.referenceMode();
      await this.setReferenceMode('split');
    }
    try {
      const aDoc = await this.splitDocOf(item.aPdf);
      const anchors: AdjustAnchorRow[] = [];
      let textsA = 0;
      let textsB = 0;
      for (const num of pages) {
        if (token !== this.adjustToken) {
          return;
        }
        progress.page += 1;
        const numA = mapPageOfA(this.pageMap(), num);
        if (numA === null || numA > aDoc.numPages || num > this.pdfDoc()!.numPages) {
          continue;
        }
        const [aItems, bItems] = await Promise.all([
          readPageTexts(aDoc, numA),
          readPageTexts(this.pdfDoc()!, num),
        ]);
        textsA += aItems.length;
        textsB += bItems.length;
        const report = findAnchors(this.fitTextsOfA(aItems, numA, num), bItems);
        for (const anchor of report.anchors) {
          anchors.push({
            key: `${num}:${anchor.id}`,
            page: num,
            anchor,
            on: !report.defaultOff.has(anchor.id),
            outlier: report.outliers.has(anchor.id),
          });
        }
        progress.common = anchors.length;
        this.adjust.update((current) =>
          current ? { ...current, progress: { ...progress } } : current,
        );
      }
      if (token !== this.adjustToken) {
        return;
      }
      const collected = collectAdjustFields(template, existing);
      const skipped = collected.skipped;
      const fields = recomputeFields(collected.fields, anchors, 'near');
      const phase =
        textsA === 0 || textsB === 0 ? 'noText' : anchors.length === 0 ? 'none' : 'ready';
      this.adjust.set({
        phase,
        progress: { ...progress },
        mode: 'near',
        tab: 'fields',
        fields,
        anchors,
        skipped,
        textsA,
        textsB,
        ...ADJUST_UI,
      });
      this.redrawAllForPage();
    } catch (error) {
      console.warn('No se pudo leer el texto de los PDFs.', error);
      this.adjust.update((current) => (current ? { ...current, phase: 'noText' } : current));
    }
  }

  /** With «Ajustar» on, the texts of A are scaled to B first (x and y apart), then compared. */
  fitTextsOfA(
    this: WorkspacePageComponent,
    items: readonly PageTextItem[],
    pageA: number,
    pageB: number,
  ): readonly PageTextItem[] {
    if (!this.fitA()) {
      return items;
    }
    const { sx, sy } = pageScaleFactors(
      sizeOfPage(this.pageSizesA(), pageA),
      sizeOfPage(this.pageSizesB(), pageB),
    );
    return items.map((item) => ({ ...item, x: item.x * sx, y: item.y * sy }));
  }

  cancelAdjust(this: WorkspacePageComponent): void {
    this.adjustToken += 1;
    this.adjust.set(null);
    this.holdingOriginal.set(false);
    this.reopenNotice('adjust');
    const previous = this.adjustPreviousMode;
    this.adjustPreviousMode = null;
    if (previous) {
      void this.setReferenceMode(previous);
    } else {
      this.redrawAllForPage();
    }
  }

  setAdjustMode(this: WorkspacePageComponent, mode: AdjustMode): void {
    this.updateAdjust((current) => ({
      ...current,
      mode,
      fields: recomputeFields(current.fields, current.anchors, mode),
    }));
  }

  setAdjustTab(this: WorkspacePageComponent, tab: 'fields' | 'texts'): void {
    this.updateAdjust((current) => ({ ...current, tab }));
  }

  toggleAdjustField(this: WorkspacePageComponent, key: string): void {
    this.updateAdjust((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === key ? { ...field, override: !isFieldMoved(field) } : field,
      ),
    }));
  }

  toggleAdjustAnchor(this: WorkspacePageComponent, key: string): void {
    this.updateAdjust((current) => {
      const anchors = current.anchors.map((row) =>
        row.key === key ? { ...row, on: !row.on } : row,
      );
      return {
        ...current,
        anchors,
        fields: recomputeFields(current.fields, anchors, current.mode),
      };
    });
  }

  /** Fields that will move when the user applies the proposal. */
  adjustMovedCount(this: WorkspacePageComponent): number {
    return this.adjust()?.fields.filter((field) => isFieldMoved(field)).length ?? 0;
  }

  /** Copies A's fields into B with the proposed shift (one undo step). */
  applyAdjust(this: WorkspacePageComponent): void {
    const session = this.adjust();
    const item = this.batch.activeItem();
    if (!session || session.phase !== 'ready' || !item) {
      return;
    }
    const byKey = new Map(session.fields.map((field) => [field.key, field]));
    const template = this.normalizedTemplateA();
    const toAdd: Array<{ page: number; field: PageField }> = [];
    for (const page of template) {
      page.fields.forEach((field, fieldIndex) => {
        const proposal = byKey.get(`${page.num}:${fieldIndex}`);
        if (!proposal) {
          return;
        }
        const { dx, dy } = effectiveShift(proposal);
        toAdd.push({
          page: page.num,
          field: {
            ...field,
            x: Math.max(0, Math.round((field.x + dx) * 100) / 100),
            y: Math.max(0, Math.round((field.y + dy) * 100) / 100),
          },
        });
      });
    }
    const moved = session.fields.filter((field) => isFieldMoved(field)).length;
    const count = toAdd.length;
    this.insertFields(toAdd);
    this.cancelAdjust();
    this.toast.show(
      this.translationService.translate('toast.batch.adjustApplied', { count, moved }),
    );
  }

  updateAdjust(
    this: WorkspacePageComponent,
    update: (current: AdjustSession) => AdjustSession,
  ): void {
    const current = this.adjust();
    if (!current) {
      return;
    }
    this.adjust.set(update(current));
    this.redrawAllForPage();
    void this.renderSplit();
  }

  /** Light update (hover, card): redraws the layers without touching the PDF canvases. */
  patchAdjust(this: WorkspacePageComponent, patch: Partial<AdjustSession>): void {
    const current = this.adjust();
    if (!current) {
      return;
    }
    this.adjust.set({ ...current, ...patch });
    this.redrawReference();
    this.markAdjustHoverInSplit();
  }
  refreshAdjustPreview(this: WorkspacePageComponent): void {
    this.redrawReference();
  }

  setAdjustView(this: WorkspacePageComponent, view: 'proposal' | 'original'): void {
    this.patchAdjust({ view, selected: null, card: null });
  }

  toggleAdjustOpen(this: WorkspacePageComponent): void {
    const current = this.adjust();
    if (current) {
      this.patchAdjust({ open: !current.open });
    }
  }

  toggleAdjustAnchors(this: WorkspacePageComponent): void {
    const current = this.adjust();
    if (current) {
      this.patchAdjust({ anchorsShown: !current.anchorsShown });
      void this.renderSplit();
    }
  }

  setAdjustHover(this: WorkspacePageComponent, key: string | null): void {
    if (this.adjust()?.hover !== key) {
      this.patchAdjust({ hover: key });
    }
  }

  setAdjustHoverAnchor(this: WorkspacePageComponent, key: string | null): void {
    if (this.adjust()?.hoverAnchor !== key) {
      this.patchAdjust({ hoverAnchor: key });
    }
  }

  closeAdjustCard(this: WorkspacePageComponent): void {
    if (this.adjust()?.card) {
      this.patchAdjust({ selected: null, card: null });
    }
  }

  /** Sets a shift typed by hand (points; up is positive) and ticks the field. */
  setAdjustManual(this: WorkspacePageComponent, key: string, dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return;
    }
    this.updateAdjust((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === key ? { ...field, manual: { dx, dy }, override: true } : field,
      ),
    }));
  }

  resetAdjustManual(this: WorkspacePageComponent, key: string): void {
    this.updateAdjust((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === key ? { ...field, manual: null, override: null } : field,
      ),
    }));
  }

  adjustField(this: WorkspacePageComponent, key: string | null): AdjustField | null {
    return (key && this.adjust()?.fields.find((field) => field.key === key)) || null;
  }

  /** Field of the proposal under a pointer position, while the review is open. */
  adjustHit(this: WorkspacePageComponent, evt: MouseEvent): AdjustField | null {
    const session = this.adjust();
    if (!session || session.phase !== 'ready') {
      return null;
    }
    const point = this.domToPdfCoords(evt);
    return point
      ? hitAdjustField(
          session.fields,
          this.pageIndex(),
          point,
          this.scale(),
          this.adjustShowsOriginal(),
        )
      : null;
  }

  /** B layer: where each field goes (amber), where it was (grey), arrows and anchor pins. */
  drawAdjustPreview(this: WorkspacePageComponent, layer: HTMLElement, canvasHeight: number): void {
    const session = this.adjust();
    if (!session || session.phase !== 'ready') {
      return;
    }
    const page = this.pageIndex();
    const scale = this.scale();
    const original = this.adjustShowsOriginal();
    const flagged = new Set([session.hover, session.selected]);
    let arrows = '';
    for (const field of session.fields) {
      if (field.page !== page) {
        continue;
      }
      const visual = original ? 'grey' : fieldVisual(field);
      const { dx, dy } = original ? { dx: 0, dy: 0 } : effectiveShift(field);
      const moved = visual === 'proposal' || visual === 'estimated' || visual === 'manual';
      if (moved) {
        this.drawReferenceField(
          layer,
          canvasHeight,
          field.name,
          field.x,
          field.y,
          field.fontSize,
          false,
          false,
        );
        const ghost = layer.lastElementChild as HTMLElement | null;
        if (ghost) {
          ghost.classList.add('reference-field--origin');
          ghost.textContent = '';
        }
      }
      this.drawReferenceField(
        layer,
        canvasHeight,
        field.name,
        field.x + dx,
        field.y + dy,
        field.fontSize,
        false,
        false,
      );
      const el = layer.lastElementChild as HTMLElement | null;
      if (el) {
        el.classList.add(`reference-field--${visual}`);
        el.classList.toggle('reference-field--hover', flagged.has(field.key));
        el.dataset['adjustKey'] = field.key;
      }
      if (moved && flagged.has(field.key)) {
        const size = Math.max(6, Number(field.fontSize) || 12);
        const x1 = field.x * scale;
        const y1 = canvasHeight - (field.y + size / 2) * scale;
        const x2 = (field.x + dx) * scale;
        const y2 = canvasHeight - (field.y + dy + size / 2) * scale;
        arrows += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b57600" stroke-width="2" marker-end="url(#adjust-arrow)"/>`;
        const label = document.createElement('span');
        label.className = 'adjust-delta';
        label.textContent = formatShift(dx, dy);
        label.style.left = `${Math.max(0, x2 + 8)}px`;
        label.style.top = `${Math.max(0, y2 - 26)}px`;
        layer.appendChild(label);
      }
    }
    if (arrows) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'adjust-arrows');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = `<defs><marker id="adjust-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b57600"/></marker></defs>${arrows}`;
      layer.appendChild(svg);
    }
    if (!original) {
      this.drawAdjustPins(layer, canvasHeight, 'b');
    }
  }

  drawAdjustPins(
    this: WorkspacePageComponent,
    layer: HTMLElement,
    canvasHeight: number,
    side: 'a' | 'b',
  ): void {
    const session = this.adjust();
    if (
      !session ||
      session.phase !== 'ready' ||
      (!session.anchorsShown && session.tab !== 'texts')
    ) {
      return;
    }
    const scale = side === 'a' ? this.scaleOfA() : this.scale();
    const page = this.pageIndex();
    for (const row of session.anchors) {
      if (row.page !== page || !row.on) {
        continue;
      }
      const point = side === 'a' ? row.anchor.a : row.anchor.b;
      const pin = document.createElement('span');
      pin.className = 'adjust-pin';
      pin.classList.toggle('adjust-pin--hover', session.hoverAnchor === row.key);
      pin.textContent = `${row.anchor.id}`;
      pin.title = row.anchor.text;
      pin.dataset['anchorKey'] = row.key;
      pin.style.left = `${point.x * scale - 8}px`;
      pin.style.top = `${canvasHeight - point.y * scale - 8}px`;
      layer.appendChild(pin);
    }
  }

  /** Marks on A (left pane of «Dividida») the field under the pointer on B or in the list. */
  markAdjustHoverInSplit(this: WorkspacePageComponent): void {
    const layer = this.splitLayerRef?.nativeElement;
    const session = this.adjust();
    if (!layer || !session) {
      return;
    }
    const wanted = this.adjustField(session.hover ?? session.selected);
    layer.querySelectorAll<HTMLElement>('.reference-field').forEach((el) => {
      el.classList.toggle('reference-field--hover', !!wanted && el.dataset['name'] === wanted.name);
    });
    layer.querySelectorAll<HTMLElement>('.adjust-pin').forEach((el) => {
      el.classList.toggle('adjust-pin--hover', el.dataset['anchorKey'] === session.hoverAnchor);
    });
  }
}
