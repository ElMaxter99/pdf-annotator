import { prepareFieldForForm, prepareFieldForStorage } from '../../utils/field-style.utils';
import { AiRequestError, type AiProvider } from '../../services/ai-helper.service';
import { confidenceLevel, isRowSelected, rowChangesPage, summarizeAi, type AiRow } from '../../utils/ai-proposal.utils';
import { effectiveAiInstructions } from '../../utils/ai-instructions.utils';
import { signal } from '@angular/core';
import { PageAnnotations, PageField } from '../../models/annotation.model';
import { extendPagePattern } from '../../utils/page-pattern.utils';
import { aiProposalField, aiTemplateMap, loadingAiSession, savedAiSession, withAiRowEdit, withAiEvent, withAiProgress, type AiSession } from '../../utils/ai-session.utils';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * «Copiar y adaptar con IA» en el editor: pedir la propuesta, revisarla (también editable en B), aplicarla o descartarla.
 * Métodos de `WorkspacePageComponent` (se le añaden con `applyMixins` en workspace.page.ts; `this` es la página).
 */
export class WorkspaceAi {

  // ---- «Copiar y adaptar con IA» -----------------------------------------------------------------

  /** Opens the chip panel and checks the helper again. */
  openAiPanel(this: WorkspacePageComponent): void {
    this.aiPanelOpen.set(true);
    void this.aiHelper.check();
  }

  /** Entry from «Poner plantilla A ▾»: asks for consent once, then sends A and B to the helper. */
  async startAi(this: WorkspacePageComponent): Promise<void> {
    const item = this.batch.activeItem();
    if (!item?.bPdf || !this.migration() || this.templateFieldsA() === 0) {
      return;
    }
    if (this.aiHelper.connection() !== 'ready') {
      await this.aiHelper.check();
      if (this.aiHelper.connection() !== 'ready') {
        this.openAiPanel();
        return;
      }
    }
    if (!this.aiHelper.consent()) {
      this.aiConsentOpen.set(true);
      return;
    }
    await this.runAi(item.aPdf, item.bPdf);
  }

  confirmAiConsent(this: WorkspacePageComponent, remember: boolean): void {
    this.aiHelper.acceptConsent(remember);
    this.aiConsentOpen.set(false);
    void this.startAi();
  }

  async runAi(this: WorkspacePageComponent, aPdf: Blob, bPdf: Blob): Promise<void> {
    this.cancelAdjust();
    this.aiAbort?.abort();
    const abort = new AbortController();
    this.aiAbort = abort;
    const template = this.normalizedTemplateOfA();
    this.aiTemplate = aiTemplateMap(template);
    this.ai.set(loadingAiSession(this.aiHelper.provider(), Date.now()));
    this.reopenNotice('ai');
    if (this.referenceMode() !== 'split') {
      this.aiPreviousMode = this.referenceMode();
      await this.setReferenceMode('split');
    }
    try {
      const result = await this.aiHelper.propose(
        {
          a: aPdf,
          b: bPdf,
          template: { pages: template, pageMap: this.pageMap()?.pairs },
          instructions: effectiveAiInstructions(this.batch.activeItem(), this.batch.aiInstructions()),
        },
        (progress) =>
          this.ai.update((cur) => (cur ? withAiProgress(cur, progress, Date.now()) : cur)),
        abort.signal,
        (event) => this.ai.update((cur) => (cur ? withAiEvent(cur, event, Date.now()) : cur)),
      );
      if (abort !== this.aiAbort) {
        return;
      }
      const rows = this.withPagePatterns(result.rows, template);
      const placed = rows.filter((row) => row.ok).length;
      this.patchAi({
        phase: placed === 0 ? 'empty' : 'ready',
        rows,
        seconds: result.seconds,
        details: result.details,
        endedAt: Date.now(),
      });
    } catch (error) {
      if (abort !== this.aiAbort || (error as AiRequestError)?.code === 'aborted') {
        return;
      }
      const e = error as AiRequestError;
      this.patchAi({
        phase: 'error',
        endedAt: Date.now(),
        error: { code: e.code ?? 'error', message: String(e.message ?? e), reset: e.reset ?? null },
        details: e.details ?? null,
      });
    }
    this.redrawAllForPage();
  }

  /**
   * Campos repetidos en el mismo sitio de cada página de A (número de página…): la propuesta los completa para cada
   * página de B sin IA (`utils/page-pattern.utils.ts`); los campos nuevos de las páginas extra entran en `aiTemplate`.
   */
  withPagePatterns(this: WorkspacePageComponent, rows: AiRow[], template: PageAnnotations[]): AiRow[] {
    const extended = extendPagePattern(rows, template, this.pdfDoc()?.numPages ?? 0);
    for (const [id, field] of extended.extra) {
      this.aiTemplate.set(id, field);
    }
    return extended.rows;
  }

  patchAi(this: WorkspacePageComponent, patch: Partial<AiSession>): void {
    this.ai.update((current) => (current ? { ...current, ...patch } : current));
    this.redrawAllForPage();
  }

  cancelAi(this: WorkspacePageComponent): void {
    if (this.editing()?.aiRowId) {
      this.editing.set(null);
    }
    this.aiAbort?.abort();
    this.aiAbort = null;
    this.ai.set(null);
    this.holdingOriginal.set(false);
    this.reopenNotice('ai');
    const previous = this.aiPreviousMode;
    this.aiPreviousMode = null;
    if (previous) {
      void this.setReferenceMode(previous);
    } else {
      this.redrawAllForPage();
    }
  }

  /** Opens the proposal that the batch queue saved for this PDF, ready to review (nothing is asked again). */
  async loadSavedAi(this: WorkspacePageComponent): Promise<void> {
    const item = this.batch.activeItem();
    const saved = item?.aiProposal;
    if (!item || !saved || !item.bPdf || !this.migration()) {
      return;
    }
    this.cancelAi();
    const template = this.normalizedTemplateOfA();
    this.aiTemplate = aiTemplateMap(template);
    const rows = this.withPagePatterns(
      saved.rows.filter((row) => this.aiTemplate.has(row.id)),
      template,
    );
    if (!rows.length) {
      this.batch.setAiProposal(item.id, undefined);
      return;
    }
    this.ai.set(savedAiSession(saved, rows));
    this.reopenNotice('ai');
    if (this.referenceMode() !== 'split') {
      this.aiPreviousMode = this.referenceMode();
      await this.setReferenceMode('split');
    }
    this.redrawAllForPage();
  }

  /** Drops the proposal saved by the queue for this PDF and closes the review. */
  discardAi(this: WorkspacePageComponent): void {
    const id = this.batch.activeItem()?.id;
    this.cancelAi();
    if (id) {
      this.batch.setAiProposal(id, undefined);
    }
  }

  /** Jumps to the next PDF (after this one, wrapping around) that has a proposal waiting. */
  async goNextWithProposal(this: WorkspacePageComponent): Promise<void> {
    const items = this.batch.items();
    const at = items.findIndex((item) => item.id === this.batch.activeId());
    const ordered = [...items.slice(at + 1), ...items.slice(0, Math.max(0, at))];
    const target = ordered.find((item) => item.aiProposal);
    if (target) {
      await this.switchBatchItem(target);
    }
  }

  /** After an error: the same request again, or the same one with the other provider. */
  async retryAi(this: WorkspacePageComponent, provider?: AiProvider): Promise<void> {
    if (provider) {
      this.aiHelper.setProvider(provider);
    }
    this.cancelAi();
    await this.aiHelper.check();
    await this.startAi();
  }

  /** The text-based adjustment as the way out when the AI cannot help. */
  useAdjustInstead(this: WorkspacePageComponent): void {
    this.cancelAi();
    void this.startAdjust();
  }

  setAiDetailsOpen(this: WorkspacePageComponent, open: boolean): void {
    this.ai.update((cur) => (cur ? { ...cur, detailsOpen: open } : cur));
  }

  setAiView(this: WorkspacePageComponent, view: 'proposal' | 'original'): void {
    this.patchAi({ view });
  }

  /** The proposal strip is docked under the viewer while it is showing (it reserves its own row). */
  aiDockVisible(this: WorkspacePageComponent): boolean {
    return this.ai() !== null && !this.isNoticeClosed('ai');
  }

  /** Fields the AI proposal places (for the badge of the «Anotaciones» tab); 0 when no proposal is waiting. */
  aiProposedCount(this: WorkspacePageComponent): number {
    const session = this.ai();
    return session && session.phase === 'ready' ? session.rows.filter((row) => row.ok).length : 0;
  }

  /** «Revisar campos»: the list of the proposal lives in «Anotaciones»; opens the tab and focuses what needs a look. */
  reviewAiFields(this: WorkspacePageComponent): void {
    this.setSidebarMinimized(false);
    this.setSidebarTab('annotations');
    this.runAfterRender(() => {
      const target =
        this.document?.querySelector<HTMLElement>('[data-ai-review-first]') ??
        this.document?.querySelector<HTMLElement>('[data-testid="ai-proposal"]');
      target?.scrollIntoView?.({ block: 'nearest' });
      target?.focus?.();
    });
  }

  /** «Marcar las altas» / «Quitar todas»: replaces the ticks of the proposal in one go. */
  setAiSelection(this: WorkspacePageComponent, mode: 'high' | 'none'): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    const overrides: Record<string, boolean> = {};
    for (const row of session.rows) {
      if (row.ok) {
        overrides[row.id] = mode === 'high' && confidenceLevel(row.confidence) === 'high';
      }
    }
    this.patchAi({ overrides });
  }

  toggleAiRow(this: WorkspacePageComponent, row: AiRow): void {
    const session = this.ai();
    if (!session || !row.ok) {
      return;
    }
    const overrides = new Map(Object.entries(session.overrides));
    const next = !isRowSelected(row, overrides);
    this.patchAi({ overrides: { ...session.overrides, [row.id]: next } });
  }

  aiOverrides(this: WorkspacePageComponent): ReadonlyMap<string, boolean> {
    return new Map(Object.entries(this.ai()?.overrides ?? {}));
  }

  aiSummary(this: WorkspacePageComponent) {
    return summarizeAi(this.ai()?.rows ?? [], this.aiOverrides());
  }

  aiFieldName(this: WorkspacePageComponent, row: AiRow): string {
    const field = this.ai()?.edits[row.id] ?? this.aiTemplate.get(row.id);
    return (field?.mapField || field?.value || '').toString().trim() || '—';
  }

  /** Goes to the page of B where a field lands. */
  goToAiRow(this: WorkspacePageComponent, row: AiRow): void {
    if (row.ok && row.newPage >= 1 && row.newPage <= (this.pdfDoc()?.numPages ?? 1)) {
      void this.setPageIndex(row.newPage);
    }
  }

  applyAi(this: WorkspacePageComponent): void {
    const session = this.ai();
    if (!session || session.phase !== 'ready') {
      return;
    }
    const overrides = this.aiOverrides();
    const toAdd: Array<{ page: number; field: PageField }> = [];
    let moved = 0;
    for (const row of session.rows) {
      const field = this.aiTemplate.get(row.id);
      if (!field || !isRowSelected(row, overrides)) {
        continue;
      }
      if (rowChangesPage(row)) {
        moved += 1;
      }
      const edited = session.edits[row.id];
      const target = edited ? this.prepareFieldForStorage(aiProposalField(field, row, edited)) : aiProposalField(field, row);
      toAdd.push({
        page: row.newPage,
        field: {
          ...target,
          x: Math.max(0, Math.round(Number(target.x) * 100) / 100),
          y: Math.max(0, Math.round(Number(target.y) * 100) / 100),
        },
      });
    }
    this.insertFields(toAdd);
    const count = toAdd.length;
    const savedFor = session.saved ? this.batch.activeItem()?.id : undefined;
    this.cancelAi();
    if (savedFor) {
      this.batch.setAiProposal(savedFor, undefined);
    }
    this.toast.show(this.translationService.translate('toast.batch.aiApplied', { count, moved }));
  }

  drawAiPreview(this: WorkspacePageComponent, layer: HTMLElement, canvasHeight: number): void {
    const session = this.ai();
    if (!session || session.phase !== 'ready' || session.view === 'original') {
      return;
    }
    const page = this.pageIndex();
    const overrides = this.aiOverrides();
    layer.classList.add('reference-layer--interactive');
    for (const row of session.rows) {
      const base = this.aiTemplate.get(row.id);
      if (!base || !row.ok || row.newPage !== page) {
        continue;
      }
      const field = aiProposalField(base, row, session.edits[row.id]);
      const name = (field.mapField || field.value || '').toString();
      this.drawReferenceField(layer, canvasHeight, name, Number(field.x), Number(field.y), field.fontSize, false, false);
      const el = layer.lastElementChild as HTMLElement | null;
      if (el) {
        // Editable before applying: hover, click opens the editor, drag moves it (all of it stays in the proposal).
        el.classList.add('reference-field--editable');
        el.classList.toggle('reference-field--edited', !!session.edits[row.id]);
        el.title = this.translationService.translate('ai.proposal.editHint', {
          name: name || '—',
          level: this.translationService.translate(`ai.confidence.${confidenceLevel(row.confidence)}`),
        });
        el.setAttribute('data-testid', 'ai-proposal-field');
        el.addEventListener('pointerdown', (event) => this.onAiProposalPointerDown(event, row.id, el));
        const selected = isRowSelected(row, overrides);
        el.classList.add(
          selected
            ? confidenceLevel(row.confidence) === 'high'
              ? 'reference-field--proposal'
              : 'reference-field--estimated'
            : 'reference-field--grey',
        );
        el.dataset['aiId'] = row.id;
      }
    }
  }

  /** The field a proposal row would create (with its edits), or null if the row has no place in B. */
  aiRowField(this: WorkspacePageComponent, rowId: string): PageField | null {
    const session = this.ai();
    const row = session?.rows.find((r) => r.id === rowId);
    const base = this.aiTemplate.get(rowId);
    return session && row?.ok && base ? aiProposalField(base, row, session.edits[rowId]) : null;
  }

  /** The proposed field was edited before applying (editor or drag). */
  aiRowEdited(this: WorkspacePageComponent, row: AiRow): boolean {
    return !!this.ai()?.edits[row.id];
  }

  /** Editing a field of the proposal (the editor then saves into the proposal, not into B). */
  editingAiRow(this: WorkspacePageComponent): boolean {
    return !!this.editing()?.aiRowId;
  }

  /** Keeps an edit of a proposed field (and the saved copy of the batch proposal, if it came from there). */
  saveAiRowEdit(this: WorkspacePageComponent, rowId: string, field: PageField): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    this.ai.set(withAiRowEdit(session, rowId, field));
    this.persistAiEdits();
    this.redrawAllForPage();
  }

  persistAiEdits(this: WorkspacePageComponent): void {
    const session = this.ai();
    const item = this.batch.activeItem();
    if (!session?.saved || !item?.aiProposal) {
      return;
    }
    this.batch.setAiProposal(item.id, { ...item.aiProposal, edits: { ...session.edits } });
  }

  /** Pointer down on a proposed field in B: a click opens the editor; a drag moves it (Esc cancels the drag). */
  onAiProposalPointerDown(this: WorkspacePageComponent, event: PointerEvent, rowId: string, el: HTMLElement): void {
    if (event.button !== 0 || this.panReady()) {
      return;
    }
    const start = this.aiRowField(rowId);
    if (!start) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const doc = this.document;
    const x0 = event.clientX;
    const y0 = event.clientY;
    const left0 = parseFloat(el.style.left) || 0;
    const top0 = parseFloat(el.style.top) || 0;
    let dragging = false;
    let cancelled = false;
    const scale = this.scale();
    el.classList.add('reference-field--active');
    const move = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!dragging && Math.hypot(dx, dy) < 4) {
        return;
      }
      dragging = true;
      el.classList.add('reference-field--dragging');
      el.style.left = `${left0 + dx}px`;
      el.style.top = `${top0 + dy}px`;
    };
    const finish = (e: PointerEvent | null) => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      doc.removeEventListener('pointercancel', cancel);
      doc.removeEventListener('keydown', key, true);
      el.classList.remove('reference-field--active', 'reference-field--dragging');
      if (cancelled || !e) {
        this.redrawAllForPage();
        return;
      }
      if (dragging) {
        const x = Math.max(0, Math.round((Number(start.x) + (e.clientX - x0) / scale) * 100) / 100);
        const y = Math.max(0, Math.round((Number(start.y) - (e.clientY - y0) / scale) * 100) / 100);
        this.saveAiRowEdit(rowId, { ...start, x, y });
        return;
      }
      this.openAiRowEditor(rowId);
    };
    const up = (e: PointerEvent) => finish(e);
    const cancel = () => {
      cancelled = true;
      finish(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
    doc.addEventListener('pointercancel', cancel);
    doc.addEventListener('keydown', key, true);
  }

  /** Opens the annotation editor on a proposed field; saving keeps the change in the proposal. */
  openAiRowEditor(this: WorkspacePageComponent, rowId: string): void {
    const field = this.aiRowField(rowId);
    if (!field) {
      return;
    }
    this.preview.set(null);
    const formField = this.prepareFieldForForm(this.prepareFieldForStorage(field));
    this.editing.set({ pageIndex: -1, fieldIndex: -1, field: formField, aiRowId: rowId });
    this.updateEditingColorState(formField.color);
  }
}
