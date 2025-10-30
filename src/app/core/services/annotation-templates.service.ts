import { Injectable } from '@angular/core';
import { PageAnnotations, PageField } from '../models/annotation.model';

export interface AnnotationTemplate {
  id: string;
  name: string;
  createdAt: number;
  pages: PageAnnotations[];
}

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

  saveTemplate(name: string, pages: readonly PageAnnotations[]): AnnotationTemplate | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }

    const sanitizedPages = this.clonePages(pages);
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
      };
      templates.splice(existingIndex, 1, updatedTemplate);
      this.writeToStorage(this.templatesKey, templates);
      return { ...updatedTemplate, pages: this.clonePages(updatedTemplate.pages) };
    }

    const template: AnnotationTemplate = {
      id: this.createId(),
      name: normalizedName,
      createdAt: now,
      pages: sanitizedPages,
    };

    this.writeToStorage(this.templatesKey, [template, ...templates]);
    return { ...template, pages: this.clonePages(template.pages) };
  }

  deleteTemplate(id: string) {
    if (id === this.defaultTemplateId) {
      return;
    }
    const storedTemplates = this.getStoredTemplates();
    const nextTemplates = storedTemplates.filter((template) => template.id !== id);
    this.writeToStorage(this.templatesKey, nextTemplates);
  }

  storeLastCoords(pages: readonly PageAnnotations[]) {
    this.writeToStorage(this.lastCoordsKey, this.clonePages(pages));
  }

  loadLastCoords(): PageAnnotations[] | null {
    const stored = this.readFromStorage<PageAnnotations[] | null>(this.lastCoordsKey, null);
    return stored ? this.clonePages(stored) : null;
  }

  private clonePages(pages: readonly PageAnnotations[]): PageAnnotations[] {
    return pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field): PageField => ({ ...field })),
    }));
  }

  private getStoredTemplates(): AnnotationTemplate[] {
    return this.readFromStorage<AnnotationTemplate[]>(this.templatesKey, []).map((template) => ({
      ...template,
      pages: this.clonePages(template.pages),
    }));
  }

  private createDefaultTemplate(): AnnotationTemplate {
    return {
      id: this.defaultTemplateId,
      name: this.defaultTemplateName,
      createdAt: 0,
      pages: [],
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
