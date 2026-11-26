import { areFieldsEqual } from '../../utils/field-style.utils';
import { addFieldToPages } from '../../utils/annotation-pages.utils';
import { AiRequestError, type AiProvider } from '../../services/ai-helper.service';
import {
  confidenceLevel,
  proposalGroup,
  isRowSelected,
  rowChangesPage,
  summarizeAi,
  type AiRow,
} from '../../utils/ai-proposal.utils';
import { effectiveAiInstructions } from '../../utils/ai-instructions.utils';
import { signal } from '@angular/core';
import { PageAnnotations, PageField } from '../../models/annotation.model';
import { extendPagePattern } from '../../utils/page-pattern.utils';
import {
  aiProposalField,
  aiTemplateMap,
  loadingAiSession,
  savedAiSession,
  withAiEvent,
  withAiProgress,
  type AiSession,
} from '../../utils/ai-session.utils';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * «Copiar y adaptar con IA» en el editor: pedir la propuesta, revisarla (también editable en B), aplicarla o descartarla.
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
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
          instructions: effectiveAiInstructions(
            this.batch.activeItem(),
            this.batch.aiInstructions(),
          ),
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
      if (placed > 0) {
        this.aiWriteDefault();
      }
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
  withPagePatterns(
    this: WorkspacePageComponent,
    rows: AiRow[],
    template: PageAnnotations[],
  ): AiRow[] {
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
    // La propuesta guardada se escribe en B al abrirla (un paso de historial) y deja de estar guardada en el lote.
    this.aiWriteDefault();
    this.batch.setAiProposal(item.id, undefined);
    this.reopenNotice('ai');
    if (this.referenceMode() !== 'split') {
      this.aiPreviousMode = this.referenceMode();
      await this.setReferenceMode('split');
    }
    this.redrawAllForPage();
  }

  /** «Descartar»: quita de B lo que escribió la IA (un paso de historial, Ctrl+Z lo devuelve) y cierra la revisión. */
  discardAi(this: WorkspacePageComponent): void {
    const id = this.batch.activeItem()?.id;
    this.aiSetWritten(new Set());
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

  /** «Marcar las altas» / «Quitar todas»: escribe o quita de B las filas en un solo paso de historial. */
  setAiSelection(this: WorkspacePageComponent, mode: 'high' | 'none'): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    const desired = new Set<string>();
    if (mode === 'high') {
      for (const row of session.rows) {
        // «Marcar solo los seguros»: los de A colocados con confianza alta (no los nuevos en B ni los dudosos).
        if (row.ok && proposalGroup(row) === 'ready') {
          desired.add(row.id);
        }
      }
    }
    this.aiUnforget(desired);
    this.aiSetWritten(desired);
  }

  /**
   * Campos de la propuesta borrados de B a mano (editor «Eliminar» o Supr con selección): la fila queda descartada y
   * no deja su fantasma gris, como una opción de la IA que no se quiere. Marcarla otra vez en la lista la recupera.
   */
  aiForgetDeleted(this: WorkspacePageComponent, fields: readonly PageField[]): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    const prefix = `${session.startedAt}:`;
    const ids = fields
      .map((field) => field.aiId)
      .filter((id): id is string => typeof id === 'string' && id.startsWith(prefix))
      .map((id) => id.slice(prefix.length));
    if (!ids.length) {
      return;
    }
    const removed = { ...(session.removed ?? {}) };
    for (const id of ids) removed[id] = true;
    this.ai.set({ ...session, removed });
  }

  /** Volver a marcar o desmarcar desde la lista deshace el «descartado»: vuelve a verse (escrita o en gris). */
  aiUnforget(this: WorkspacePageComponent, ids: Iterable<string>): void {
    const session = this.ai();
    if (!session?.removed) {
      return;
    }
    const removed = { ...session.removed };
    let changed = false;
    for (const id of ids) {
      if (removed[id]) {
        delete removed[id];
        changed = true;
      }
    }
    if (changed) {
      this.ai.set({ ...session, removed });
    }
  }

  /** Marcar una fila la escribe en B; desmarcarla la quita de B (un paso de historial cada vez). */
  toggleAiRow(this: WorkspacePageComponent, row: AiRow): void {
    const session = this.ai();
    if (!session || !row.ok) {
      return;
    }
    this.aiUnforget([row.id]);
    const desired = this.aiWrittenRowIds();
    if (desired.has(row.id)) {
      desired.delete(row.id);
    } else {
      desired.add(row.id);
    }
    this.aiSetWritten(desired);
  }

  /** Marca interna del campo de una fila en B para esta revisión (otra revisión nunca la reconoce). */
  aiTag(this: WorkspacePageComponent, rowId: string): string {
    return `${this.ai()?.startedAt ?? 0}:${rowId}`;
  }

  /** Dónde está ahora en B el campo de una fila (null si no está escrito: desmarcado, quitado o deshecho). */
  aiWrittenRef(
    this: WorkspacePageComponent,
    rowId: string,
  ): { pageIndex: number; index: number; page: number; field: PageField } | null {
    const tag = this.aiTag(rowId);
    const pages = this.coords();
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const index = pages[pageIndex].fields.findIndex((field) => field.aiId === tag);
      if (index >= 0) {
        return { pageIndex, index, page: pages[pageIndex].num, field: pages[pageIndex].fields[index] };
      }
    }
    return null;
  }

  /** Filas de la propuesta cuyo campo está escrito en B ahora mismo. */
  aiWrittenRowIds(this: WorkspacePageComponent): Set<string> {
    const session = this.ai();
    const out = new Set<string>();
    if (!session) {
      return out;
    }
    const tags = this.aiWrittenTags();
    for (const row of session.rows) {
      if (row.ok && tags.has(this.aiTag(row.id))) {
        out.add(row.id);
      }
    }
    return out;
  }

  /** El campo que una fila escribe en B: el de A con su posición (y los cambios guardados del lote), con su marca. */
  aiBuildField(this: WorkspacePageComponent, row: AiRow): PageField | null {
    const base = this.aiTemplate.get(row.id);
    if (!base) {
      return null;
    }
    const edited = this.ai()?.edits[row.id];
    const target = edited
      ? this.prepareFieldForStorage(aiProposalField(base, row, edited))
      : aiProposalField(base, row);
    return {
      ...target,
      x: Math.max(0, Math.round(Number(target.x) * 100) / 100),
      y: Math.max(0, Math.round(Number(target.y) * 100) / 100),
      aiId: this.aiTag(row.id),
    };
  }

  /** Escribe en B la selección de partida (las filas colocadas y marcadas) en un solo paso de historial. */
  aiWriteDefault(this: WorkspacePageComponent): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    const overrides = new Map(Object.entries(session.overrides));
    const desired = new Set<string>();
    for (const row of session.rows) {
      if (row.ok && isRowSelected(row, overrides)) {
        desired.add(row.id);
      }
    }
    this.aiSetWritten(desired);
  }

  /** Deja escritas en B exactamente las filas pedidas: añade las que faltan y quita las que sobran (un paso de historial). */
  aiSetWritten(this: WorkspacePageComponent, desired: ReadonlySet<string>): void {
    const session = this.ai();
    if (!session) {
      return;
    }
    const tags = this.aiWrittenTags();
    const remove = new Set<string>();
    const add: AiRow[] = [];
    for (const row of session.rows) {
      if (!row.ok || !this.aiTemplate.has(row.id)) {
        continue;
      }
      const tag = this.aiTag(row.id);
      const written = tags.has(tag);
      const wanted = desired.has(row.id);
      if (written && !wanted) {
        remove.add(tag);
      } else if (!written && wanted) {
        add.push(row);
      }
    }
    if (!remove.size && !add.length) {
      return;
    }
    this.dismissEditors();
    const changed = this.applyCoordsChange(() => {
      let pages = this.coords();
      if (remove.size) {
        pages = pages
          .map((page) => ({
            ...page,
            fields: page.fields.filter((field) => !(field.aiId && remove.has(field.aiId))),
          }))
          .filter((page) => page.fields.length > 0);
      }
      for (const row of add) {
        const field = this.aiBuildField(row);
        if (field) {
          pages = addFieldToPages(row.newPage, field, pages);
        }
      }
      this.coords.set(pages);
    });
    if (changed) {
      this.selection.set(null);
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
  }

  /** Marcas de los campos de B que escribió una propuesta. */
  aiWrittenTags(this: WorkspacePageComponent): Set<string> {
    const tags = new Set<string>();
    for (const page of this.coords()) {
      for (const field of page.fields) {
        if (field.aiId) {
          tags.add(field.aiId);
        }
      }
    }
    return tags;
  }

  /** Para cada fila colocada: ¿está escrita en B? (lo que marca la casilla). */
  aiOverrides(this: WorkspacePageComponent): ReadonlyMap<string, boolean> {
    const session = this.ai();
    const out = new Map<string, boolean>();
    if (!session) {
      return out;
    }
    const tags = this.aiWrittenTags();
    for (const row of session.rows) {
      if (row.ok) {
        out.set(row.id, tags.has(this.aiTag(row.id)));
      }
    }
    return out;
  }

  aiSummary(this: WorkspacePageComponent) {
    return summarizeAi(this.ai()?.rows ?? [], this.aiOverrides());
  }

  aiFieldName(this: WorkspacePageComponent, row: AiRow): string {
    const field =
      this.aiWrittenRef(row.id)?.field ?? this.ai()?.edits[row.id] ?? this.aiTemplate.get(row.id);
    return (field?.mapField || field?.value || '').toString().trim() || '—';
  }

  /** Goes to the page of B where a field lands. */
  goToAiRow(this: WorkspacePageComponent, row: AiRow): void {
    if (row.ok && row.newPage >= 1 && row.newPage <= (this.pdfDoc()?.numPages ?? 1)) {
      void this.setPageIndex(row.newPage);
    }
  }

  /** «Dar por buena»: la propuesta ya está en B; solo se cierra la revisión (y se borra la copia guardada del lote). */
  applyAi(this: WorkspacePageComponent): void {
    const session = this.ai();
    if (!session || session.phase !== 'ready') {
      return;
    }
    const written = this.aiWrittenRowIds();
    let moved = 0;
    for (const row of session.rows) {
      if (written.has(row.id) && rowChangesPage(row)) {
        moved += 1;
      }
    }
    const savedFor = session.saved ? this.batch.activeItem()?.id : undefined;
    this.cancelAi();
    if (savedFor) {
      this.batch.setAiProposal(savedFor, undefined);
    }
    this.toast.show(
      this.translationService.translate('toast.batch.aiApplied', { count: written.size, moved }),
    );
  }

  /** Las filas que no están en B (desmarcadas, quitadas o deshechas) se ven en gris; un clic las vuelve a poner. */
  drawAiPreview(this: WorkspacePageComponent, layer: HTMLElement, canvasHeight: number): void {
    const session = this.ai();
    if (!session || session.phase !== 'ready' || session.view === 'original') {
      return;
    }
    const page = this.pageIndex();
    const tags = this.aiWrittenTags();
    for (const row of session.rows) {
      const base = this.aiTemplate.get(row.id);
      if (
        !base ||
        !row.ok ||
        row.newPage !== page ||
        tags.has(this.aiTag(row.id)) ||
        session.removed?.[row.id]
      ) {
        continue;
      }
      const field = aiProposalField(base, row, session.edits[row.id]);
      const name = (field.mapField || field.value || '').toString();
      this.drawReferenceField(
        layer,
        canvasHeight,
        name,
        Number(field.x),
        Number(field.y),
        field.fontSize,
        false,
        false,
      );
      const el = layer.lastElementChild as HTMLElement | null;
      if (el) {
        layer.classList.add('reference-layer--interactive');
        el.classList.add('reference-field--editable', 'reference-field--grey');
        el.title = this.translationService.translate('ai.proposal.ghostHint', { name: name || '—' });
        el.setAttribute('data-testid', 'ai-proposal-field');
        el.addEventListener('pointerdown', (event) => {
          if (event.button !== 0 || this.panReady()) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          this.toggleAiRow(row);
        });
        el.dataset['aiId'] = row.id;
      }
    }
  }

  /** El campo escrito de la fila cambió respecto a lo que escribió la propuesta (movido o editado). */
  aiRowEdited(this: WorkspacePageComponent, row: AiRow): boolean {
    const written = this.aiWrittenRef(row.id)?.field;
    const built = this.aiBuildField(row);
    return (
      !!written &&
      !!built &&
      !areFieldsEqual(written, built, (f) => this.fontCatalog.normalizeFontFamily(f))
    );
  }
}
