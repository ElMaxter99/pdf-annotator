import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { PdfThumbComponent } from '../../../../components/pdf-thumb/pdf-thumb.component';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { WorkspacePageComponent } from '../../workspace.page';

type TemplateError = 'tooBig' | 'json' | 'noPages';

/**
 * «Documento» tab while a PDF of a batch is open: the file card and its two optional layers, the
 * template of the original (A) and the new version (B). Replaces the «upload another PDF» zone.
 */
@Component({
  selector: 'app-batch-document',
  standalone: true,
  imports: [CommonModule, TranslationPipe, PdfThumbComponent],
  templateUrl: './batch-document.component.html',
})
export class BatchDocumentComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly pasting = signal(false);
  readonly pasteText = signal('');
  readonly templateError = signal<TemplateError | null>(null);
  readonly pendingReplace = signal<File | null>(null);
  readonly confirmRemoveB = signal(false);
  readonly dropActive = signal(false);

  readonly item = computed(() => this.vm.batchCtx()?.item ?? null);
  readonly fieldsA = computed(
    () => this.item()?.aPages.reduce((sum, page) => sum + page.fields.length, 0) ?? 0,
  );

  openPicker(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  onReplacePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.pendingReplace.set(file);
    }
  }

  async confirmReplace(): Promise<void> {
    const file = this.pendingReplace();
    this.pendingReplace.set(null);
    if (file) {
      await this.vm.batchReplacePdf(file);
    }
  }

  async onTemplateFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.templateError.set(await this.vm.batchSetTemplate({ file }));
    }
  }

  togglePaste(): void {
    this.templateError.set(null);
    this.pasting.update((open) => !open);
  }

  async applyPasted(): Promise<void> {
    const error = await this.vm.batchSetTemplate({ text: this.pasteText() });
    this.templateError.set(error);
    if (!error) {
      this.pasting.set(false);
      this.pasteText.set('');
    }
  }

  async onVersionPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      await this.vm.batchAddVersionB(file);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dropActive.set(true);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dropActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await this.vm.batchAddVersionB(file);
    }
  }

  async removeB(): Promise<void> {
    this.confirmRemoveB.set(false);
    await this.vm.batchRemoveVersionB();
  }
}
