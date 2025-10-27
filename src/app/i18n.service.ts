import { Injectable, Signal, signal } from '@angular/core';
import { caTranslations } from './translations/ca';
import { enTranslations } from './translations/en';
import { esTranslations } from './translations/es';

export type LanguageCode = 'es' | 'en' | 'ca';
export type TranslationParams = Record<string, unknown>;

export interface LanguageOption {
  code: LanguageCode;
  label: string;
}

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  es: 'Español',
  en: 'English',
  ca: 'Català',
};

const TRANSLATIONS: Record<LanguageCode, Record<string, unknown>> = {
  en: enTranslations,
  es: esTranslations,
  ca: caTranslations,
};

const FALLBACK_LANG: LanguageCode = 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languageOptions: LanguageOption[] = Object.entries(LANGUAGE_LABELS).map(([code, label]) => ({
    code: code as LanguageCode,
    label,
  }));

  private readonly lang = signal<LanguageCode>('es');

  readonly currentLang: Signal<LanguageCode> = this.lang.asReadonly();

  setLanguage(lang: string) {
    const normalized = lang.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(TRANSLATIONS, normalized)) {
      this.lang.set(normalized as LanguageCode);
    }
  }

  translate(key: string, params?: TranslationParams): string {
    const lang = this.lang();
    const value = this.resolveValue(key, lang) ?? this.resolveValue(key, FALLBACK_LANG);
    if (typeof value !== 'string') {
      return key;
    }
    if (!params) {
      return value;
    }
    return value.replace(/{{\s*(\w+)\s*}}/g, (match, paramKey) => {
      if (Object.prototype.hasOwnProperty.call(params, paramKey)) {
        const paramValue = params[paramKey];
        return paramValue !== undefined && paramValue !== null ? String(paramValue) : '';
      }
      return match;
    });
  }

  getLanguageLabel(lang: LanguageCode): string {
    return LANGUAGE_LABELS[lang];
  }

  private resolveValue(path: string, lang: LanguageCode): unknown {
    const segments = path.split('.');
    let current: unknown = TRANSLATIONS[lang];
    for (const segment of segments) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
}
