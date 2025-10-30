import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../../../app-version';
import { EditorFileQueueService } from '../../../../core/services/editor-file-queue.service';
import { Language, TranslationService } from '../../../../core/i18n/translation.service';

/**
 * Public landing page where the user can pick a PDF before jumping to the
 * editor. The component delegates the heavy lifting to the editor module by
 * storing the selected file in {@link EditorFileQueueService}.
 */
@Component({
  selector: 'app-landing-home',
  standalone: false,
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();

  private readonly translationService = inject(TranslationService);
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();

  readonly fileDropActive = signal(false);

  private readonly router = inject(Router);
  private readonly fileQueue = inject(EditorFileQueueService);

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.forwardFileToEditor(file);
    } finally {
      input.value = '';
    }
  }

  async onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.fileDropActive.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    await this.forwardFileToEditor(file);
  }

  onFileDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.fileDropActive.set(true);
  }

  onFileDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
    }
    this.fileDropActive.set(false);
  }

  openPdfFilePicker(input: HTMLInputElement | null) {
    if (!input) {
      return;
    }

    this.fileDropActive.set(false);
    input.value = '';
    input.click();
  }

  @HostListener('window:dragend')
  onGlobalDragEnd() {
    this.fileDropActive.set(false);
  }

  async onFileUploadKeydown(event: KeyboardEvent, input: HTMLInputElement | null) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }
    event.preventDefault();
    this.openPdfFilePicker(input);
  }

  private async forwardFileToEditor(file: File) {
    if (!this.isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.fileQueue.setPendingFile(file);
    await this.router.navigate(['/editor']);
  }

  private isPdfFile(file: File) {
    if (!file.type) {
      return file.name.toLowerCase().endsWith('.pdf');
    }

    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
