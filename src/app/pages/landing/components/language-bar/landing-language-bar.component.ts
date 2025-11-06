import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LanguageSelectorComponent } from '../../../../components/language-selector/language-selector.component';
import { Language } from '../../../../i18n/translation.service';

@Component({
  selector: 'app-landing-language-bar',
  standalone: true,
  imports: [CommonModule, LanguageSelectorComponent],
  templateUrl: './landing-language-bar.component.html',
})
export class LandingLanguageBarComponent {
  @Input({ required: true }) languages: readonly Language[] = [];
  @Input({ required: true }) selectedLanguage!: Language;
  @Output() languageChange = new EventEmitter<Language>();
}
