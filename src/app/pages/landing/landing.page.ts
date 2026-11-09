import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../app-version';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { Language, TranslationService } from '../../i18n/translation.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { SessionStoreService, SavedSessionSummary } from '../../services/session-store.service';
import { BatchStoreService } from '../../services/batch-store.service';
import { ToastService } from '../../services/toast.service';
import { PendingFileService } from '../../services/pending-file.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { LandingDropzoneComponent } from './components/dropzone/landing-dropzone.component';
import { LandingFooterComponent } from './components/footer/landing-footer.component';
import { LandingHeroComponent } from './components/hero/landing-hero.component';
import { LandingLanguageBarComponent } from './components/language-bar/landing-language-bar.component';

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
    TranslationPipe,
  ],
})
export class LandingPageComponent {
  private readonly translationService = inject(TranslationService);
  private readonly pendingFileService = inject(PendingFileService);
  private readonly router = inject(Router);
  private readonly metadataService = inject(AppMetadataService);
  private readonly toast = inject(ToastService);
  private readonly sessionStore = inject(SessionStoreService);
  private readonly batchStore = inject(BatchStoreService);
  readonly batchCount = computed(() => this.batchStore.items().length);
  readonly savedSession = signal<SavedSessionSummary | null>(null);

  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly currentYear = new Date().getFullYear();
  readonly appAuthor = APP_AUTHOR;
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  readonly fileDropActive = signal(false);

  @ViewChild(LandingDropzoneComponent)
  private landingDropzoneComponent?: LandingDropzoneComponent;

  constructor() {
    this.metadataService.applyDefaultMetadata();
    if (typeof window !== 'undefined') {
      void this.sessionStore.summary().then((summary) => this.savedSession.set(summary));
      void this.batchStore.load();
    }
  }

  get savedSessionDate(): string {
    const saved = this.savedSession();
    return saved
      ? new Date(saved.savedAt).toLocaleString(this.languageModel, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '';
  }

  async resumeSession() {
    const session = await this.sessionStore.load();
    if (!session) {
      this.savedSession.set(null);
      this.toast.error(this.translationService.translate('toast.sessionRestoreFailed'));
      return;
    }

    const file = new File([session.pdf], session.name, { type: 'application/pdf' });
    this.pendingFileService.setPendingFile(file, {
      coords: session.coords,
      pageIndex: session.pageIndex,
      scale: session.scale,
    });
    await this.router.navigate(['/workspace']);
  }

  async discardSession() {
    await this.sessionStore.clear();
    this.savedSession.set(null);
    this.toast.show(this.translationService.translate('toast.sessionDiscarded'), 'info');
  }

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) {
      return;
    }

    try {
      await this.handleSelection(files);
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

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) {
      return;
    }

    await this.handleSelection(files);
  }

  async continueBatch() {
    await this.router.navigate(['/batch']);
  }

  async discardBatch() {
    await this.batchStore.clear();
    this.toast.show(this.translationService.translate('batch.resume.discarded'), 'info');
  }

  /** One PDF opens the editor as always; several files (or JSON) start a batch. */
  private async handleSelection(files: File[]) {
    if (files.length === 1 && isPdfFile(files[0])) {
      await this.handleFileSelection(files[0]);
      return;
    }

    if (!files.some((file) => isPdfFile(file))) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    const report = await this.batchStore.addFiles(files);
    if (report.added === 0 && this.batchStore.items().length === 0) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    if (report.rejected.length > 0) {
      this.toast.warning(
        this.translationService.translate('batch.upload.rejected', { count: report.rejected.length })
      );
    }
    await this.router.navigate(['/batch']);
  }

  async loadExampleDocument() {
    try {
      const response = await fetch('/examples/factura-ejemplo.pdf');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      await this.handleFileSelection(
        new File([blob], 'factura-ejemplo.pdf', { type: 'application/pdf' })
      );
    } catch (error) {
      console.error('No se pudo cargar el documento de ejemplo.', error);
    }
  }

  private async handleFileSelection(file: File) {
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.pendingFileService.setPendingFile(file);
    await this.router.navigate(['/workspace']);
  }
}
