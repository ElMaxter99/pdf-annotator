import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { extractPagesCollection } from '../../utils/annotation-fields.utils';
import type { PageAnnotations } from '../../models/annotation.model';
import { AppMetadataService } from '../../services/app-metadata.service';
import { BatchStoreService, MAX_BATCH_PDF_BYTES, countFields } from '../../services/batch-store.service';
import { ToastService } from '../../services/toast.service';
import { formatBytes } from '../../utils/batch-files.utils';
import { formatPageSize, pageSizesDiffer, scaleAnnotations, SizeStrategy } from '../../utils/page-size.utils';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { parseTemplateText } from '../../utils/template-text.utils';
import { BatchCompareComponent } from './components/batch-compare.component';
import { BatchStepsComponent } from './components/batch-steps.component';

@Component({
  selector: 'app-batch-item-page',
  standalone: true,
  imports: [RouterLink, TranslationPipe, BatchStepsComponent, BatchCompareComponent],
  templateUrl: './batch-item.page.html',
  styleUrls: ['./batch-item.page.scss'],
})
export class BatchItemPageComponent {
  readonly store = inject(BatchStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  readonly itemId = signal('');
  readonly draft = signal('');
  readonly showSetup = signal(false);
  readonly dropActive = signal(false);
  readonly uploading = signal(false);
  readonly strategy = signal<SizeStrategy>('scale');
  readonly rememberRule = signal(true);
  readonly maxMb = MAX_BATCH_PDF_BYTES / (1024 * 1024);
  private draftFor = '';

  readonly item = computed(() => this.store.items().find((i) => i.id === this.itemId()));
  readonly index = computed(() => this.store.items().findIndex((i) => i.id === this.itemId()));
  readonly total = computed(() => this.store.items().length);

  readonly needsSize = computed(() => {
    const item = this.item();
    return !!item?.newPdf && !!item.newPageSize && !item.sizeStrategy && pageSizesDiffer(item.pageSize, item.newPageSize);
  });
  readonly setupMode = computed(() => {
    const item = this.item();
    return !!item && (this.showSetup() || !item.template || !!item.templateIssue || !item.newPdf || this.needsSize());
  });
  readonly activeStep = computed(() => {
    const item = this.item();
    if (!item?.template || item.templateIssue) return 2;
    if (!item.newPdf || this.needsSize()) return 3;
    return this.setupMode() ? 3 : 4;
  });

  /** Live validation of the pasted text; also counts what would be imported. */
  readonly validation = computed(() => {
    const result = parseTemplateText(this.draft());
    if (!result.ok) return result;
    const pages = extractPagesCollection(result.data);
    const list = Array.isArray(pages) ? pages : [];
    const fields = list.reduce<number>(
      (total, page) => total + (Array.isArray((page as { fields?: unknown })?.fields) ? (page as { fields: unknown[] }).fields.length : 0),
      0
    );
    return { ok: true as const, pages: list.length, fields };
  });
  readonly pageSummary = computed(() =>
    (this.item()?.template ?? []).map((page) => ({ num: page.num, fields: page.fields.length }))
  );
  readonly sizeInfo = computed(() => {
    const item = this.item();
    if (!item?.newPageSize) return null;
    const from = item.pageSize;
    const to = item.newPageSize;
    const sample = item.template?.flatMap((p) => p.fields)[0];
    const scaled = sample
      ? scaleAnnotations([{ num: 1, fields: [sample] }], from, to)[0].fields[0]
      : null;
    const max = Math.max(from.width, from.height, to.width, to.height);
    return {
      from, to,
      fromLabel: formatPageSize(from),
      toLabel: formatPageSize(to),
      dw: Math.round(to.width - from.width),
      dh: Math.round(to.height - from.height),
      fromBox: { w: (from.width / max) * 140, h: (from.height / max) * 140 },
      toBox: { w: (to.width / max) * 140, h: (to.height / max) * 140 },
      sample, scaled,
    };
  });

  bytes = formatBytes;
  sizeLabel = formatPageSize;
  fieldCount = (pages: PageAnnotations[] | null | undefined) => countFields(pages);

  constructor() {
    this.metadata.applyDefaultMetadata();
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      this.itemId.set(params.get('id') ?? '');
      this.showSetup.set(false);
      void this.store.load().then(() => this.syncDraft());
    });
  }

  private syncDraft() {
    const item = this.item();
    if (!item) {
      void this.router.navigate(['/batch']);
      return;
    }
    if (this.draftFor !== item.id) {
      this.draftFor = item.id;
      this.draft.set(item.templateText ?? '');
    }
  }

  onDraft(event: Event) {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  useTemplate() {
    const id = this.itemId();
    const result = this.store.setTemplateText(id, this.draft());
    if (!result.ok) {
      this.toast.error(this.i18n.translate('batch.template.invalidToast'));
      return;
    }
    this.showSetup.set(false);
  }

  async onTemplateFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const outcome = await this.store.applyTemplateFile(this.itemId(), file);
    if (outcome === 'tooBig') {
      this.toast.error(this.i18n.translate('batch.reject.tooBigJson'));
      return;
    }
    this.draft.set(this.item()?.templateText ?? '');
    if (outcome === 'invalidJson') this.toast.error(this.i18n.translate('batch.template.invalidToast'));
  }

  // ---- new pdf ----------------------------------------------------------------------------------

  async onNewPdf(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.setNewPdf(file);
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
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.setNewPdf(file);
  }

  private async setNewPdf(file: File) {
    if (!isPdfFile(file)) {
      this.toast.error(this.i18n.translate('app.upload.invalidFormat'));
      return;
    }
    this.uploading.set(true);
    try {
      const result = await this.store.setNewPdf(this.itemId(), file);
      if (!result.ok) {
        const key = result.reason === 'tooBig' ? 'batch.reject.tooBig' : 'batch.newPdf.unreadable';
        this.toast.error(this.i18n.translate(key, { limit: this.maxMb }));
        return;
      }
      this.strategy.set('scale');
    } finally {
      this.uploading.set(false);
    }
  }

  applySize() {
    this.store.applySizeStrategy(this.itemId(), this.strategy(), this.rememberRule());
    this.showSetup.set(false);
  }

  cancelSize() {
    // Without a decision there is no layout: drop the new PDF so the user can pick another one.
    this.store.clearNewPdf(this.itemId());
    this.showSetup.set(true);
  }

  // ---- navigation / saving -------------------------------------------------------------------------

  goTo(offset: number) {
    const target = this.store.items()[this.index() + offset];
    if (target) void this.router.navigate(['/batch', target.id]);
  }

  skip() {
    const next = this.store.nextPendingId(this.itemId());
    void this.router.navigate(next ? ['/batch', next] : ['/batch']);
  }

  onSaved(event: { layout: PageAnnotations[]; next: boolean }) {
    this.store.saveLayout(this.itemId(), event.layout, true);
    this.toast.show(this.i18n.translate('batch.compare.savedToast'), 'success');
    if (event.next) {
      const next = this.store.nextPendingId(this.itemId());
      void this.router.navigate(next ? ['/batch', next] : ['/batch']);
    }
  }
}
