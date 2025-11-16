import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, distinctUntilChanged, take } from 'rxjs';

import { PageAnnotations, PageField } from './models/annotation.model';
import { AnnotationTemplate } from './models/annotation-template.model';
import {
  DEFAULT_GUIDE_SETTINGS,
  GuideSettings,
  cloneGuideSettings,
} from './models/guide-settings.model';
import { CloudTemplatesService } from './services/cloud-templates.service';
import { SessionService } from './services/session.service';

type StoredAnnotationTemplate = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  version?: number;
  workspaceId?: string | null;
  origin?: AnnotationTemplate['origin'];
  syncedAt?: number | null;
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
  private readonly destroyRef = inject(DestroyRef);

  private cachedTemplates: AnnotationTemplate[] = [];
  private activeWorkspaceId: string | null = null;
  private readonly templatesSubject = new BehaviorSubject<AnnotationTemplate[]>([]);

  readonly templates$ = this.templatesSubject.asObservable();

  constructor(
    private readonly cloudTemplatesService: CloudTemplatesService,
    private readonly sessionService: SessionService,
  ) {
    this.cachedTemplates = this.getStoredTemplates();
    this.activeWorkspaceId = this.sessionService.getActiveWorkspaceId();
    this.templatesSubject.next(this.buildVisibleTemplates());

    this.sessionService.activeWorkspace$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((workspaceId) => {
        this.activeWorkspaceId = workspaceId;
        this.templatesSubject.next(this.buildVisibleTemplates());
        this.syncWithRemote(workspaceId);
      });

    if (this.activeWorkspaceId) {
      this.syncWithRemote(this.activeWorkspaceId);
    }
  }

  getTemplates(): AnnotationTemplate[] {
    return this.templatesSubject.value.map((template) => this.cloneTemplate(template));
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
    const normalizedName = name.trim();
    const now = Date.now();
    const workspaceId = this.activeWorkspaceId;
    const templatesByWorkspace = this.filterTemplatesByWorkspace(workspaceId);
    const existingIndex = templatesByWorkspace.findIndex(
      (template) => template.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    );

    let template: AnnotationTemplate;

    if (existingIndex >= 0) {
      const existing = templatesByWorkspace[existingIndex];
      template = {
        ...existing,
        name: normalizedName,
        pages: sanitizedPages,
        guidesEnabled: data.guidesEnabled,
        guideSettings: sanitizedGuideSettings,
        updatedAt: now,
        version: existing.version ?? (workspaceId ? 1 : undefined),
      };
      this.replaceTemplate(existing.id, template);
    } else {
      template = {
        id: this.createId(),
        name: normalizedName,
        createdAt: now,
        updatedAt: now,
        version: workspaceId ? 1 : undefined,
        workspaceId: workspaceId ?? null,
        origin: workspaceId ? 'hybrid' : 'local',
        syncedAt: null,
        pages: sanitizedPages,
        guidesEnabled: data.guidesEnabled,
        guideSettings: sanitizedGuideSettings,
      };
      this.cachedTemplates = [template, ...this.removeTemplatesByName(normalizedName, workspaceId)];
    }

    this.emitAndPersist();

    if (workspaceId) {
      this.pushTemplateToCloud(template, workspaceId);
    }

    return this.cloneTemplate(template);
  }

  deleteTemplate(id: string) {
    if (id === this.defaultTemplateId) {
      return;
    }

    const template = this.cachedTemplates.find((item) => item.id === id);
    if (!template) {
      return;
    }

    this.cachedTemplates = this.cachedTemplates.filter((item) => item.id !== id);
    this.emitAndPersist();

    if (template.workspaceId) {
      this.cloudTemplatesService
        .deleteTemplate(template.id, template.workspaceId)
        .pipe(take(1))
        .subscribe({
          error: (error) =>
            console.warn('No se pudo eliminar la plantilla en la nube.', error),
        });
    }
  }

  storeLastCoords(pages: readonly PageAnnotations[]) {
    this.writeToStorage(this.lastCoordsKey, this.clonePages(pages));
  }

  loadLastCoords(): PageAnnotations[] | null {
    const stored = this.readFromStorage<PageAnnotations[] | null>(this.lastCoordsKey, null);
    return stored ? this.clonePages(stored) : null;
  }

  refreshFromCloud(): void {
    this.syncWithRemote(this.activeWorkspaceId);
  }

  private pushTemplateToCloud(template: AnnotationTemplate, workspaceId: string) {
    this.cloudTemplatesService
      .saveTemplate(template, workspaceId)
      .pipe(take(1))
      .subscribe({
        next: (remoteTemplate) => {
          this.mergeRemoteTemplates([remoteTemplate], workspaceId);
        },
        error: (error) =>
          console.warn('No se pudo sincronizar la plantilla con la nube.', error),
      });
  }

  private replaceTemplate(id: string, replacement: AnnotationTemplate) {
    this.cachedTemplates = this.cachedTemplates.map((template) =>
      template.id === id ? replacement : template
    );
  }

  private removeTemplatesByName(name: string, workspaceId: string | null): AnnotationTemplate[] {
    return this.cachedTemplates.filter((template) => {
      const sameWorkspace = (template.workspaceId ?? null) === (workspaceId ?? null);
      return !sameWorkspace || template.name.toLocaleLowerCase() !== name.toLocaleLowerCase();
    });
  }

  private filterTemplatesByWorkspace(workspaceId: string | null): AnnotationTemplate[] {
    return this.cachedTemplates.filter(
      (template) => (template.workspaceId ?? null) === (workspaceId ?? null)
    );
  }

  private syncWithRemote(workspaceId: string | null) {
    if (!workspaceId) {
      this.emitAndPersist();
      return;
    }

    this.cloudTemplatesService
      .listTemplates(workspaceId)
      .pipe(take(1))
      .subscribe({
        next: (remoteTemplates) => {
          this.mergeRemoteTemplates(remoteTemplates, workspaceId);
        },
        error: (error) =>
          console.warn('No se pudo sincronizar las plantillas con la nube.', error),
      });
  }

  private mergeRemoteTemplates(templates: readonly AnnotationTemplate[], workspaceId: string) {
    const localTemplates = this.cachedTemplates.filter(
      (template) => template.workspaceId === workspaceId
    );
    const otherTemplates = this.cachedTemplates.filter(
      (template) => template.workspaceId !== workspaceId
    );

    const mergedMap = new Map<string, AnnotationTemplate>();
    for (const template of localTemplates) {
      mergedMap.set(template.id, template);
    }

    const now = Date.now();

    for (const remote of templates) {
      const existing = mergedMap.get(remote.id);
      if (!existing) {
        mergedMap.set(remote.id, {
          ...remote,
          workspaceId,
          origin: 'remote',
          syncedAt: now,
        });
        continue;
      }

      const localTimestamp = existing.updatedAt ?? existing.createdAt;
      const remoteTimestamp = remote.updatedAt ?? remote.createdAt;

      if (remoteTimestamp >= localTimestamp) {
        mergedMap.set(remote.id, {
          ...remote,
          workspaceId,
          origin: 'remote',
          syncedAt: now,
        });
      }
    }

    this.cachedTemplates = [...otherTemplates, ...mergedMap.values()];
    this.emitAndPersist();
  }

  private emitAndPersist() {
    this.templatesSubject.next(this.buildVisibleTemplates());
    this.persistStoredTemplates();
  }

  private buildVisibleTemplates(): AnnotationTemplate[] {
    const visible = this.cachedTemplates.filter((template) => {
      const workspaceMatch =
        !template.workspaceId || template.workspaceId === this.activeWorkspaceId;
      return workspaceMatch;
    });

    return [
      this.createDefaultTemplate(),
      ...visible.map((template) => this.cloneTemplate(template)),
    ];
  }

  private persistStoredTemplates() {
    const serialized = this.cachedTemplates.map((template) => this.cloneTemplate(template));
    this.writeToStorage(this.templatesKey, serialized);
  }

  private getStoredTemplates(): AnnotationTemplate[] {
    const stored = this.readFromStorage<StoredAnnotationTemplate[]>(this.templatesKey, []);
    return stored.map((template) => ({
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      version: template.version,
      workspaceId: template.workspaceId ?? null,
      origin: template.origin ?? (template.workspaceId ? 'remote' : 'local'),
      syncedAt: template.syncedAt ?? null,
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
      updatedAt: 0,
      workspaceId: null,
      origin: 'system',
      syncedAt: null,
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
}
