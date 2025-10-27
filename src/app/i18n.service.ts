import { Injectable, Signal, signal } from '@angular/core';

export type LanguageCode = 'es' | 'en';
export type TranslationParams = Record<string, unknown>;

export interface LanguageOption {
  code: LanguageCode;
  label: string;
}

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  es: 'Español',
  en: 'English',
};

const TRANSLATIONS: Record<LanguageCode, Record<string, unknown>> = {
  en: {
    header: {
      title: 'PDF Annotator',
      actions: { prev: 'Prev', next: 'Next' },
      pageIndicator: 'Page {{index}} / {{count}}',
      zoomIndicator: 'Zoom {{ value }}×',
      languageLabel: 'Select language',
    },
    actions: {
      clear: 'Clear',
      copy: 'Copy JSON',
      download: 'Download JSON',
      downloadFilename: 'annotations.json',
    },
    lang: {
      es: 'Español',
      en: 'English',
    },
    sidebar: {
      title: 'Annotations (JSON)',
    },
    annotation: {
      placeholder: 'Text...',
    },
    viewer: {
      empty:
        'Upload a PDF and click anywhere to add annotations. Edit them in the preview before confirming ✅.',
    },
  },
  es: {
    header: {
      title: 'Anotador de PDF',
      actions: { prev: 'Anterior', next: 'Siguiente' },
      pageIndicator: 'Página {{index}} / {{count}}',
      zoomIndicator: 'Zoom {{ value }}×',
      languageLabel: 'Seleccionar idioma',
    },
    actions: {
      clear: 'Limpiar',
      copy: 'Copiar JSON',
      download: 'Descargar JSON',
      downloadFilename: 'anotaciones.json',
    },
    lang: {
      es: 'Español',
      en: 'Inglés',
    },
    sidebar: {
      title: 'Anotaciones (JSON)',
    },
    annotation: {
      placeholder: 'Texto...',
    },
    viewer: {
      empty:
        'Sube un PDF y haz clic donde quieras añadir anotaciones. Edítalas en la vista previa antes de confirmar ✅.',
    },
  },
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
