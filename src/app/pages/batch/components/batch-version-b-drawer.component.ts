import { Component, computed, inject, output, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { BatchStoreService, MAX_BATCH_PDF_BYTES, VersionBPlan } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';

interface Row {
  readonly file: File;
  readonly kind: VersionBPlan['kind'];
  readonly itemId?: string;
  readonly similar?: boolean;
  readonly candidates: readonly string[];
}

/** Side panel to add the version B of several PDFs at once, pairing them by name and checking the content. */
@Component({
  selector: 'app-batch-version-b-drawer',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './batch-version-b-drawer.component.html',
  styleUrls: ['../batch-ui.scss'],
})
export class BatchVersionBDrawerComponent {
  readonly store = inject(BatchStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly closed = output<void>();
  readonly rows = signal<readonly Row[]>([]);
  readonly dropActive = signal(false);
  readonly busy = signal(false);
  readonly maxMb = MAX_BATCH_PDF_BYTES / (1024 * 1024);

  readonly ready = computed(() => this.rows().filter((row) => row.kind === 'b').length);
  readonly same = computed(() => this.rows().filter((row) => row.kind === 'same').length);

  nameOf(id: string | undefined): string {
    return this.store.items().find((item) => item.id === id)?.name ?? '';
  }

  async addFiles(files: File[]) {
    if (!files.length) return;
    this.busy.set(true);
    try {
      const plans = await this.store.planVersionB(files);
      this.rows.update((rows) => [...rows, ...plans]);
    } finally {
      this.busy.set(false);
    }
  }

  async onPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(true);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.dropActive.set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  /** The user says which PDF this file is the version B of (any name is fine). */
  async choose(index: number, event: Event) {
    const itemId = (event.target as HTMLSelectElement).value;
    const row = this.rows()[index];
    if (!row) return;
    let next: Row;
    if (!itemId) {
      next = { ...row, itemId: undefined, kind: row.candidates.length ? 'choose' : 'none' };
    } else {
      const same = await this.store.isSame(itemId, row.file);
      next = { ...row, itemId, similar: false, kind: same ? 'same' : 'b' };
    }
    this.rows.update((rows) => rows.map((r, i) => (i === index ? next : r)));
  }

  remove(index: number) {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  async apply() {
    if (this.busy()) return;
    this.busy.set(true);
    let added = 0;
    const left: Row[] = [];
    try {
      for (const row of this.rows()) {
        if (row.kind !== 'b' || !row.itemId) {
          if (row.kind !== 'same') left.push(row);
          continue;
        }
        const result = await this.store.setNewPdf(row.itemId, row.file);
        if (result.ok) added += 1;
        else if (result.reason !== 'same') left.push({ ...row, kind: 'none' });
      }
    } finally {
      this.busy.set(false);
    }
    this.rows.set(left);
    if (added) this.toast.show(this.i18n.translate('batch.versionB.added', { count: added }), 'success');
    if (!left.length) this.closed.emit();
  }

  reasonLabel(kind: string): string {
    return this.i18n.translate(`batch.versionB.kind.${kind}`, { limit: this.maxMb });
  }
}
