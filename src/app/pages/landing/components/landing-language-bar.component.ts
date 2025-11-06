import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LanguageSelectorComponent } from '../../../components/language-selector/language-selector.component';
import { Language } from '../../../i18n/translation.service';

@Component({
  selector: 'app-landing-language-bar',
  standalone: true,
  imports: [CommonModule, LanguageSelectorComponent],
  template: `
    <div class="landing__language">
      <app-language-selector
        [languages]="languages"
        [selectedLanguage]="selectedLanguage"
        (languageChange)="languageChange.emit($event)"
        variant="compact"
      ></app-language-selector>
    </div>
  `,
})
export class LandingLanguageBarComponent {
  @Input({ required: true }) languages: readonly Language[] = [];
  @Input({ required: true }) selectedLanguage!: Language;
  @Output() languageChange = new EventEmitter<Language>();
}
