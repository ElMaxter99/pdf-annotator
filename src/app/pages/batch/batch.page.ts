import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { APP_NAME } from '../../app-version';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import type { PageAnnotations } from '../../models/annotation.model';
import type { BatchItem } from '../../models/batch.model';
import { AnnotationImportService } from '../../services/annotation-import.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { BatchStoreService } from '../../services/batch-store.service';
import { PendingFileService } from '../../services/pending-file.service';
import { ToastService } from '../../services/toast.service';
import { downloadBlob } from '../../utils/download.utils';
import { parseLooseJson } from '../../utils/loose-json';
import { pairByName, pairingKey } from '../../utils/migration.utils';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { createZip } from '../../utils/zip.utils';

const MAX_JSON_BYTES = 5 * 1024 * 1024;

type RowState = 'ready' | 'review' | 'noB';

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
  selector: 'app-batch-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslationPipe],
  templateUrl: './batch.page.html',
  styleUrls: ['./batch.page.scss'],
})
export class BatchPageComponent implements OnInit {
  private readonly store = inject(BatchStoreService);
  private readonly router = inject(Router);
  private readonly pendingFile = inject(PendingFileService);
  private readonly importer = inject(AnnotationImportService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  readonly appName = APP_NAME;
  readonly loaded = this.store.loaded;
  readonly persistent = this.store.persistent;
  readonly activeId = this.store.activeId;
  readonly query = signal('');
  readonly dragActive = signal(false);
  readonly importing = signal<{ done: number; total: number } | null>(null);
  readonly confirmRemove = signal<string | null>(null);
  private manualTarget: string | null = null;

  readonly rows = computed<Row[]>(() => {
    const query = this.query().trim().toLowerCase();
    const rows = this.store
      .items()
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .map<Row>((item) => ({
        item,
        state: !item.bPdf ? 'noB' : item.status === 'ready' ? 'ready' : 'review',
      }));
    const rank: Record<RowState, number> = { noB: 0, review: 1, ready: 2 };
    return rows.sort((a, b) => rank[a.state] - rank[b.state]);
  });
  readonly total = computed(() => this.store.items().length);
  readonly readyCount = computed(
    () => this.store.items().filter((i) => i.bPdf && i.status === 'ready').length,
  );
  readonly progress = computed(() =>
    this.total() ? Math.round((this.readyCount() / this.total()) * 100) : 0,
  );
  readonly nextPending = computed(
    () => this.store.items().find((item) => item.bPdf && item.status !== 'ready') ?? null,
  );

  ngOnInit(): void {
    this.metadata.applyDefaultMetadata();
    if (typeof window !== 'undefined') {
      void this.store.load();
    }
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  bytesLabel(item: BatchItem): string {
    return item.bName ?? '—';
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

  async onOriginalsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addOriginals(files);
  }

  async onNewVersionsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addNewVersions(files);
  }

  /** Drops go to the originals while the batch is empty and to the new versions afterwards. */
  private async addFiles(files: File[]): Promise<void> {
    if (this.total() === 0) {
      await this.addOriginals(files);
    } else {
      await this.addNewVersions(files);
    }
  }

  private async addOriginals(files: File[]): Promise<void> {
    const pdfs = files.filter(isPdfFile);
    const jsons = files.filter((file) => !isPdfFile(file) && isJsonFile(file));
    const rejected = files.length - pdfs.length - jsons.length;
    if (rejected > 0) {
      this.toast.error(this.t('toast.batch.invalidFile', { count: rejected }));
    }
    if (!pdfs.length) {
      return;
    }

    this.importing.set({ done: 0, total: pdfs.length });
    for (const pdf of pdfs) {
      const json = jsons.find((file) => pairingKey(file.name) === pairingKey(pdf.name));
      const pages = json ? await this.readTemplate(json) : [];
      this.store.add({ name: pdf.name, aPdf: pdf, aPages: pages });
      this.importing.update((state) => (state ? { ...state, done: state.done + 1 } : state));
    }
    this.importing.set(null);

    const used = new Set(pdfs.map((pdf) => pairingKey(pdf.name)));
    const orphans = jsons.filter((file) => !used.has(pairingKey(file.name)));
    if (orphans.length) {
      this.toast.warning(this.t('toast.batch.jsonWithoutPdf', { count: orphans.length }));
    }
    this.notifyNotPersistent();
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
    this.importing.set({ done: 0, total: paired.length });
    for (const { a, b } of paired) {
      await this.attachB(a, b);
      this.importing.update((state) => (state ? { ...state, done: state.done + 1 } : state));
    }
    this.importing.set(null);
    if (unpaired.length) {
      this.toast.warning(this.t('toast.batch.unpaired', { count: unpaired.length }));
    }
    this.notifyNotPersistent();
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

  private async readTemplate(file: File): Promise<PageAnnotations[]> {
    if (file.size > MAX_JSON_BYTES) {
      this.toast.error(this.t('toast.batch.jsonFailed', { name: file.name }));
      return [];
    }
    try {
      const data = parseLooseJson(await file.text());
      const pages = this.importer.normalizeImportedCoordinates(data, (field) => field);
      if (pages === null) {
        this.toast.error(this.t('toast.batch.jsonNoPages', { name: file.name }));
        return [];
      }
      return pages;
    } catch {
      this.toast.error(this.t('toast.batch.jsonFailed', { name: file.name }));
      return [];
    }
  }

  private notifyNotPersistent(): void {
    if (!this.store.persistent()) {
      this.toast.warning(this.t('toast.batch.notPersistent'));
    }
  }

  // ---- row actions --------------------------------------------------------------------------

  async open(item: BatchItem): Promise<void> {
    if (!item.bPdf) {
      return;
    }
    this.store.activate(item.id);
    const file = new File([item.bPdf], item.bName ?? item.name, { type: 'application/pdf' });
    this.pendingFile.setPendingFile(
      file,
      item.bPages ? { coords: item.bPages, pageIndex: 1, scale: 0.75 } : null,
    );
    await this.router.navigate(['/workspace']);
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

  removeVersion(id: string): void {
    this.store.removeB(id);
  }

  clearBatch(): void {
    this.store.clear();
    this.confirmRemove.set(null);
  }

  // ---- download -----------------------------------------------------------------------------

  downloadReady(): void {
    const ready = this.store
      .items()
      .filter((item) => item.bPdf && item.status === 'ready' && item.bJson);
    if (!ready.length) {
      return;
    }
    const jsonName = (item: BatchItem) =>
      `${(item.bName ?? item.name).replace(/\.[^./\\]+$/, '')}.json`;
    if (ready.length === 1) {
      downloadBlob(
        new Blob([ready[0].bJson as string], { type: 'application/json' }),
        jsonName(ready[0]),
      );
      return;
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
  }
}
