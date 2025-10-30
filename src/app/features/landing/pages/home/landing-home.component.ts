import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AppMetadataService } from '../../../../core/services/app-metadata.service';
import { PendingPdfService } from '../../../../core/services/pending-pdf.service';
import { Language, TranslationService } from '../../../../core/services/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../../../app-version';
import { LanguageSelectorComponent } from '../../../../shared/components/language-selector/language-selector.component';
import { LandingHeroComponent } from '../../components/hero/landing-hero.component';
import { LandingDropzoneComponent } from '../../components/dropzone/landing-dropzone.component';
import { LandingFooterComponent } from '../../components/footer/landing-footer.component';

@Component({
  selector: 'app-landing-home',
  standalone: true,
  imports: [
    CommonModule,
    LanguageSelectorComponent,
    LandingHeroComponent,
    LandingDropzoneComponent,
    LandingFooterComponent,
  ],
  templateUrl: './landing-home.component.html',
  styleUrls: ['./landing-home.component.scss'],
})
export class LandingHomeComponent {
  readonly appName = APP_NAME;
  readonly appAuthor = APP_AUTHOR;
  readonly version = APP_VERSION;
  readonly currentYear = new Date().getFullYear();
  readonly languages = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  constructor(
    private readonly translationService: TranslationService,
    private readonly router: Router,
    private readonly pendingPdf: PendingPdfService,
    metadata: AppMetadataService,
  ) {
    metadata.initialize();
  }

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  async onFileReceived(file: File) {
    await this.processFile(file);
  }

  private async processFile(file: File) {
    if (!this.isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    this.pendingPdf.setFile(file);
    await this.router.navigate(['/editor']);
  }

  private isPdfFile(file: File) {
    if (!file.type) {
      return file.name.toLowerCase().endsWith('.pdf');
    }

    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
