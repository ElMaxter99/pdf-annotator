import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModeSwitchComponent } from '../../components/mode-switch/mode-switch.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { AddReport, BatchStoreService, MAX_BATCH_PDF_BYTES } from '../../services/batch-store.service';
import { ToastService } from '../../services/toast.service';
import { extractPagesCollection } from '../../utils/annotation-fields.utils';
import { formatBytes } from '../../utils/batch-files.utils';
import { splitTemplateDocuments } from '../../utils/template-text.utils';

type Tab = 'paste' | 'files';
const SHOWN_ROWS = 6;
type Step = 1 | 2 | 3;

/** Preparation stepper: 1 upload the PDFs, 2 add templates (optional), 3 review and enter the panel. */
@Component({
  selector: 'app-batch-load-page',
  standalone: true,
  imports: [RouterLink, TranslationPipe, ModeSwitchComponent],
  templateUrl: './batch-load.page.html',
  styleUrls: ['./batch.page.scss', './batch-flow.scss'],
})
export class BatchLoadPageComponent implements OnInit {
  readonly store = inject(BatchStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  private readonly pdfInput = viewChild<ElementRef<HTMLInputElement>>('pdfInput');
  private readonly jsonInput = viewChild<ElementRef<HTMLInputElement>>('jsonInput');

  readonly step = signal<Step>(1);
  readonly steps = [
    { n: 1, title: 'batch.step.s1.title', hint: 'batch.step.s1.hint' },
    { n: 2, title: 'batch.step.s2.title', hint: 'batch.step.s2.hint' },
    { n: 3, title: 'batch.step.s3.title', hint: 'batch.step.s3.hint' },
  ];
  readonly pairedCount = computed(() => this.store.items().filter((item) => !!item.templateId).length);
  readonly tab = signal<Tab>('paste');
  readonly draft = signal('');
  readonly pdfDrop = signal(false);
  readonly jsonDrop = signal(false);
  readonly report = signal<AddReport | null>(null);
  readonly maxMb = MAX_BATCH_PDF_BYTES / (1024 * 1024);
  readonly shown = SHOWN_ROWS;

  readonly docs = computed(() => splitTemplateDocuments(this.draft()));
  readonly analysis = computed(() => {
    const field = this.store.keyField();
    const rows = this.docs().map((doc, index) => {
      let pages = 0;
      let fields = 0;
      if (doc.result.ok) {
        const list = extractPagesCollection(doc.result.data);
        const entries = Array.isArray(list) ? list : [];
        pages = entries.length;
        fields = entries.reduce<number>((sum, page) => {
          const f = (page as { fields?: unknown })?.fields;
          return sum + (Array.isArray(f) ? f.length : 0);
        }, 0);
      }
      return {
        index,
        ok: doc.result.ok,
        label: doc.keys[field] ?? Object.values(doc.keys)[0] ?? `#${index + 1}`,
        pages,
        fields,
        line: doc.line,
        reason: doc.result.ok ? '' : doc.result.reason,
      };
    });
    const valid = rows.filter((row) => row.ok).length;
    return { rows, valid, invalid: rows.length - valid };
  });
  readonly lineCount = computed(() => (this.draft() ? this.draft().split('\n').length : 0));

  readonly validTemplates = computed(() => this.store.templates().filter((t) => !!t.pages).length);
  readonly sources = computed(() => {
    const groups = new Map<string, number>();
    for (const template of this.store.templates()) {
      groups.set(template.source, (groups.get(template.source) ?? 0) + 1);
    }
    return [...groups.entries()].map(([source, count]) => ({ source, count }));
  });
  readonly firstPdfs = computed(() => this.store.items().slice(0, SHOWN_ROWS));

  bytes = formatBytes;

  constructor() {
    this.metadata.applyDefaultMetadata();
  }

  ngOnInit() {
    if (typeof window === 'undefined') return;
    void this.store.load().then(() => this.store.refreshStorage());
  }

  go(step: Step) {
    this.step.set(step);
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
  }

  pickPdfs() {
    this.pick(this.pdfInput());
  }

  pickJson() {
    this.pick(this.jsonInput());
  }

  private pick(ref: ElementRef<HTMLInputElement> | undefined) {
    const input = ref?.nativeElement;
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

  onDragOver(event: DragEvent, zone: 'pdf' | 'json') {
    event.preventDefault();
    (zone === 'pdf' ? this.pdfDrop : this.jsonDrop).set(true);
  }

  onDragLeave(zone: 'pdf' | 'json') {
    (zone === 'pdf' ? this.pdfDrop : this.jsonDrop).set(false);
  }

  async onDrop(event: DragEvent, zone: 'pdf' | 'json') {
    event.preventDefault();
    (zone === 'pdf' ? this.pdfDrop : this.jsonDrop).set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private async addFiles(files: File[]) {
    if (!files.length) return;
    const report = await this.store.addFiles(files);
    this.report.set(report.rejected.length || report.templatesFailed ? report : null);
    if (report.added > 0) {
      this.toast.show(this.i18n.translate('batch.upload.ready', { count: report.added }), 'success');
    }
    if (report.templatesAdded > 0) {
      this.toast.show(this.i18n.translate('batch.load.paste.addedToast', { count: report.templatesAdded }), 'success');
    }
  }

  onDraft(event: Event) {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  clearDraft() {
    this.draft.set('');
  }

  /** Adds the valid templates; the broken ones stay in the box so nothing typed is lost. */
  async addPasted() {
    const docs = this.docs();
    if (!this.analysis().valid) return;
    const report = await this.store.addTemplateText(this.draft());
    const keep = docs.filter((doc) => !doc.result.ok).map((doc) => doc.text);
    this.draft.set(keep.join('\n'));
    this.toast.show(this.i18n.translate('batch.load.paste.addedToast', { count: report.added }), 'success');
  }

  async clearTemplates() {
    await this.store.clearTemplates();
  }

  rejectLabel(reason: string): string {
    return this.i18n.translate(`batch.reject.${reason}`, { limit: this.maxMb });
  }

  reasonLabel(reason: string): string {
    return this.i18n.translate(`batch.template.reason.${reason}`);
  }

  goPanel() {
    void this.router.navigate(['/batch']);
  }
}
