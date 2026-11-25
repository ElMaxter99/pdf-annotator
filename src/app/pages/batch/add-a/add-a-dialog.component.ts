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
import { FocusTrapDirective } from '../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import type { PageAnnotations } from '../../../models/annotation.model';
import { AnnotationImportService } from '../../../services/annotation-import.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';
import { pairingKey } from '../../../utils/migration.utils';
import { isPdfFile } from '../../../utils/pdf-file.utils';
import {
  matchTemplate,
  parsePastedTemplates,
  type PastedTemplate,
} from '../../../utils/template-paste.utils';
import { countFields } from '../../../utils/template-update.utils';
import { MAX_UPDATE_BYTES } from '../template-update/template-update-dialog.component';

type Phase = 'closed' | 'pdfs' | 'templates' | 'running' | 'done';

export interface AddAEntry {
  readonly file: File;
  /** Another PDF of the batch (or of this list) has the same name. */
  readonly duplicate: boolean;
}

export interface AddAResult {
  /** Ids of the rows created, to undo them. */
  readonly ids: readonly string[];
}

function isJsonFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json';
}

/** «Añadir PDFs A» (P-190 a P-192): crea filas nuevas en el panel del lote, con su plantilla A opcional. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-add-a',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslationPipe, FocusTrapDirective],
  templateUrl: './add-a-dialog.component.html',
  styleUrl: './add-a-dialog.component.scss',
})
export class AddADialogComponent {
  private readonly store = inject(BatchStoreService);
  private readonly importer = inject(AnnotationImportService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly closed = output<AddAResult | null>();

  readonly phase = signal<Phase>('closed');
  readonly tab = signal<'files' | 'paste'>('files');
  readonly dragActive = signal(false);
  readonly entries = signal<AddAEntry[]>([]);
  /** Duplicated files the person chose to add anyway (by file object). */
  private readonly included = signal<Set<File>>(new Set());
  readonly pasteText = signal('');
  readonly pasteError = signal<{ line: number } | null>(null);
  readonly pasteTooBig = signal(false);
  readonly fileError = signal<string | null>(null);
  private readonly fileDocs = signal<PastedTemplate[]>([]);
  private readonly pasteDocs = signal<PastedTemplate[]>([]);
  readonly progress = signal({ done: 0, total: 0 });
  readonly runNames = signal<string[]>([]);
  readonly doneCount = signal(0);
  readonly doneWithTemplate = signal(0);
  readonly failed = signal(0);
  private ids: string[] = [];
  private cancelled = false;

  readonly docs = computed(() => [...this.fileDocs(), ...this.pasteDocs()]);

  /** What will be added: not duplicated files, plus duplicated ones the person included. */
  readonly plan = computed(() =>
    this.entries().filter((entry) => !entry.duplicate || this.included().has(entry.file)),
  );
  readonly omitted = computed(() => this.entries().length - this.plan().length);
  readonly totalBytes = computed(() => this.plan().reduce((sum, e) => sum + e.file.size, 0));

  /** For each file to add, its template (if any) and the normalised pages. */
  readonly matches = computed(() => {
    const taken = new Set<PastedTemplate>();
    const docs = this.docs();
    return this.plan().map((entry) => {
      const doc = matchTemplate(entry.file.name, docs, taken);
      if (doc) {
        taken.add(doc);
      }
      const pages = doc
        ? this.importer.normalizeImportedCoordinates(doc.data, (field) => field)
        : null;
      const usable = pages && countFields(pages) > 0 ? pages : null;
      return { entry, doc, pages: usable, noPages: !!doc && !usable };
    });
  });
  readonly withTemplate = computed(() => this.matches().filter((m) => m.pages).length);

  open(): void {
    this.entries.set([]);
    this.included.set(new Set());
    this.fileDocs.set([]);
    this.pasteDocs.set([]);
    this.pasteText.set('');
    this.pasteError.set(null);
    this.pasteTooBig.set(false);
    this.fileError.set(null);
    this.tab.set('files');
    this.phase.set('pdfs');
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
    } else if (phase === 'templates') {
      this.phase.set('pdfs');
    } else {
      this.close();
    }
  }

  close(): void {
    const result = this.phase() === 'done' && this.ids.length ? { ids: [...this.ids] } : null;
    this.phase.set('closed');
    this.closed.emit(result);
  }

  // ---- step 1: PDFs ---------------------------------------------------------------------

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addPdfs(Array.from(event.dataTransfer?.files ?? []));
  }

  onPdfsSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addPdfs(files);
  }

  private addPdfs(files: File[]): void {
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length !== files.length) {
      this.toast.error(
        this.i18n.translate('toast.batch.invalidFile', { count: files.length - pdfs.length }),
      );
    }
    const known = new Set(this.store.items().map((item) => pairingKey(item.name)));
    const next = [...this.entries()];
    for (const file of pdfs) {
      const key = pairingKey(file.name);
      next.push({ file, duplicate: known.has(key) });
      known.add(key);
    }
    this.entries.set(next);
  }

  removeEntry(entry: AddAEntry): void {
    this.entries.set(this.entries().filter((e) => e !== entry));
  }

  isIncluded(entry: AddAEntry): boolean {
    return this.included().has(entry.file);
  }

  toggleInclude(entry: AddAEntry): void {
    const next = new Set(this.included());
    if (!next.delete(entry.file)) {
      next.add(entry.file);
    }
    this.included.set(next);
  }

  toTemplates(): void {
    if (this.plan().length > 0) {
      this.phase.set('templates');
    }
  }

  backToPdfs(): void {
    this.phase.set('pdfs');
  }

  // ---- step 2: templates ------------------------------------------------------------------

  async onJsonDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    await this.addJsons(Array.from(event.dataTransfer?.files ?? []));
  }

  async onJsonsSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.addJsons(files);
  }

  private async addJsons(files: File[]): Promise<void> {
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
  }

  clearPasted(): void {
    this.pasteText.set('');
    this.pasteDocs.set([]);
    this.pasteError.set(null);
    this.pasteTooBig.set(false);
  }

  // ---- add ----------------------------------------------------------------------------------

  async apply(): Promise<void> {
    const matches = this.matches();
    if (!matches.length) {
      return;
    }
    this.ids = [];
    this.cancelled = false;
    this.failed.set(0);
    this.doneWithTemplate.set(0);
    this.runNames.set([]);
    this.progress.set({ done: 0, total: matches.length });
    this.phase.set('running');
    let done = 0;
    let withTemplate = 0;
    for (const match of matches) {
      if (this.cancelled) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        const pages: PageAnnotations[] = match.pages ?? [];
        const item = this.store.add({ name: match.entry.file.name, aPdf: match.entry.file, aPages: pages });
        this.ids.push(item.id);
        if (match.pages) {
          withTemplate++;
        }
      } catch {
        this.failed.update((n) => n + 1);
      }
      done++;
      this.progress.set({ done, total: matches.length });
    }
    this.doneCount.set(this.ids.length);
    this.doneWithTemplate.set(withTemplate);
    this.phase.set('done');
  }

  cancelRun(): void {
    this.cancelled = true;
  }
}
