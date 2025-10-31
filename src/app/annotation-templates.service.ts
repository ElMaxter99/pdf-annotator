import { Injectable } from '@angular/core';
import { PageAnnotations, PageField } from './models/annotation.model';
import {
  DEFAULT_GUIDE_SETTINGS,
  GuideSettings,
  cloneGuideSettings,
} from './models/guide-settings.model';

export interface AnnotationTemplate {
  id: string;
  name: string;
  createdAt: number;
  pages: PageAnnotations[];
  guidesEnabled: boolean;
  guideSettings: GuideSettings;
}

type StoredAnnotationTemplate = {
  id: string;
  name: string;
  createdAt: number;
  pages?: PageAnnotations[];
  guidesEnabled?: boolean;
  guideSettings?: Partial<GuideSettings> | null;
};

@Injectable({ providedIn: 'root' })
export class AnnotationTemplatesService {
  private readonly templatesKey = 'pdf-annotator.templates';
  private readonly lastCoordsKey = 'pdf-annotator.last-coords';
  readonly defaultTemplateId = '__default-template__';
  private readonly defaultTemplateName = 'Predeterminada';

  getTemplates(): AnnotationTemplate[] {
    const stored = this.getStoredTemplates();
    return [this.createDefaultTemplate(), ...stored];
  }

  saveTemplate(
    name: string,
    data: {
      pages: readonly PageAnnotations[];
      guidesEnabled: boolean;
      guideSettings: GuideSettings;
    }
  ): AnnotationTemplate | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }

    const sanitizedPages = this.clonePages(data.pages);
    const sanitizedGuideSettings = cloneGuideSettings(data.guideSettings);
    const templates = this.getStoredTemplates();
    const normalizedName = name.trim();
    const now = Date.now();
    const existingIndex = templates.findIndex(
      (template) => template.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    );

    if (existingIndex >= 0) {
      const updatedTemplate: AnnotationTemplate = {
        ...templates[existingIndex],
        name: normalizedName,
        createdAt: now,
        pages: sanitizedPages,
        guidesEnabled: data.guidesEnabled,
        guideSettings: sanitizedGuideSettings,
      };
      templates.splice(existingIndex, 1, updatedTemplate);
      this.persistTemplates(templates);
      return this.cloneTemplate(updatedTemplate);
    }

    const template: AnnotationTemplate = {
      id: this.createId(),
      name: normalizedName,
      createdAt: now,
      pages: sanitizedPages,
      guidesEnabled: data.guidesEnabled,
      guideSettings: sanitizedGuideSettings,
    };

    this.persistTemplates([template, ...templates]);
    return this.cloneTemplate(template);
  }

  deleteTemplate(id: string) {
    if (id === this.defaultTemplateId) {
      return;
    }
    const storedTemplates = this.getStoredTemplates();
    const nextTemplates = storedTemplates.filter((template) => template.id !== id);
    this.persistTemplates(nextTemplates);
  }

  storeLastCoords(pages: readonly PageAnnotations[]) {
    this.writeToStorage(this.lastCoordsKey, this.clonePages(pages));
  }

  loadLastCoords(): PageAnnotations[] | null {
    const stored = this.readFromStorage<PageAnnotations[] | null>(this.lastCoordsKey, null);
    return stored ? this.clonePages(stored) : null;
  }

  private persistTemplates(templates: readonly AnnotationTemplate[]) {
    this.writeToStorage(
      this.templatesKey,
      templates.map((template) => this.cloneTemplate(template))
    );
  }

  private normalizeGuideSettings(
    settings: Partial<GuideSettings> | null | undefined
  ): GuideSettings {
    if (!settings) {
      return cloneGuideSettings(DEFAULT_GUIDE_SETTINGS);
    }

    const merged: GuideSettings = {
      ...DEFAULT_GUIDE_SETTINGS,
      ...settings,
      snapPointsX: Array.isArray(settings.snapPointsX)
        ? settings.snapPointsX
        : DEFAULT_GUIDE_SETTINGS.snapPointsX,
      snapPointsY: Array.isArray(settings.snapPointsY)
        ? settings.snapPointsY
        : DEFAULT_GUIDE_SETTINGS.snapPointsY,
    };

    return cloneGuideSettings(merged);
  }

  private cloneTemplate(template: AnnotationTemplate): AnnotationTemplate {
    return {
      ...template,
      pages: this.clonePages(template.pages),
      guideSettings: cloneGuideSettings(template.guideSettings),
    };
  }

  private clonePages(pages: readonly PageAnnotations[]): PageAnnotations[] {
    return pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field): PageField => ({ ...field })),
    }));
  }

  private getStoredTemplates(): AnnotationTemplate[] {
    const stored = this.readFromStorage<StoredAnnotationTemplate[]>(this.templatesKey, []);
    return stored.map((template) => ({
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      pages: this.clonePages(template.pages ?? []),
      guidesEnabled: template.guidesEnabled ?? false,
      guideSettings: this.normalizeGuideSettings(template.guideSettings),
    }));
  }

  private createDefaultTemplate(): AnnotationTemplate {
    return {
      id: this.defaultTemplateId,
      name: this.defaultTemplateName,
      createdAt: 0,
      pages: [],
      guidesEnabled: false,
      guideSettings: cloneGuideSettings(DEFAULT_GUIDE_SETTINGS),
    };
  }

  private createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private readFromStorage<T>(key: string, fallback: T): T {
    const storage = this.getStorage();
    if (!storage) {
      return fallback;
    }

    try {
      const rawValue = storage.getItem(key);
      if (!rawValue) {
        return fallback;
      }
      return JSON.parse(rawValue) as T;
    } catch {
      return fallback;
    }
  }

  private writeToStorage<T>(key: string, value: T) {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      if (value === null || (Array.isArray(value) && value.length === 0)) {
        storage.removeItem(key);
        return;
      }

      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        console.warn('Storage quota exceeded, persistence disabled for key:', key);
      }
    }
  }

  private isQuotaExceededError(error: unknown): boolean {
    if (typeof DOMException === 'undefined') {
      return false;
    }

    return (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22)
    );
  }
}
