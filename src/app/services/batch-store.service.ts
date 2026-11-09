import { Injectable, computed, inject, signal } from '@angular/core';
import { FontCatalogService } from '../fonts/font-catalog.service';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import {
  groupBatchFiles,
  pairTemplates,
  pairingKey,
} from '../utils/batch-files.utils';
import { isPdfFile } from '../utils/pdf-file.utils';
import {
  PageSize,
  SizeStrategy,
  pageSizesDiffer,
  scaleAnnotations,
  sizeRuleKey,
} from '../utils/page-size.utils';
import { parseTemplateText, TemplateTextResult } from '../utils/template-text.utils';
import { cloneAnnotationPages } from '../utils/annotation-pages.utils';
import { normalizeColor } from '../utils/color.utils';
import { normalizeFieldType } from '../utils/annotation-fields.utils';
import { AnnotationImportService, emptyImportReport } from './annotation-import.service';
import { PdfInfoService } from './pdf-info.service';

export const MAX_BATCH_ITEMS = 50;
/** Provisional per-file limit (to be confirmed); keeps the whole batch within browser quotas. */
export const MAX_BATCH_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
export const STORAGE_WARN_RATIO = 0.7;
export const STORAGE_BLOCK_RATIO = 0.9;

export type BatchStatus =
  | 'noTemplate'
  | 'templateError'
  | 'missingNew'
  | 'ready'
  | 'relaid'
  | 'exported';

export interface TemplateIssue {
  readonly reason: 'empty' | 'no-object' | 'syntax' | 'no-pages';
  readonly line?: number;
  readonly column?: number;
}

export interface BatchItem {
  readonly id: string;
  readonly name: string;
  readonly pdf: Blob;
  readonly pageCount: number;
  readonly pageSize: PageSize;
  readonly addedAt: number;
  readonly templateName?: string;
  readonly templateText?: string;
  /** Annotations as pasted (original coordinates). */
  readonly template: PageAnnotations[] | null;
  readonly templateIssue?: TemplateIssue;
  readonly newPdf?: Blob;
  readonly newName?: string;
  readonly newPageCount?: number;
  readonly newPageSize?: PageSize;
  /** How the annotations were adapted to a new page size; undefined until the user decides. */
  readonly sizeStrategy?: SizeStrategy;
  /** Annotations placed over the new PDF; this is what gets exported. */
  readonly layout: PageAnnotations[] | null;
  readonly relaid: boolean;
  readonly exported: boolean;
}

export type RejectReason = 'notAllowed' | 'tooBig' | 'invalidJson' | 'duplicate' | 'unmatchedJson' | 'limit';

export interface RejectedFile {
  readonly name: string;
  readonly reason: RejectReason;
}

export interface AddReport {
  readonly added: number;
  readonly rejected: RejectedFile[];
}

export function countFields(pages: readonly PageAnnotations[] | null | undefined): number {
  return (pages ?? []).reduce((total, page) => total + page.fields.length, 0);
}

export function batchStatusOf(item: BatchItem): BatchStatus {
  if (item.templateIssue) return 'templateError';
  if (!item.template) return 'noTemplate';
  if (!item.newPdf) return 'missingNew';
  if (item.exported) return 'exported';
  if (item.relaid) return 'relaid';
  return 'ready';
}

const DB_NAME = 'pdf-annotator-batch';
const STORE = 'items';

/** Gives an imported field the same defaults the editor stores. */
function prepareImportedField(fonts: FontCatalogService, field: PageField): PageField {
  return {
    ...field,
    type: normalizeFieldType(field.type),
    color: normalizeColor(field.color),
    fontFamily: fonts.normalizeFontFamily(field.fontFamily),
    opacity: typeof field.opacity === 'number' ? field.opacity : 1,
    backgroundColor: field.backgroundColor ?? null,
    locked: !!field.locked,
    hidden: !!field.hidden,
  };
}

/**
 * Work list for the batch re-layout flow. The PDFs, templates and adjusted annotations live in
 * IndexedDB (browser only) so the batch survives a reload; everything read back is untrusted.
 */
@Injectable({ providedIn: 'root' })
export class BatchStoreService {
  private readonly fonts = inject(FontCatalogService);
  private readonly importer = inject(AnnotationImportService);
  private readonly pdfInfo = inject(PdfInfoService);

  readonly items = signal<readonly BatchItem[]>([]);
  readonly loaded = signal(false);
  readonly busy = signal<{ done: number; total: number } | null>(null);
  readonly storage = signal<{ used: number; quota: number } | null>(null);
  readonly totalBytes = computed(() =>
    this.items().reduce((sum, item) => sum + item.pdf.size + (item.newPdf?.size ?? 0), 0)
  );
  /** "Same size change, same choice" rules picked in the page-size dialog (this session only). */
  private readonly sizeRules = new Map<string, SizeStrategy>();
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    this.loadPromise ??= this.readAll().then((items) => {
      this.items.set(items.sort((a, b) => a.addedAt - b.addedAt));
      this.loaded.set(true);
    });
    return this.loadPromise;
  }

  get(id: string): BatchItem | undefined {
    return this.items().find((item) => item.id === id);
  }

  sizeRuleFor(from: PageSize, to: PageSize): SizeStrategy | undefined {
    return this.sizeRules.get(sizeRuleKey(from, to));
  }

  rememberSizeRule(from: PageSize, to: PageSize, strategy: SizeStrategy) {
    this.sizeRules.set(sizeRuleKey(from, to), strategy);
  }

  async refreshStorage(): Promise<void> {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota) {
        this.storage.set({ used: estimate.usage ?? 0, quota: estimate.quota });
      }
    } catch {
      this.storage.set(null);
    }
  }

  storageRatio(): number {
    const storage = this.storage();
    return storage && storage.quota > 0 ? storage.used / storage.quota : 0;
  }

  /** Adds PDFs (and JSON templates paired by name). Never throws: problems go in the report. */
  async addFiles(files: readonly File[]): Promise<AddReport> {
    await this.load();
    const rejected: RejectedFile[] = [];
    const { pdfs, jsons, others } = groupBatchFiles(files, isPdfFile);
    others.forEach((file) => rejected.push({ name: file.name, reason: 'notAllowed' }));

    const existing = new Set(this.items().map((item) => pairingKey(item.name)));
    const accepted: File[] = [];
    for (const pdf of pdfs) {
      const key = pairingKey(pdf.name);
      if (existing.has(key)) {
        rejected.push({ name: pdf.name, reason: 'duplicate' });
      } else if (pdf.size > MAX_BATCH_PDF_BYTES) {
        rejected.push({ name: pdf.name, reason: 'tooBig' });
      } else if (this.items().length + accepted.length >= MAX_BATCH_ITEMS) {
        rejected.push({ name: pdf.name, reason: 'limit' });
      } else if (this.storageRatio() >= STORAGE_BLOCK_RATIO) {
        rejected.push({ name: pdf.name, reason: 'limit' });
      } else {
        existing.add(key);
        accepted.push(pdf);
      }
    }

    // JSON can also match PDFs that were added to the batch earlier.
    const known = [...this.items().map((item) => ({ name: item.name })), ...accepted];
    const { unmatched } = pairTemplates(known, jsons);
    unmatched.forEach((json) => rejected.push({ name: json.name, reason: 'unmatchedJson' }));
    const templates = new Map<string, File>();
    for (const json of jsons) {
      if (!unmatched.includes(json)) templates.set(pairingKey(json.name), json);
    }

    this.busy.set({ done: 0, total: accepted.length });
    let added = 0;
    const created: BatchItem[] = [];
    for (const [index, file] of accepted.entries()) {
      try {
        const info = await this.pdfInfo.read(file);
        const item: BatchItem = {
          id: crypto.randomUUID(),
          name: file.name,
          pdf: file,
          pageCount: info.pageCount,
          pageSize: info.pageSize,
          addedAt: Date.now() + index,
          template: null,
          layout: null,
          relaid: false,
          exported: false,
        };
        created.push(item);
        added += 1;
      } catch {
        rejected.push({ name: file.name, reason: 'notAllowed' });
      }
      this.busy.set({ done: index + 1, total: accepted.length });
    }
    this.items.update((list) => [...list, ...created]);
    await Promise.all(created.map((item) => this.persist(item)));

    for (const [key, json] of templates) {
      const target = this.items().find((item) => pairingKey(item.name) === key);
      if (!target) continue;
      const issue = await this.applyTemplateFile(target.id, json);
      if (issue === 'invalidJson') rejected.push({ name: json.name, reason: 'invalidJson' });
    }

    this.busy.set(null);
    await this.refreshStorage();
    return { added, rejected };
  }

  async applyTemplateFile(id: string, file: File): Promise<'ok' | 'invalidJson' | 'tooBig'> {
    if (file.size > MAX_TEMPLATE_BYTES) return 'tooBig';
    const text = await file.text();
    const result = this.setTemplateText(id, text, file.name);
    await this.flush(id);
    return result.ok ? 'ok' : 'invalidJson';
  }

  /** Parses pasted text. A failed parse is kept as the item's issue so the list can show it. */
  setTemplateText(id: string, text: string, templateName?: string): TemplateTextResult {
    const result = parseTemplateText(text);
    if (!result.ok) {
      this.patch(id, {
        templateText: text,
        templateName,
        templateIssue: { reason: result.reason, line: result.line, column: result.column },
      });
      return result;
    }
    const pages =
      this.importer.normalizeImportedCoordinates(
        result.data,
        (field) => prepareImportedField(this.fonts, field),
        emptyImportReport()
      ) ?? [];
    const item = this.get(id);
    this.patch(id, {
      templateText: text,
      templateName: templateName ?? item?.templateName,
      template: pages,
      templateIssue: undefined,
      layout:
        item?.newPdf && item.sizeStrategy
          ? this.initialLayout(item, pages, item.sizeStrategy)
          : item?.layout ?? null,
      relaid: false,
      exported: false,
    });
    return result;
  }

  async setNewPdf(id: string, file: File, strategy?: SizeStrategy): Promise<PdfSwapResult> {
    const item = this.get(id);
    if (!item) return { ok: false, reason: 'missing' };
    if (file.size > MAX_BATCH_PDF_BYTES) return { ok: false, reason: 'tooBig' };
    let info;
    try {
      info = await this.pdfInfo.read(file);
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    const differs = pageSizesDiffer(item.pageSize, info.pageSize);
    const rule = differs ? strategy ?? this.sizeRuleFor(item.pageSize, info.pageSize) : 'keep';
    const next: BatchItem = {
      ...item,
      newPdf: file,
      newName: file.name,
      newPageCount: info.pageCount,
      newPageSize: info.pageSize,
      relaid: false,
      exported: false,
    };
    if (differs && !rule) {
      this.patch(id, { ...next, sizeStrategy: undefined, layout: null });
      return { ok: true, needsSizeChoice: true, from: item.pageSize, to: info.pageSize };
    }
    const chosen = rule ?? 'keep';
    this.patch(id, {
      ...next,
      sizeStrategy: chosen,
      layout: this.initialLayout(next, item.template, chosen),
    });
    return { ok: true, needsSizeChoice: false };
  }

  /** Applies the size choice made in the dialog to an item whose new PDF is already stored. */
  applySizeStrategy(id: string, strategy: SizeStrategy, rememberForOthers: boolean) {
    const item = this.get(id);
    if (!item?.newPageSize) return;
    if (rememberForOthers) this.rememberSizeRule(item.pageSize, item.newPageSize, strategy);
    this.patch(id, {
      sizeStrategy: strategy,
      layout: this.initialLayout(item, item.template, strategy),
    });
  }

  clearNewPdf(id: string) {
    this.patch(id, {
      newPdf: undefined,
      newName: undefined,
      newPageCount: undefined,
      newPageSize: undefined,
      sizeStrategy: undefined,
      layout: null,
      relaid: false,
      exported: false,
    });
  }

  saveLayout(id: string, layout: PageAnnotations[], relaid: boolean) {
    this.patch(id, { layout: cloneAnnotationPages(layout), relaid, exported: false });
  }

  markExported(ids: readonly string[]) {
    ids.forEach((id) => this.patch(id, { exported: true }));
  }

  async remove(ids: readonly string[]): Promise<void> {
    const drop = new Set(ids);
    this.items.update((list) => list.filter((item) => !drop.has(item.id)));
    await this.run('readwrite', (store) => ids.forEach((id) => store.delete(id)));
    await this.refreshStorage();
  }

  async clear(): Promise<void> {
    this.items.set([]);
    await this.run('readwrite', (store) => store.clear());
    await this.refreshStorage();
  }

  /** Next item that still needs work, searching after `afterId` and wrapping around. */
  nextPendingId(afterId?: string): string | null {
    const list = this.items();
    const pending = (item: BatchItem) => {
      const status = batchStatusOf(item);
      return status === 'ready' || status === 'missingNew' || status === 'noTemplate' || status === 'templateError';
    };
    const start = afterId ? list.findIndex((item) => item.id === afterId) + 1 : 0;
    const ordered = [...list.slice(start), ...list.slice(0, start)];
    return ordered.find((item) => item.id !== afterId && pending(item))?.id ?? null;
  }

  private initialLayout(
    item: BatchItem,
    template: PageAnnotations[] | null,
    strategy: SizeStrategy = 'keep'
  ): PageAnnotations[] | null {
    if (!template) return null;
    if (strategy === 'scale' && item.newPageSize) {
      return scaleAnnotations(template, item.pageSize, item.newPageSize);
    }
    return cloneAnnotationPages(template);
  }

  private pendingWrites = new Map<string, Promise<void>>();

  private patch(id: string, changes: Partial<BatchItem>) {
    let updated: BatchItem | undefined;
    this.items.update((list) =>
      list.map((item) => {
        if (item.id !== id) return item;
        updated = { ...item, ...changes };
        return updated;
      })
    );
    if (updated) {
      const next = updated;
      const previous = this.pendingWrites.get(id) ?? Promise.resolve();
      this.pendingWrites.set(id, previous.then(() => this.persist(next)));
    }
  }

  private async flush(id: string) {
    await this.pendingWrites.get(id);
  }

  private async persist(item: BatchItem): Promise<void> {
    await this.run('readwrite', (store) => store.put(item));
  }

  private open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async run(mode: IDBTransactionMode, action: (store: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    }).finally(() => db.close());
  }

  private async readAll(): Promise<BatchItem[]> {
    const db = await this.open();
    if (!db) return [];
    const values = await new Promise<unknown[]>((resolve) => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    }).finally(() => db.close());
    return values.filter(isBatchItem);
  }
}

export type PdfSwapResult =
  | { ok: true; needsSizeChoice: false }
  | { ok: true; needsSizeChoice: true; from: PageSize; to: PageSize }
  | { ok: false; reason: 'missing' | 'tooBig' | 'unreadable' };

function isPageSize(value: unknown): value is PageSize {
  const v = value as Partial<PageSize> | null;
  return !!v && Number.isFinite(v.width) && Number.isFinite(v.height);
}

function isPages(value: unknown): value is PageAnnotations[] {
  return (
    Array.isArray(value) &&
    value.every((page) => page && typeof page.num === 'number' && Array.isArray(page.fields))
  );
}

function isBatchItem(value: unknown): value is BatchItem {
  const v = value as Partial<BatchItem> | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    v.pdf instanceof Blob &&
    typeof v.pageCount === 'number' &&
    isPageSize(v.pageSize) &&
    typeof v.addedAt === 'number' &&
    (v.template === null || isPages(v.template)) &&
    (v.layout === null || isPages(v.layout)) &&
    (v.newPdf === undefined || v.newPdf instanceof Blob) &&
    typeof v.relaid === 'boolean' &&
    typeof v.exported === 'boolean'
  );
}
