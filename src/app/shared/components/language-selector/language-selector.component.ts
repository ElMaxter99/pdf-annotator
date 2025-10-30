import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { Language } from '../../../core/services/translation.service';

let uniqueId = 0;

const LANGUAGE_FLAGS: Record<Language, string> = {
  'es-ES': '🇪🇸',
  en: '🇬🇧',
  ca: '🏴',
};

function getLanguageFlag(language: Language): string {
  return LANGUAGE_FLAGS[language] ?? '🌐';
}

@Component({
  selector: 'app-language-selector',
  standalone: false,
  templateUrl: './language-selector.component.html',
  styleUrls: ['./language-selector.component.scss'],
  host: {
    class: 'language-selector',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  @Input({ required: true }) languages: readonly Language[] = [];
  @Input({ required: true }) selectedLanguage!: Language;
  @Input() labelTranslationKey = 'app.languageLabel';
  @Input() ariaLabelTranslationKey = 'app.languageAriaLabel';
  @Input() variant: 'default' | 'compact' = 'default';

  @Output() readonly languageChange = new EventEmitter<Language>();

  readonly selectId = `language-select-${++uniqueId}`;
  getFlag(language: Language): string {
    return getLanguageFlag(language);
  }

  @HostBinding('class.language-selector--compact')
  get isCompact() {
    return this.variant === 'compact';
  }

  onLanguageChange(language: Language | string) {
    this.languageChange.emit(language as Language);
  }
}
