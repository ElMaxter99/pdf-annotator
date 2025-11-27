import { Injectable, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

import ca from './translations/ca.json';
import de from './translations/de.json';
import en from './translations/en.json';
import es from './translations/es-ES.json';
import fr from './translations/fr.json';
import it from './translations/it.json';
import pt from './translations/pt.json';

export const LANGUAGES = ['es-ES', 'en', 'ca', 'fr', 'it', 'pt', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

type TranslationRecord = typeof es;

const TRANSLATIONS: Record<Language, TranslationRecord> = {
  'es-ES': es,
  en,
  ca,
  fr,
  it,
  pt,
  de,
};

const LANGUAGE_STORAGE_KEY = 'pdf-annotator.language';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly languageSignal = signal<Language>('es-ES');

  constructor() {
    const storedLanguage = this.readStoredLanguage();
    if (storedLanguage) {
      this.languageSignal.set(storedLanguage);
    }
  }

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
    this.persistLanguage(language);
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

  private readStoredLanguage(): Language | null {
    const storage = this.getLocalStorage();
    if (!storage) {
      return null;
    }

    const storedValue = storage.getItem(LANGUAGE_STORAGE_KEY);
    if (!storedValue) {
      return null;
    }

    return LANGUAGES.includes(storedValue as Language)
      ? (storedValue as Language)
      : null;
  }

  private persistLanguage(language: Language) {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore persistence errors (e.g. storage disabled)
    }
  }

  private getLocalStorage(): Storage | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
