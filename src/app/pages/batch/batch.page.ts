import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { APP_NAME } from '../../app-version';
import { AiBatchButtonComponent } from './ai-batch/ai-batch-button.component';
import { AiBatchChipComponent } from './ai-batch/ai-batch-chip.component';
import { AiBatchPanelComponent } from './ai-batch/ai-batch-panel.component';
import { AiBatchService } from '../../services/ai-batch.service';
import { AiHelperService } from '../../services/ai-helper.service';
import { InfoTipComponent } from '../../components/info-tip/info-tip.component';
import { PdfThumbComponent } from '../../components/pdf-thumb/pdf-thumb.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { VersionChipComponent } from '../../components/version-chip/version-chip.component';
import { TranslationService } from '../../i18n/translation.service';
import type { PageAnnotations } from '../../models/annotation.model';
import type { BatchItem } from '../../models/batch.model';
import { AnnotationImportService } from '../../services/annotation-import.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { ProjectStoreService } from '../../services/project-store.service';
import { BatchStoreService } from '../../services/batch-store.service';
import { MAX_TEST_DATA_BYTES, PreviewSettingsService } from '../../services/preview-settings.service';
import { PendingFileService } from '../../services/pending-file.service';
import { ToastService } from '../../services/toast.service';
import { BATCH_ITEM_PARAM, BATCH_OPEN_VIEW, batchItemOpening } from '../../utils/batch-open.utils';
import { downloadBlob } from '../../utils/download.utils';
import { parseLooseJson } from '../../utils/loose-json';
import { pairByName, pairingKey } from '../../utils/migration.utils';
import {
  matchTemplate,
  parsePastedTemplates,
  type PastedTemplate,
} from '../../utils/template-paste.utils';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { buildFunnel, matchesKind, aiReasonOf, type AiReason, type KindFilter } from '../../utils/batch-summary.utils';
import { planBulk, pruneSelection, rangeBetween } from '../../utils/batch-selection.utils';
import { createZip } from '../../utils/zip.utils';

const MAX_JSON_BYTES = 5 * 1024 * 1024;

type RowState = 'ready' | 'review' | 'noTemplate';
type Step = 'pdfs' | 'templates' | 'panel';
type ViewMode = 'grid' | 'list';
type Filter = 'all' | 'review' | 'ready';

interface TemplateInfo {
  readonly name: string;
  readonly pages: PageAnnotations[];
  readonly count: number;
  readonly error: 'json' | 'noPages' | null;
}

const VIEW_KEY = 'pdf-annotator.batch.view';

interface Row {
  readonly item: BatchItem;
  readonly state: RowState;
}

function isJsonFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json';
}

async function sha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  }
}

/** Batch tray: every PDF to migrate, with what is still missing for each. */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-batch-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslationPipe,
    VersionChipComponent,
    PdfThumbComponent,
    InfoTipComponent,
    AiBatchButtonComponent,
    AiBatchChipComponent,
    AiBatchPanelComponent,
    FocusTrapDirective,
  ],
  templateUrl: './batch.page.html',
  styleUrls: ['./batch.page.scss'],
})
export class BatchPageComponent implements OnInit {
  private readonly store = inject(BatchStoreService);
  readonly aiQueue = inject(AiBatchService);
  readonly projects = inject(ProjectStoreService);
  readonly moreOpen = signal(false);

  @HostListener('document:mousedown', ['$event'])
  closeMoreOnOutside(event: MouseEvent): void {
    if (this.moreOpen() && !(event.target as HTMLElement | null)?.closest('.batch-more')) {
      this.moreOpen.set(false);
    }
  }
  readonly aiHelper = inject(AiHelperService);
  private readonly router = inject(Router);
  private readonly pendingFile = inject(PendingFileService);
  private readonly importer = inject(AnnotationImportService);
  private readonly toast = inject(ToastService);
  readonly previewSettings = inject(PreviewSettingsService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  readonly appName = APP_NAME;
  readonly loaded = this.store.loaded;
  readonly persistent = this.store.persistent;
  readonly activeId = this.store.activeId;
  readonly query = signal('');
  readonly dragActive = signal(false);
  readonly confirmRemove = signal<string | null>(null);
  private manualTarget: string | null = null;

  readonly step = signal<Step>('pdfs');
  readonly view = signal<ViewMode>(readView());
  readonly filter = signal<Filter>('all');
  /** «What they have» filter (and the funnel steps); combines with the state filter. */
  readonly kind = signal<KindFilter>('any');
  readonly templates = signal<Map<string, TemplateInfo>>(new Map());
  readonly templateTab = signal<'files' | 'paste'>('files');
  readonly pasteText = signal('');
  readonly pasteError = signal<{ line: number } | null>(null);
  readonly pasteTooBig = signal(false);
  /** Templates found in the pasted text and not yet linked to a PDF. */
  readonly unusedPasted = signal<PastedTemplate[]>([]);
  readonly pastedFound = signal(0);
  readonly draft = this.store.draft;
  readonly draftPdfs = computed(() => this.store.draft()?.pdfs ?? []);
  /** New versions (B) dropped in the panel that matched no PDF yet. */
  readonly unpairedB = signal<File[]>([]);
  readonly withB = computed(() => this.store.items().filter((item) => item.bPdf).length);
  readonly withoutB = computed(() => this.store.items().filter((item) => !item.bPdf));

  readonly stateOf = (item: BatchItem): RowState =>
    item.status === 'ready'
      ? 'ready'
      : !item.bPdf && this.fieldCount(item.aPages) === 0 && !item.bPages
        ? 'noTemplate'
        : 'review';

  readonly allRows = computed<Row[]>(() =>
    this.store.items().map<Row>((item) => ({ item, state: this.stateOf(item) })),
  );
  readonly counts = computed(() => {
    const rows = this.allRows();
    return {
      all: rows.length,
      review: rows.filter((r) => r.state === 'review').length,
      ready: rows.filter((r) => r.state === 'ready').length,
      noTemplate: rows.filter((r) => r.state === 'noTemplate').length,
    };
  });
  readonly rows = computed<Row[]>(() => {
    const query = this.query().trim().toLowerCase();
    const filter = this.filter();
    const kind = this.kind();
    const rank: Record<RowState, number> = { noTemplate: 0, review: 1, ready: 2 };
    return this.allRows()
      .filter((row) => !query || row.item.name.toLowerCase().includes(query))
      .filter((row) => filter === 'all' || row.state === filter)
      .filter((row) => matchesKind(row.item, kind))
      .sort((a, b) => rank[a.state] - rank[b.state]);
  });
  readonly funnel = computed(() => buildFunnel(this.store.items()));
  readonly filtering = computed(() => this.filter() !== 'all' || this.kind() !== 'any' || this.query().trim() !== '');
  readonly aiReason = (item: BatchItem): AiReason => aiReasonOf(item);
  readonly total = computed(() => this.store.items().length);
  readonly readyCount = computed(() => this.counts().ready);
  readonly progress = computed(() =>
    this.total() ? Math.round((this.readyCount() / this.total()) * 100) : 0,
  );
  readonly nextPending = computed(
    () => this.allRows().find((row) => row.state !== 'ready')?.item ?? null,
  );
  readonly templateRows = computed(() => {
    const infos = this.templates();
    return this.draftPdfs().map((pdf) => ({
      pdf,
      info: infos.get(pairingKey(pdf.name)) ?? null,
    }));
  });
  readonly withTemplate = computed(
    () => this.templateRows().filter((row) => row.info && !row.info.error).length,
  );

  // ---- multiple selection ------------------------------------------------------------------------
  readonly selected = signal<ReadonlySet<string>>(new Set());
  private anchor: string | null = null;
  readonly visibleIds = computed(() => this.rows().map((row) => row.item.id));
  /** Marked PDFs that are visible, in the order of the panel. */
  readonly selectedItems = computed(() => {
    const marked = this.selected();
    return this.rows()
      .filter((row) => marked.has(row.item.id))
      .map((row) => row.item);
  });
  readonly selectedIds = computed(() => this.selectedItems().map((item) => item.id));
  readonly selectionCount = computed(() => this.selectedItems().length);
  readonly allSelected = computed(
    () => this.visibleIds().length > 0 && this.selectionCount() === this.visibleIds().length,
  );
  readonly plan = computed(() => planBulk(this.selectedItems(), (item) => this.stateOf(item) === 'noTemplate'));
  readonly dialog = signal<'ready' | 'remove' | null>(null);
  readonly undoNotice = signal<{ kind: 'removed' | 'ready'; count: number } | null>(null);
  private undoFn: (() => void) | null = null;
  private undoTimer: number | null = null;

  /** «Ver cuáles» of the AI popover: shows the PDFs that stay out for that reason. */
  showAiReason(reason: 'noB' | 'noFields'): void {
    this.query.set('');
    this.filter.set('all');
    this.kind.set(reason === 'noFields' ? 'onlyB' : 'onlyA');
  }

  setKind(kind: KindFilter): void {
    this.kind.set(this.kind() === kind ? 'any' : kind);
  }

  /** A funnel step: shows exactly the PDFs it counts. */
  showStep(step: 'all' | 'withA' | 'withB' | 'ai' | 'ready'): void {
    this.query.set('');
    this.filter.set(step === 'ready' ? 'ready' : 'all');
    this.kind.set(step === 'all' || step === 'ready' ? 'any' : step);
  }

  clearFilters(): void {
    this.query.set('');
    this.filter.set('all');
    this.kind.set('any');
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  /** Click on a checkbox: Shift = range from the last one, Ctrl/⌘ or plain = toggle. */
  onCheck(id: string, event: MouseEvent): void {
    const next = new Set(this.selected());
    if (event.shiftKey && this.anchor) {
      for (const other of rangeBetween(this.visibleIds(), this.anchor, id)) {
        next.add(other);
      }
    } else if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.anchor = id;
    this.selected.set(next);
    (event.target as HTMLInputElement).checked = next.has(id);
  }

  /** Ctrl/⌘+click on a card or row name toggles it without opening the PDF. */
  onCardClick(item: BatchItem, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      this.onCheck(item.id, event);
      return;
    }
    void this.open(item);
  }

  /** Shift+↑/↓ on a checkbox extends the selection and moves the focus. */
  onCheckKey(id: string, event: KeyboardEvent): void {
    if (!event.shiftKey || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return;
    }
    event.preventDefault();
    const ids = this.visibleIds();
    const next = ids[ids.indexOf(id) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) {
      return;
    }
    this.selected.update((set) => new Set(set).add(id).add(next));
    this.anchor = next;
    queueMicrotask(() =>
      document
        .querySelector<HTMLInputElement>(`input[data-select-id="${CSS.escape(next)}"]`)
        ?.focus(),
    );
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.visibleIds()));
  }

  selectAllVisible(): void {
    this.selected.set(new Set(this.visibleIds()));
  }

  clearSelection(): void {
    this.selected.set(new Set());
    this.anchor = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKey(event: KeyboardEvent): void {
    if (this.step() !== 'panel') {
      return;
    }
    const target = event.target as HTMLElement | null;
    const typing = !!target?.closest('input[type="search"], input[type="text"], textarea, select');
    const key = event.key.toLowerCase();
    if (event.key === 'Escape' && !event.defaultPrevented) {
      if (this.dialog()) {
        this.dialog.set(null);
      } else if (this.selectionCount() > 0) {
        this.clearSelection();
      }
    } else if ((event.ctrlKey || event.metaKey) && key === 'a' && !typing) {
      event.preventDefault();
      this.selectAllVisible();
    } else if ((event.ctrlKey || event.metaKey) && key === 'z' && !typing && this.undoFn) {
      event.preventDefault();
      this.undo();
    }
  }

  readonly bulkBusy = computed(() => this.aiQueue.busy());

  askBulk(kind: 'ready' | 'remove'): void {
    if (kind === 'ready' ? this.plan().ready > 0 : this.plan().total > 0) {
      this.dialog.set(kind);
    }
  }

  /** Marks the marked PDFs that have a template as «Listo» and offers to undo it. */
  confirmReady(): void {
    const ids = this.selectedItems()
      .filter((item) => item.status !== 'ready' && this.stateOf(item) !== 'noTemplate')
      .map((item) => item.id);
    this.dialog.set(null);
    if (!ids.length) {
      return;
    }
    this.store.setStatusMany(ids, 'ready');
    this.offerUndo('ready', ids.length, () => this.store.setStatusMany(ids, 'review'));
  }

  confirmRemoveSelected(): void {
    const ids = this.selectedIds();
    this.dialog.set(null);
    if (!ids.length) {
      return;
    }
    const removed = this.store.removeMany(ids);
    this.clearSelection();
    this.confirmRemove.set(null);
    this.offerUndo('removed', removed.length, () => this.store.reinsert(removed));
  }

  private offerUndo(kind: 'removed' | 'ready', count: number, restore: () => void): void {
    this.dropUndo();
    this.undoFn = restore;
    this.undoNotice.set({ kind, count });
    if (typeof window !== 'undefined') {
      this.undoTimer = window.setTimeout(() => this.dropUndo(), 10000);
    }
  }

  undo(): void {
    const restore = this.undoFn;
    this.dropUndo();
    restore?.();
  }

  dropUndo(): void {
    if (this.undoTimer !== null) {
      window.clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
    this.undoFn = null;
    this.undoNotice.set(null);
  }

  downloadSelected(): void {
    const chosen = this.selectedItems();
    const files = this.downloadItems(
      chosen.filter((item) => item.status === 'ready' && !!item.bJson),
    );
    if (!files) {
      return;
    }
    const skipped = chosen.length - files;
    this.toast.show(
      this.i18n.translate(skipped > 0 ? 'batch.bulk.downloadedSkipped' : 'batch.bulk.downloaded', {
        count: files,
        skipped,
      }),
      'success',
    );
  }

  constructor() {
    // Only what is visible stays marked: «Quitar 3» never touches a hidden PDF.
    effect(() => {
      const visible = this.visibleIds();
      untracked(() => this.selected.update((set) => pruneSelection(set, visible)));
    });
    // The panel needs the batch to be read from IndexedDB before it can decide what to show.
    effect(() => {
      if (!this.store.loaded()) {
        return;
      }
      untracked(() => this.decideStep());
    });
  }

  private decideStep(): void {
    if (this.step() === 'panel' && this.total() > 0) {
      return;
    }
    if (this.projects.active() && this.total() === 0 && !this.store.draft()) {
      // A project with an empty batch starts at «Subir PDF» instead of going back to the landing.
      this.store.startDraft([]);
    }
    if (this.store.draft()) {
      this.step.set('pdfs');
    } else if (this.total() > 0) {
      this.step.set('panel');
    } else {
      void this.router.navigate(['/landing']);
    }
  }

  setView(mode: ViewMode): void {
    this.view.set(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      /* private mode: the choice is just not remembered */
    }
  }

  ngOnInit(): void {
    this.metadata.applyDefaultMetadata();
    if (typeof window !== 'undefined') {
      void this.store.load();
    }
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  fieldCount(pages: readonly PageAnnotations[] | null): number {
    return pages?.reduce((total, page) => total + page.fields.length, 0) ?? 0;
  }

  // ---- adding files -------------------------------------------------------------------------

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
    }
    this.dragActive.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async onNewVersionsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addNewVersions(files);
  }

  /** In the panel, dropped PDFs are new versions (B) paired by name. */
  private async addFiles(files: File[]): Promise<void> {
    await this.addNewVersions(files);
  }

  private async addNewVersions(files: File[]): Promise<void> {
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length !== files.length) {
      this.toast.error(this.t('toast.batch.invalidFile', { count: files.length - pdfs.length }));
    }
    if (!pdfs.length) {
      return;
    }
    const candidates = this.store.items().filter((item) => !item.bPdf);
    const { paired, unpaired } = pairByName(candidates, pdfs);
    for (const { a, b } of paired) {
      await this.attachB(a, b);
    }
    if (unpaired.length) {
      this.unpairedB.update((current) => [...current, ...unpaired]);
    }
    this.notifyNotPersistent();
  }

  /** Assigns an unpaired B to the PDF chosen in the strip, whatever its name. */
  async assignUnpaired(file: File, id: string): Promise<void> {
    const item = id ? this.store.find(id) : undefined;
    if (!item || item.bPdf) {
      return;
    }
    this.discardUnpaired(file);
    await this.attachB(item, file);
    this.notifyNotPersistent();
  }

  discardUnpaired(file?: File): void {
    this.unpairedB.update((current) => (file ? current.filter((f) => f !== file) : []));
  }

  /** Per-row «Subir B»: assigns the chosen PDF to that row whatever its name. */
  chooseNewVersion(id: string, input: HTMLInputElement): void {
    this.manualTarget = id;
    input.click();
  }

  async onRowVersionSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const id = this.manualTarget;
    this.manualTarget = null;
    const item = id ? this.store.find(id) : undefined;
    if (!file || !item) {
      return;
    }
    if (!isPdfFile(file)) {
      this.toast.error(this.t('toast.batch.invalidFile', { count: 1 }));
      return;
    }
    await this.attachB(item, file);
    this.notifyNotPersistent();
  }

  private async attachB(item: BatchItem, file: File): Promise<void> {
    const [same, original] = await Promise.all([sha256(file), sha256(item.aPdf)]);
    if (same && same === original) {
      this.toast.warning(this.t('toast.batch.samePdf', { name: file.name }));
    }
    this.store.setB(item.id, file);
  }

  private async readTemplate(file: File): Promise<TemplateInfo> {
    const fail = (error: 'json' | 'noPages'): TemplateInfo => ({
      name: file.name,
      pages: [],
      count: 0,
      error,
    });
    if (file.size > MAX_JSON_BYTES) {
      return fail('json');
    }
    try {
      const data = parseLooseJson(await file.text());
      const pages = this.importer.normalizeImportedCoordinates(data, (field) => field);
      if (pages === null) {
        return fail('noPages');
      }
      return { name: file.name, pages, count: this.fieldCount(pages), error: null };
    } catch {
      return fail('json');
    }
  }

  private notifyNotPersistent(): void {
    if (!this.store.persistent()) {
      this.toast.warning(this.t('toast.batch.notPersistent'));
    }
  }

  // ---- row actions --------------------------------------------------------------------------

  async open(item: BatchItem): Promise<void> {
    this.store.activate(item.id);
    // Without a new version the PDF is edited with its own template.
    const { file, coords } = batchItemOpening(item);
    this.pendingFile.setPendingFile(file, coords?.length ? { coords, ...BATCH_OPEN_VIEW } : null);
    // The id in the URL lets a reload or «Adelante» reopen this same PDF.
    await this.router.navigate(['/workspace'], { queryParams: { [BATCH_ITEM_PARAM]: item.id } });
  }

  /** Opens the first PDF that has an AI proposal waiting for review. */
  async reviewProposal(): Promise<void> {
    const item = this.rows().find((row) => row.item.aiProposal)?.item;
    if (item) {
      await this.open(item);
    }
  }

  async reviewNext(): Promise<void> {
    const next = this.nextPending();
    if (next) {
      await this.open(next);
    }
  }

  askRemove(id: string): void {
    this.confirmRemove.set(this.confirmRemove() === id ? null : id);
  }

  remove(id: string): void {
    this.store.remove(id);
    this.confirmRemove.set(null);
  }

  // ---- steps (several PDFs from the landing) --------------------------------------------------

  async onDraftPdfsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addDraftPdfs(files);
  }

  async onDraftDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    this.addDraftPdfs(Array.from(event.dataTransfer?.files ?? []));
  }

  private addDraftPdfs(files: File[]): void {
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length < files.length) {
      this.toast.error(this.t('toast.batch.invalidFile', { count: files.length - pdfs.length }));
    }
    const current = this.draft();
    if (pdfs.length && current) {
      this.store.draft.set({ ...current, pdfs: [...current.pdfs, ...pdfs] });
    }
  }

  removeDraftPdf(index: number): void {
    const current = this.draft();
    if (current) {
      this.store.draft.set({ ...current, pdfs: current.pdfs.filter((_, i) => i !== index) });
    }
  }

  cancelDraft(): void {
    this.store.draft.set(null);
    void this.router.navigate(['/landing']);
  }

  goToStep(step: Step): void {
    if (step === 'templates' && this.draftPdfs().length === 0) {
      return;
    }
    this.step.set(step);
  }

  async onTemplatesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addTemplates(files);
  }

  async onTemplatesDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    await this.addTemplates(Array.from(event.dataTransfer?.files ?? []));
  }

  private async addTemplates(files: File[]): Promise<void> {
    const jsons = files.filter((file) => !isPdfFile(file) && isJsonFile(file));
    if (jsons.length < files.length) {
      this.toast.error(this.t('toast.batch.invalidFile', { count: files.length - jsons.length }));
    }
    const known = new Set(this.draftPdfs().map((pdf) => pairingKey(pdf.name)));
    const next = new Map(this.templates());
    let orphans = 0;
    for (const file of jsons) {
      const key = pairingKey(file.name);
      if (!known.has(key)) {
        orphans++;
        continue;
      }
      next.set(key, await this.readTemplate(file));
    }
    this.templates.set(next);
    if (orphans) {
      this.toast.warning(this.t('toast.batch.jsonWithoutPdf', { count: orphans }));
    }
  }

  /** Reads the pasted text and links each template to the PDF it belongs to. */
  matchPasted(): void {
    const raw = this.pasteText();
    this.pasteError.set(null);
    this.pasteTooBig.set(raw.length > MAX_JSON_BYTES);
    if (raw.length > MAX_JSON_BYTES) {
      return;
    }
    const { templates, error } = parsePastedTemplates(raw);
    if (error) {
      this.pasteError.set({ line: error.line });
      return;
    }
    this.pastedFound.set(templates.length);
    const taken = new Set<PastedTemplate>();
    const next = new Map(this.templates());
    for (const pdf of this.draftPdfs()) {
      const found = matchTemplate(pdf.name, templates, taken);
      if (!found) {
        continue;
      }
      taken.add(found);
      const info = this.pastedInfo(found);
      next.set(pairingKey(pdf.name), info);
    }
    this.templates.set(next);
    this.unusedPasted.set(templates.filter((template) => !taken.has(template)));
  }

  /** Manual «Asignar»: gives a PDF the pasted template chosen from the list. */
  assignPasted(pdf: File, index: string): void {
    const list = this.unusedPasted();
    const chosen = list[Number(index)];
    if (!chosen) {
      return;
    }
    const next = new Map(this.templates());
    next.set(pairingKey(pdf.name), this.pastedInfo(chosen));
    this.templates.set(next);
    this.unusedPasted.set(list.filter((template) => template !== chosen));
  }

  clearPasted(): void {
    this.pasteText.set('');
    this.pasteError.set(null);
    this.pasteTooBig.set(false);
    this.unusedPasted.set([]);
    this.pastedFound.set(0);
  }

  private pastedInfo(template: PastedTemplate): TemplateInfo {
    const pages = this.importer.normalizeImportedCoordinates(template.data, (field) => field);
    if (pages === null) {
      return { name: template.label, pages: [], count: 0, error: 'noPages' };
    }
    return { name: template.label, pages, count: this.fieldCount(pages), error: null };
  }

  removeTemplate(pdf: File): void {
    const next = new Map(this.templates());
    next.delete(pairingKey(pdf.name));
    this.templates.set(next);
  }

  /** Creates the batch from the draft and shows the panel. */
  async openPanel(): Promise<void> {
    const draft = this.draft();
    if (!draft) {
      return;
    }
    // A new batch starts from zero: whatever was saved from a previous visit is not carried over.
    this.store.draft.set(null);
    await this.store.clear();
    for (const pdf of draft.pdfs) {
      const info = this.templates().get(pairingKey(pdf.name));
      this.store.add({ name: pdf.name, aPdf: pdf, aPages: info && !info.error ? info.pages : [] });
    }
    this.templates.set(new Map());
    this.step.set('panel');
    this.notifyNotPersistent();
  }

  // ---- download -----------------------------------------------------------------------------

  async onTestDataFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    if (file.size > MAX_TEST_DATA_BYTES) {
      this.toast.error(this.i18n.translate('preview.testData.tooLarge'));
      return;
    }
    try {
      this.previewSettings.setTestDataText(await file.text());
      if (this.previewSettings.hasTestData()) {
        this.previewSettings.setBatchMode('data');
        this.toast.show(this.i18n.translate('batch.testData.applied'), 'info');
      } else {
        this.toast.error(this.i18n.translate('preview.testData.readFailed'));
      }
    } catch {
      this.toast.error(this.i18n.translate('preview.testData.readFailed'));
    }
  }

  downloadReady(): void {
    this.downloadItems(
      this.store.items().filter((item) => item.status === 'ready' && item.bJson),
    );
  }

  /** Downloads the JSON of `ready` (one file, or a ZIP); returns how many files it holds. */
  private downloadItems(ready: BatchItem[]): number {
    if (!ready.length) {
      return 0;
    }
    const jsonName = (item: BatchItem) =>
      `${(item.bName ?? item.name).replace(/\.[^./\\]+$/, '')}.json`;
    if (ready.length === 1) {
      downloadBlob(
        new Blob([ready[0].bJson as string], { type: 'application/json' }),
        jsonName(ready[0]),
      );
      return 1;
    }
    const encoder = new TextEncoder();
    const used = new Map<string, number>();
    const entries = ready.map((item) => {
      const base = jsonName(item);
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      return {
        name: count === 1 ? base : base.replace(/\.json$/, `-${count}.json`),
        data: encoder.encode(item.bJson as string),
      };
    });
    const zip = createZip(entries);
    downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), 'plantillas-b.zip');
    return ready.length;
  }
}

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}
