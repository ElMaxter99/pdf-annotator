import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, Inject, ViewChild, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../../../app-version';
import { EditorBootstrapService } from '../../../../core/services/editor-bootstrap.service';
import { Language, TranslationService } from '../../../../core/i18n/translation.service';

const PDF_MIME = 'application/pdf';

@Component({
  selector: 'app-landing-home-page',
  templateUrl: './landing-home.page.html',
  styleUrls: ['./landing-home.page.scss'],
})
export class LandingHomePageComponent {
  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;

  readonly fileDropActive = signal(false);
  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  readonly languages: readonly Language[];

  languageModel: Language;

  constructor(
    private readonly translationService: TranslationService,
    private readonly editorBootstrap: EditorBootstrapService,
    private readonly router: Router,
    private readonly meta: Meta,
    private readonly title: Title,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {
    this.languages = this.translationService.supportedLanguages;
    this.languageModel = this.translationService.getCurrentLanguage();
    this.configureMetadata();
  }

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  openPdfFilePicker() {
    this.fileDropActive.set(false);
    const input = this.pdfFileInputRef?.nativeElement;
    if (!input) {
      return;
    }

    input.value = '';
    input.click();
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
    await this.processFile(file);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      await this.processFile(file);
    } finally {
      input.value = '';
    }
  }

  private async processFile(file: File) {
    if (!this.isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.editorBootstrap.setPendingFile(file);
    await this.router.navigate(['/editor']);
  }

  private isPdfFile(file: File) {
    if (!file.type) {
      return file.name.toLowerCase().endsWith('.pdf');
    }
    return file.type === PDF_MIME || file.name.toLowerCase().endsWith('.pdf');
  }

  private configureMetadata() {
    const appTitle = 'PDF Annotator | Diseña anotaciones precisas para tus PDFs';
    const description =
      'Carga un PDF, marca regiones clave y exporta coordenadas listas para integrarlas en tus flujos de trabajo.';
    const fallbackOrigin = 'https://pdf-annotator-rho.vercel.app';
    const documentLocation = this.document?.location;
    const baseUrl = (documentLocation?.origin ?? fallbackOrigin).replace(/\/$/, '');
    const imageUrl = `${baseUrl}/og-image.svg`;

    this.title.setTitle(appTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: appTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:site_name', content: 'PDF Annotator' });
    this.meta.updateTag({ property: 'og:url', content: baseUrl });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({
      property: 'og:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: appTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({
      name: 'twitter:image',
      content: imageUrl,
    });
    this.meta.updateTag({
      name: 'twitter:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });
  }
}
