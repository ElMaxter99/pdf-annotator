import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../app-version';
import { Language, TranslationService } from '../../i18n/translation.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { PendingFileService } from '../../services/pending-file.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { LandingDropzoneComponent } from './components/dropzone/landing-dropzone.component';
import { LandingFooterComponent } from './components/footer/landing-footer.component';
import { LandingHeroComponent } from './components/hero/landing-hero.component';
import { LandingLanguageBarComponent } from './components/language-bar/landing-language-bar.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss'],
  imports: [
    CommonModule,
    LandingLanguageBarComponent,
    LandingHeroComponent,
    LandingDropzoneComponent,
    LandingFooterComponent,
  ],
})
export class LandingPageComponent {
  private readonly translationService = inject(TranslationService);
  private readonly pendingFileService = inject(PendingFileService);
  private readonly router = inject(Router);
  private readonly metadataService = inject(AppMetadataService);

  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly currentYear = new Date().getFullYear();
  readonly appAuthor = APP_AUTHOR;
  readonly environmentLabel = environment.name.toUpperCase();
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  readonly fileDropActive = signal(false);

  @ViewChild(LandingDropzoneComponent)
  private landingDropzoneComponent?: LandingDropzoneComponent;

  constructor() {
    this.metadataService.applyDefaultMetadata();
  }

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
      await this.handleFileSelection(file);
    } finally {
      input.value = '';
    }
  }

  openPdfFilePicker() {
    this.fileDropActive.set(false);
    this.landingDropzoneComponent?.triggerFilePicker();
  }

  onFileUploadKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }
    event.preventDefault();
    this.openPdfFilePicker();
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

  async onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.fileDropActive.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    await this.handleFileSelection(file);
  }

  private async handleFileSelection(file: File) {
    if (!isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.pendingFileService.setPendingFile(file);
    await this.router.navigate(['/workspace']);
  }
}
