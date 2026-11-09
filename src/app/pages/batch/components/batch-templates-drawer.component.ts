import { Component, computed, inject, output, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { BatchStoreService, TemplateAddReport } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';
import { availableKeyFields } from '../../../utils/template-matching.utils';
import { splitTemplateDocuments } from '../../../utils/template-text.utils';

type Tab = 'paste' | 'files';

/** Side panel to add templates (pasted or from files) without leaving the batch panel. */
@Component({
  selector: 'app-batch-templates-drawer',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './batch-templates-drawer.component.html',
  styleUrls: ['../batch-ui.scss'],
})
export class BatchTemplatesDrawerComponent {
  private readonly store = inject(BatchStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly closed = output<void>();
  readonly tab = signal<Tab>('paste');
  readonly draft = signal('');
  readonly dropActive = signal(false);
  readonly busy = signal(false);
  readonly report = signal<TemplateAddReport | null>(null);

  readonly docs = computed(() => splitTemplateDocuments(this.draft()));
  readonly valid = computed(() => this.docs().filter((doc) => doc.result.ok).length);
  readonly broken = computed(() => this.docs().filter((doc) => !doc.result.ok));
  readonly keyOptions = computed(() => availableKeyFields(this.store.templates()));
  readonly keyField = this.store.keyField;
  readonly total = computed(() => this.store.templates().length);
  readonly paired = computed(() => this.store.items().filter((item) => !!item.templateId).length);
  readonly unused = computed(() => this.store.unusedTemplates().length);

  onDraft(event: Event) {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.report.set(null);
  }

  async addPasted() {
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    try {
      const report = await this.store.addTemplateText(this.draft());
      this.report.set(report);
      // What could not be read stays in the box so the user can fix it; nothing typed is lost.
      this.draft.set(this.broken().map((doc) => doc.text).join('\n'));
      this.toast.show(this.i18n.translate('batch.templates.added', { count: report.added }), 'success');
    } finally {
      this.busy.set(false);
    }
  }

  async onFiles(files: File[]) {
    if (!files.length || this.busy()) return;
    this.busy.set(true);
    try {
      const report = await this.store.addTemplateFiles(files);
      this.report.set(report);
      this.toast.show(this.i18n.translate('batch.templates.added', { count: report.added }), 'success');
    } finally {
      this.busy.set(false);
    }
  }

  async onPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.onFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(true);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(false);
    await this.onFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onKey(event: Event) {
    this.store.setKeyField((event.target as HTMLSelectElement).value);
  }

  issueLabel(reason: string): string {
    return this.i18n.translate(`batch.templates.issue.${reason}`);
  }
}
