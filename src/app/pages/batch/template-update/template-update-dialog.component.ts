import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SortControlComponent } from '../../../components/sort-control/sort-control.component';
import { defaultSortDir, sortByCriterion, type SortSpec } from '../../../utils/batch-sort.utils';
import { FocusTrapDirective } from '../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import type { PageAnnotations } from '../../../models/annotation.model';
import type { BatchItem } from '../../../models/batch.model';
import { AnnotationImportService, emptyImportReport } from '../../../services/annotation-import.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';
import { downloadBlob } from '../../../utils/download.utils';
import {
  countMatches,
  matchTemplate,
  parsePastedTemplates,
  type PastedTemplate,
} from '../../../utils/template-paste.utils';
import { templateFileNames } from '../../../utils/template-export.utils';
import { countFields, diffTemplates, type TemplateDiff } from '../../../utils/template-update.utils';
import { createZip } from '../../../utils/zip.utils';

/** Fichero largo con muchos documentos: más margen que un JSON suelto (5 MB). */
export const MAX_UPDATE_BYTES = 20 * 1024 * 1024;

function isJsonFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json';
}

type Phase = 'closed' | 'edit' | 'confirm' | 'running' | 'done';
type RowKind = 'update' | 'new' | 'same' | 'none' | 'noPages';
type RunState = 'pending' | 'running' | 'done' | 'error' | 'untouched';

export interface UpdateRow {
  readonly item: BatchItem;
  readonly doc: PastedTemplate | null;
  readonly pages: PageAnnotations[] | null;
  readonly diff: TemplateDiff | null;
  readonly kind: RowKind;
  readonly ambiguous: boolean;
  /** Why a document without usable pages was discarded. */
  readonly why?: { pages: number; skippedPages: number; skippedFields: number };
}

export interface TemplateUpdateResult {
  readonly count: number;
  /** Templates as they were before, one per PDF. */
  readonly previous: ReadonlyArray<{ readonly id: string; readonly pages: PageAnnotations[] }>;
}

/** «Actualizar plantillas» (P-136 a P-138): reemplaza la plantilla A de varios PDF del lote desde JSON. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-template-update',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslationPipe, FocusTrapDirective, SortControlComponent],
  templateUrl: './template-update-dialog.component.html',
  styleUrl: './template-update-dialog.component.scss',
})
export class TemplateUpdateDialogComponent {
  private readonly store = inject(BatchStoreService);
  private readonly importer = inject(AnnotationImportService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  /** The dialog closed; `result` is set when templates were replaced (to offer «Deshacer todo»). */
  readonly closed = output<TemplateUpdateResult | null>();

  readonly phase = signal<Phase>('closed');
  readonly tab = signal<'files' | 'paste'>('files');
  readonly dragActive = signal(false);
  readonly pasteText = signal('');
  readonly pasteError = signal<{ line: number } | null>(null);
  readonly pasteTooBig = signal(false);
  readonly fileError = signal<string | null>(null);
  readonly backup = signal(true);
  readonly expanded = signal<string | null>(null);

  private readonly fileDocs = signal<PastedTemplate[]>([]);
  private readonly pasteDocs = signal<PastedTemplate[]>([]);
  private readonly manual = signal<Map<string, PastedTemplate>>(new Map());
  private readonly skipped = signal<Set<string>>(new Set());
  readonly runStates = signal<Map<string, RunState>>(new Map());
  readonly progress = signal({ done: 0, total: 0 });
  /** Rows being applied (a snapshot: the live plan shrinks as each row becomes «same»). */
  readonly runPlan = signal<UpdateRow[]>([]);
  readonly doneTotals = signal({ added: 0, removed: 0 });
  private cancelled = false;
  private undoList: Array<{ id: string; pages: PageAnnotations[] }> = [];

  readonly docs = computed(() => [...this.fileDocs(), ...this.pasteDocs()]);

  private readonly matching = computed(() => {
    const docs = this.docs();
    const manual = this.manual();
    const taken = new Set<PastedTemplate>(manual.values());
    const rows: UpdateRow[] = [];
    for (const item of this.store.items()) {
      const chosen = manual.get(item.id) ?? null;
      const ambiguous = !chosen && countMatches(item.name, docs, taken) > 1;
      const doc = chosen ?? matchTemplate(item.name, docs, taken);
      if (doc) {
        taken.add(doc);
      }
      if (!doc) {
        rows.push({ item, doc: null, pages: null, diff: null, kind: 'none', ambiguous: false });
        continue;
      }
      const report = emptyImportReport();
      const pages = this.importer.normalizeImportedCoordinates(doc.data, (field) => field, report);
      if (!pages || countFields(pages) === 0) {
        const raw = (doc.data as { pages?: unknown } | null)?.pages;
        const why = {
          pages: Array.isArray(raw) ? raw.length : 0,
          skippedPages: report.skippedPages,
          skippedFields: report.skippedFields,
        };
        rows.push({ item, doc, pages: null, diff: null, kind: 'noPages', ambiguous, why });
        continue;
      }
      const diff = diffTemplates(item.aPages, pages);
      const kind: RowKind = countFields(item.aPages) === 0 ? 'new' : diff.same ? 'same' : 'update';
      rows.push({ item, doc, pages, diff, kind, ambiguous });
    }
    return { rows, unused: docs.filter((doc) => !taken.has(doc)) };
  });

  readonly rows = computed(() => this.matching().rows);

  readonly sortKeys = ['name', 'result', 'fields'] as const;
  readonly sort = signal<SortSpec>({ key: 'name', dir: 'asc' });
  private readonly collator = computed(
    () => new Intl.Collator(this.i18n.language(), { numeric: true, sensitivity: 'base' }),
  );
  /** The rows as shown: by name, by result (what changes first) or by number of fields. */
  readonly sortedRows = computed(() => {
    const order: Record<RowKind, number> = { update: 4, new: 3, noPages: 2, same: 1, none: 0 };
    return sortByCriterion(this.rows(), this.sort(), this.collator(), {
      name: (row) => row.item.name,
      value: (row, key) =>
        key === 'result' ? order[row.kind] : row.pages ? countFields(row.pages) : null,
    });
  });

  setSortKey(value: string): void {
    this.sort.set({ key: value, dir: defaultSortDir(value === 'result' ? 'fields' : value) });
  }
  readonly unused = computed(() => this.matching().unused);

  /** Rows that would be replaced (not skipped by the user). */
  readonly plan = computed(() =>
    this.rows().filter(
      (row) => (row.kind === 'update' || row.kind === 'new') && !this.skipped().has(row.item.id),
    ),
  );
  readonly counts = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      update: this.plan().length,
      same: rows.filter((row) => row.kind === 'same').length,
      none: rows.filter((row) => row.kind === 'none').length,
    };
  });
  readonly totals = computed(() =>
    this.plan().reduce(
      (sum, row) => ({
        added: sum.added + (row.kind === 'new' ? row.diff!.after : row.diff!.added),
        removed: sum.removed + (row.kind === 'new' ? 0 : row.diff!.removed),
        withB: sum.withB + (row.item.bPdf ? 1 : 0),
        withMap: sum.withMap + (row.item.pageMap ? 1 : 0),
      }),
      { added: 0, removed: 0, withB: 0, withMap: 0 },
    ),
  );
  readonly allSame = computed(
    () => this.docs().length > 0 && this.counts().update === 0 && this.counts().same > 0,
  );
  readonly hasInput = computed(() => this.docs().length > 0);

  open(): void {
    this.fileDocs.set([]);
    this.pasteDocs.set([]);
    this.manual.set(new Map());
    this.skipped.set(new Set());
    this.runStates.set(new Map());
    this.pasteText.set('');
    this.pasteError.set(null);
    this.pasteTooBig.set(false);
    this.fileError.set(null);
    this.expanded.set(null);
    this.backup.set(true);
    this.tab.set('files');
    this.phase.set('edit');
  }

  /** Se abre con unos JSON ya cargados (soltados en «Entrada» del panel). */
  async openWith(files: readonly File[]): Promise<void> {
    this.open();
    await this.addFiles([...files]);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    const phase = this.phase();
    if (phase === 'closed') {
      return;
    }
    event.preventDefault();
    if (phase === 'running') {
      this.cancelled = true;
    } else if (phase === 'confirm') {
      this.phase.set('edit');
    } else {
      this.close();
    }
  }

  close(): void {
    const result = this.phase() === 'done' && this.undoList.length ? this.result() : null;
    this.phase.set('closed');
    this.closed.emit(result);
  }

  private result(): TemplateUpdateResult {
    return { count: this.undoList.length, previous: [...this.undoList] };
  }

  // ---- input ------------------------------------------------------------------------------

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addFiles(files);
  }

  private async addFiles(files: File[]): Promise<void> {
    this.fileError.set(null);
    const next = [...this.fileDocs()];
    for (const file of files) {
      if (!isJsonFile(file) || file.size > MAX_UPDATE_BYTES) {
        this.fileError.set(file.name);
        continue;
      }
      const { templates, error } = parsePastedTemplates(await file.text());
      if (error || templates.length === 0) {
        this.fileError.set(file.name);
        continue;
      }
      for (const template of templates) {
        // Un JSON por PDF: sin nombres propios, vale el nombre del archivo (factura.json → factura.pdf).
        next.push(
          template.pdfName || template.name || template.fileName
            ? template
            : { ...template, fileName: file.name, label: file.name },
        );
      }
    }
    this.fileDocs.set(next);
  }

  matchPasted(): void {
    const raw = this.pasteText();
    this.pasteError.set(null);
    this.pasteTooBig.set(raw.length > MAX_UPDATE_BYTES);
    if (raw.length > MAX_UPDATE_BYTES) {
      return;
    }
    const { templates, error } = parsePastedTemplates(raw);
    if (error) {
      this.pasteError.set({ line: error.line });
      return;
    }
    this.pasteDocs.set(templates);
    this.manual.set(new Map());
  }

  clearPasted(): void {
    this.pasteText.set('');
    this.pasteDocs.set([]);
    this.pasteError.set(null);
    this.pasteTooBig.set(false);
    this.manual.set(new Map());
  }

  assign(row: UpdateRow, index: string): void {
    const chosen = this.unused()[Number(index)];
    if (!chosen) {
      return;
    }
    const next = new Map(this.manual());
    next.set(row.item.id, chosen);
    this.manual.set(next);
  }

  isSkipped(row: UpdateRow): boolean {
    return this.skipped().has(row.item.id);
  }

  toggleSkip(row: UpdateRow): void {
    const next = new Set(this.skipped());
    if (!next.delete(row.item.id)) {
      next.add(row.item.id);
    }
    this.skipped.set(next);
  }

  toggleExpanded(row: UpdateRow): void {
    this.expanded.set(this.expanded() === row.item.id ? null : row.item.id);
  }

  chipClass(row: UpdateRow): string {
    if (this.isSkipped(row)) {
      return '';
    }
    switch (row.kind) {
      case 'update':
        return row.diff && row.diff.removed > 0 ? 'warn' : 'ok';
      case 'new':
        return 'ok';
      case 'noPages':
        return 'bad';
      default:
        return '';
    }
  }

  // ---- apply ------------------------------------------------------------------------------

  toConfirm(): void {
    if (this.plan().length > 0) {
      this.phase.set('confirm');
    }
  }

  backToEdit(): void {
    this.phase.set('edit');
  }

  async apply(): Promise<void> {
    const plan = [...this.plan()];
    if (!plan.length) {
      return;
    }
    this.runPlan.set(plan);
    this.doneTotals.set({ added: 0, removed: 0 });
    if (this.backup()) {
      this.downloadBackup(plan);
    }
    this.cancelled = false;
    this.undoList = [];
    this.progress.set({ done: 0, total: plan.length });
    this.runStates.set(new Map(plan.map((row) => [row.item.id, 'pending' as RunState])));
    this.phase.set('running');
    let done = 0;
    for (const row of plan) {
      if (this.cancelled) {
        this.setRun(row.item.id, 'untouched');
        continue;
      }
      this.setRun(row.item.id, 'running');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        const previous = this.store.find(row.item.id)?.aPages ?? row.item.aPages;
        this.store.setTemplate(row.item.id, row.pages as PageAnnotations[]);
        this.undoList.push({ id: row.item.id, pages: previous });
        const t = this.doneTotals();
        this.doneTotals.set({
          added: t.added + (row.kind === 'new' ? row.diff!.after : row.diff!.added),
          removed: t.removed + (row.kind === 'new' ? 0 : row.diff!.removed),
        });
        this.setRun(row.item.id, 'done');
      } catch {
        this.setRun(row.item.id, 'error');
      }
      done++;
      this.progress.set({ done, total: plan.length });
    }
    this.phase.set('done');
  }

  cancelRun(): void {
    this.cancelled = true;
  }

  private setRun(id: string, state: RunState): void {
    const next = new Map(this.runStates());
    next.set(id, state);
    this.runStates.set(next);
  }

  private downloadBackup(plan: readonly UpdateRow[]): void {
    const withA = plan.filter((row) => row.item.aPages.length > 0);
    if (!withA.length) {
      return;
    }
    const names = templateFileNames(
      withA.map((row) => ({ name: row.item.name.replace(/\.[^./\\]+$/, '') })),
    );
    const encoder = new TextEncoder();
    const zip = createZip(
      withA.map((row, i) => ({
        name: names[i],
        data: encoder.encode(JSON.stringify({ pages: row.item.aPages }, null, 2)),
      })),
    );
    downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), 'plantillas-antes.zip');
    this.toast.show(this.i18n.translate('batch.upd.backupDone', { count: withA.length }));
  }

  runState(row: UpdateRow): RunState {
    return this.runStates().get(row.item.id) ?? 'pending';
  }

  doneCount(): number {
    return [...this.runStates().values()].filter((state) => state === 'done').length;
  }

  untouchedCount(): number {
    return [...this.runStates().values()].filter((state) => state === 'untouched').length;
  }

  failedCount(): number {
    return [...this.runStates().values()].filter((state) => state === 'error').length;
  }
}
