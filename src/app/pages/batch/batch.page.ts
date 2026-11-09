import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModeSwitchComponent } from '../../components/mode-switch/mode-switch.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import {
  AddReport,
  BatchItem,
  BatchStatus,
  BatchStoreService,
  MAX_BATCH_PDF_BYTES,
  STORAGE_BLOCK_RATIO,
  STORAGE_WARN_RATIO,
  batchStatusOf,
  countFields,
} from '../../services/batch-store.service';
import { BatchExportService } from '../../services/batch-export.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { ToastService } from '../../services/toast.service';
import { formatBytes } from '../../utils/batch-files.utils';
import { downloadBlob } from '../../utils/download.utils';
import { formatPageSize } from '../../utils/page-size.utils';
import { BatchStepsComponent } from './components/batch-steps.component';

type Filter = 'all' | BatchStatus;
type ExportPhase = 'closed' | 'options' | 'running' | 'done';

const FILTERS: readonly Filter[] = [
  'all',
  'noTemplate',
  'templateError',
  'missingNew',
  'ready',
  'relaid',
  'exported',
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Component({
  selector: 'app-batch-page',
  standalone: true,
  imports: [RouterLink, TranslationPipe, BatchStepsComponent, ModeSwitchComponent],
  templateUrl: './batch.page.html',
  styleUrls: ['./batch.page.scss'],
})
export class BatchPageComponent implements OnInit {
  readonly store = inject(BatchStoreService);
  private readonly exporter = inject(BatchExportService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly filters = FILTERS;
  readonly filter = signal<Filter>('all');
  readonly query = signal('');
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly dropActive = signal(false);
  readonly report = signal<AddReport | null>(null);
  readonly confirmRemove = signal(false);
  readonly maxMb = MAX_BATCH_PDF_BYTES / (1024 * 1024);

  readonly exportPhase = signal<ExportPhase>('closed');
  readonly exportJson = signal(true);
  readonly exportPdf = signal(true);
  readonly exportProgress = signal({ done: 0, total: 0 });
  readonly exportFailures = signal<readonly string[]>([]);
  readonly exportSizes = signal({ json: 0, pdf: 0 });

  readonly rows = computed(() => {
    const filter = this.filter();
    const query = this.query().trim().toLowerCase();
    return this.store
      .items()
      .map((item) => ({ item, status: batchStatusOf(item) }))
      .filter((row) => (filter === 'all' || row.status === filter) && (!query || row.item.name.toLowerCase().includes(query)));
  });

  readonly counts = computed(() => {
    const counts: Record<Filter, number> = {
      all: 0, noTemplate: 0, templateError: 0, missingNew: 0, ready: 0, relaid: 0, exported: 0,
    };
    for (const item of this.store.items()) {
      counts.all += 1;
      counts[batchStatusOf(item)] += 1;
    }
    return counts;
  });

  readonly exportable = computed(() =>
    this.store.items().filter((item) => !!item.newPdf && !!item.layout && !item.templateIssue)
  );
  readonly skipped = computed(() => this.store.items().length - this.exportable().length);
  readonly exportTotalFiles = computed(
    () => this.exportable().length * ((this.exportJson() ? 1 : 0) + (this.exportPdf() ? 1 : 0))
  );
  readonly storageLevel = computed(() => {
    const storage = this.store.storage();
    if (!storage) return 'ok';
    const ratio = storage.used / storage.quota;
    return ratio >= STORAGE_BLOCK_RATIO ? 'block' : ratio >= STORAGE_WARN_RATIO ? 'warn' : 'ok';
  });
  readonly storagePercent = computed(() => {
    const storage = this.store.storage();
    return storage ? Math.min(100, Math.round((storage.used / storage.quota) * 100)) : 0;
  });
  readonly exportedBytes = computed(() =>
    this.store.items().filter((i) => i.exported).reduce((sum, i) => sum + i.pdf.size + (i.newPdf?.size ?? 0), 0)
  );
  readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((row) => this.selected().has(row.item.id))
  );

  constructor() {
    this.metadata.applyDefaultMetadata();
  }

  ngOnInit() {
    if (typeof window === 'undefined') return;
    void this.store.load().then(() => this.store.refreshStorage());
  }

  bytes = formatBytes;
  fieldCount = (item: BatchItem) => countFields(item.layout ?? item.template);
  sizeLabel = (item: BatchItem) => formatPageSize(item.pageSize);

  setFilter(filter: Filter) {
    this.filter.set(filter);
  }

  onQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  toggle(id: string) {
    this.confirmRemove.set(false);
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.rows().map((row) => row.item.id)));
  }

  actionKey(status: BatchStatus): string {
    switch (status) {
      case 'noTemplate': return 'pasteTemplate';
      case 'templateError': return 'fix';
      case 'missingNew': return 'uploadNew';
      case 'relaid': return 'review';
      default: return 'open';
    }
  }

  open(id: string) {
    void this.router.navigate(['/batch', id]);
  }

  openNext() {
    const id = this.store.nextPendingId();
    if (id) this.open(id);
    else this.toast.show(this.i18n.translate('batch.list.nothingPending'), 'success');
  }

  onRowKeydown(event: KeyboardEvent, id: string) {
    const row = event.currentTarget as HTMLElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open(id);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const sibling = (event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      sibling?.focus();
    }
  }

  onPageKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.openNext();
    }
  }

  // ---- adding files ---------------------------------------------------------------------------

  pickFiles() {
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(true);
  }

  onDragLeave() {
    this.dropActive.set(false);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private async addFiles(files: File[]) {
    if (!files.length) return;
    const report = await this.store.addFiles(files);
    this.report.set(report.rejected.length ? report : null);
    if (report.added > 0) {
      this.toast.show(this.i18n.translate('batch.upload.ready', { count: report.added }), 'success');
    }
  }

  rejectLabel(reason: string): string {
    return this.i18n.translate(`batch.reject.${reason}`, { limit: this.maxMb });
  }

  async removeSelected() {
    if (!this.selected().size) return;
    if (!this.confirmRemove()) {
      this.confirmRemove.set(true);
      setTimeout(() => this.confirmRemove.set(false), 5000);
      return;
    }
    await this.store.remove([...this.selected()]);
    this.selected.set(new Set());
    this.confirmRemove.set(false);
  }

  async removeExported() {
    const ids = this.store.items().filter((item) => item.exported).map((item) => item.id);
    await this.store.remove(ids);
    this.selected.update((set) => new Set([...set].filter((id) => !ids.includes(id))));
  }

  async clearBatch() {
    await this.store.clear();
    this.selected.set(new Set());
    this.exportPhase.set('closed');
  }

  // ---- exporting --------------------------------------------------------------------------------

  async openExport() {
    const items = this.exportable();
    const json = items.reduce((sum, item) => sum + this.exporter.json(item).blob.size, 0);
    const pdf = items.reduce((sum, item) => sum + (item.newPdf?.size ?? 0), 0);
    this.exportSizes.set({ json, pdf });
    this.exportFailures.set([]);
    this.exportPhase.set('options');
  }

  closeExport() {
    if (this.exportPhase() !== 'running') this.exportPhase.set('closed');
  }

  async runExport(only?: readonly string[]) {
    const items = this.exportable().filter((item) => !only || only.includes(item.id));
    const withJson = this.exportJson();
    const withPdf = this.exportPdf();
    if (!items.length || (!withJson && !withPdf)) return;

    const total = items.length * ((withJson ? 1 : 0) + (withPdf ? 1 : 0));
    this.exportProgress.set({ done: 0, total });
    this.exportFailures.set([]);
    this.exportPhase.set('running');
    const failures: string[] = [];
    const completed: string[] = [];
    let done = 0;

    for (const item of items) {
      let ok = true;
      if (withJson) {
        const file = this.exporter.json(item);
        downloadBlob(file.blob, file.filename);
        done += 1;
        this.exportProgress.set({ done, total });
        await wait(120);
      }
      if (withPdf) {
        try {
          const file = await this.exporter.pdf(item);
          downloadBlob(file.blob, file.filename);
        } catch (error) {
          console.error('No se pudo generar el PDF anotado del lote.', error);
          ok = false;
          failures.push(item.id);
        }
        done += 1;
        this.exportProgress.set({ done, total });
        await wait(120);
      }
      if (ok) completed.push(item.id);
    }

    this.store.markExported(completed);
    this.exportFailures.set(failures);
    this.exportPhase.set('done');
  }

  failedNames(): string {
    const failed = new Set(this.exportFailures());
    return this.store.items().filter((item) => failed.has(item.id)).map((item) => item.name).join(', ');
  }

  retryFailed() {
    void this.runExport([...this.exportFailures()]);
  }

  exportedCount = computed(() => this.store.items().filter((item) => item.exported).length);
}
