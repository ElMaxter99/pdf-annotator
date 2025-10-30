import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { Language } from '../../i18n/translation.service';

let uniqueId = 0;

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslationPipe],
  templateUrl: './language-selector.component.html',
  styleUrls: ['./language-selector.component.scss'],
  host: {
    class: 'language-selector'
  }
})
export class LanguageSelectorComponent {
  @Input({ required: true }) languages: readonly Language[] = [];
  @Input({ required: true }) selectedLanguage!: Language;
  @Input() labelTranslationKey = 'app.languageLabel';
  @Input() ariaLabelTranslationKey = 'app.languageAriaLabel';
  @Input() showLabel = false;

  @Output() readonly languageChange = new EventEmitter<Language>();

  readonly selectId = `language-select-${++uniqueId}`;

  onLanguageChange(language: Language | string) {
    this.languageChange.emit(language as Language);
  }
}
