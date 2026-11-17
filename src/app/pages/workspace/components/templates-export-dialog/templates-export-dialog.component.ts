import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FocusTrapDirective } from '../../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { AnnotationTemplate } from '../../../../annotation-templates.service';
import { downloadBlob } from '../../../../utils/download.utils';
import { templateFileNames, templateZipEntry } from '../../../../utils/template-export.utils';
import { createZip, ZipEntry } from '../../../../utils/zip.utils';

type Phase = 'pick' | 'working' | 'done' | 'error';

const ZIP_NAME = 'plantillas.zip';
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Exports several saved templates in one ZIP (one JSON per template). Browser only, no network. */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-templates-export-dialog',
  standalone: true,
  templateUrl: './templates-export-dialog.component.html',
  imports: [FocusTrapDirective, TranslationPipe],
})
export class TemplatesExportDialogComponent {
  /** Saved templates (the default one is never exported). */
  @Input() set templates(value: readonly AnnotationTemplate[]) {
    this.items.set(value);
    this.selected.set(new Set(value.map((template) => template.id)));
  }
  @Output() closed = new EventEmitter<void>();

  readonly items = signal<readonly AnnotationTemplate[]>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly phase = signal<Phase>('pick');
  readonly progress = signal({ done: 0, total: 0, current: '' });
  readonly result = signal({ count: 0, kb: 0 });
  readonly doneNames = signal<readonly string[]>([]);
  private cancelled = false;

  count(): number {
    return this.selected().size;
  }

  allSelected(): boolean {
    return this.items().length > 0 && this.count() === this.items().length;
  }

  toggle(id: string): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.selected.set(next);
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.items().map((t) => t.id)));
  }

  percent(): number {
    const { done, total } = this.progress();
    return total ? Math.round((done / total) * 100) : 0;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.phase() !== 'working') {
      this.closed.emit();
    }
  }

  async export(): Promise<void> {
    const chosen = this.items().filter((template) => this.selected().has(template.id));
    if (!chosen.length) {
      return;
    }
    this.cancelled = false;
    this.doneNames.set([]);
    this.phase.set('working');
    this.progress.set({ done: 0, total: chosen.length, current: '' });
    try {
      const names = templateFileNames(chosen);
      const entries: ZipEntry[] = [];
      for (let i = 0; i < chosen.length; i += 1) {
        this.progress.set({ done: i, total: chosen.length, current: chosen[i].name });
        await nextTick();
        if (this.cancelled) {
          this.phase.set('pick');
          return;
        }
        entries.push(templateZipEntry(chosen[i], names[i]));
        this.doneNames.update((list) => [...list, chosen[i].name]);
      }
      this.progress.set({ done: chosen.length, total: chosen.length, current: '' });
      const zip = createZip(entries);
      downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), ZIP_NAME);
      this.result.set({ count: chosen.length, kb: Math.max(1, Math.round(zip.length / 1024)) });
      this.phase.set('done');
    } catch (error) {
      console.error('No se pudo exportar las plantillas.', error);
      this.phase.set('error');
    }
  }
}
