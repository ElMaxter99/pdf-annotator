import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../../../app-version';
import { Language, TranslationService } from '../../../../core/services/translation.service';
import { PendingPdfService } from '../../../../core/services/pending-pdf.service';

@Component({
  selector: 'app-landing-home-page',
  standalone: false,
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Marketing home view that acts as the public entry point before navigating to the editor workspace.
 */
export class LandingHomePageComponent {
  private readonly router = inject(Router);
  private readonly translationService = inject(TranslationService);
  private readonly pendingPdfService = inject(PendingPdfService);

  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  readonly fileDropActive = signal(false);

  @ViewChild('fileInput', { static: true }) fileInputRef?: ElementRef<HTMLInputElement>;

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  openFilePicker() {
    this.fileDropActive.set(false);
    this.fileInputRef?.nativeElement.click();
  }

  onDropZoneKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }

    event.preventDefault();
    this.openFilePicker();
  }

  onFileDragOver(event: DragEvent) {
    event.preventDefault();
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

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.fileDropActive.set(false);

    const file = event.dataTransfer?.files?.[0] ?? null;
    this.handleSelectedFile(file);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.handleSelectedFile(file);
    input.value = '';
  }

  private handleSelectedFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!this.pendingPdfService.isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.pendingPdfService.setPendingFile(file);
    this.router.navigate(['/editor']);
  }

  @HostListener('document:dragend')
  onGlobalDragEnd() {
    this.fileDropActive.set(false);
  }
}
