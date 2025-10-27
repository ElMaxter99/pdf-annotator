import { Injectable, computed, signal } from '@angular/core';

import ca from './translations/ca.json';
import en from './translations/en.json';
import es from './translations/es-ES.json';

export const LANGUAGES = ['es-ES', 'en', 'ca'] as const;
export type Language = (typeof LANGUAGES)[number];

type TranslationRecord = typeof es;

const TRANSLATIONS: Record<Language, TranslationRecord> = {
  'es-ES': es,
  en,
  ca,
};

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly languageSignal = signal<Language>('es-ES');

  readonly language = computed(() => this.languageSignal());
  readonly supportedLanguages: readonly Language[] = LANGUAGES;

  translate(key: string, params?: Record<string, unknown>): string {
    const dictionary = TRANSLATIONS[this.languageSignal()];
    const template = this.resolve(dictionary, key);
    if (typeof template !== 'string') {
      return key;
    }
    if (!params) {
      return template;
    }

    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, param: string) => {
      const value = params[param];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  setLanguage(language: Language) {
    if (!TRANSLATIONS[language]) {
      throw new Error(`Unsupported language: ${language}`);
    }
    this.languageSignal.set(language);
  }

  getCurrentLanguage(): Language {
    return this.languageSignal();
  }

  private resolve(dictionary: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>((value, segment) => {
      if (value && typeof value === 'object' && segment in (value as Record<string, unknown>)) {
        return (value as Record<string, unknown>)[segment];
      }
      return undefined;
    }, dictionary);
  }
}
