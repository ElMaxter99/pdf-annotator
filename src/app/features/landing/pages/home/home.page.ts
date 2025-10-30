import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../../../app-version';
import { Language, TranslationService } from '../../../../core/services/translation.service';

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

  readonly appName = APP_NAME;
  readonly version = APP_VERSION;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  readonly fileDropActive = signal(false);

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  navigateToEditor() {
    this.router.navigate(['/editor']);
  }

  onDropZoneKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }

    event.preventDefault();
    this.navigateToEditor();
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
    this.navigateToEditor();
  }

  @HostListener('document:dragend')
  onGlobalDragEnd() {
    this.fileDropActive.set(false);
  }
}
