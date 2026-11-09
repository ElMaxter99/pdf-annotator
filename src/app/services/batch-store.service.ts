import { Injectable, computed, inject, signal } from '@angular/core';
import { FontCatalogService } from '../fonts/font-catalog.service';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import { groupBatchFiles, pairingKey } from '../utils/batch-files.utils';
import { isPdfFile } from '../utils/pdf-file.utils';
import {
  PageSize,
  SizeStrategy,
  pageSizesDiffer,
  scaleAnnotations,
  sizeRuleKey,
} from '../utils/page-size.utils';
import {
  DEFAULT_KEY_FIELD,
  FILE_KEY,
  MatchOutcome,
  detectKeyField,
  matchAll,
  nameSimilarity,
  normalizeMatchName,
  templateLabel,
} from '../utils/template-matching.utils';
import {
  TemplateDocument,
  TemplateTextResult,
  parseTemplateText,
  splitTemplateDocuments,
} from '../utils/template-text.utils';
import { cloneAnnotationPages } from '../utils/annotation-pages.utils';
import { normalizeColor } from '../utils/color.utils';
import { normalizeFieldType } from '../utils/annotation-fields.utils';
import { AnnotationImportService, emptyImportReport } from './annotation-import.service';
import { PdfInfoService } from './pdf-info.service';
import { hashBlob } from '../utils/file-hash.utils';

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
  | 'validated';

export interface TemplateIssue {
  readonly reason: 'empty' | 'no-object' | 'syntax' | 'no-pages';
  readonly line?: number;
  readonly column?: number;
}

/** How a PDF got its template. */
export type BatchMatchKind = 'exact' | 'similar' | 'manual' | 'paste';

/** One template of the pool loaded in bulk (pasted text or a JSON file), before or after pairing. */
export interface BatchTemplate {
  readonly id: string;
  /** File name, or `paste` for text typed into the box. */
  readonly source: string;
  /** Top-level texts (such as `pdfName`) used to pair it with a PDF. */
  readonly keys: Readonly<Record<string, string>>;
  /** Annotations in original coordinates; null when the template could not be read. */
  readonly pages: PageAnnotations[] | null;
  readonly pageCount: number;
  readonly fieldCount: number;
  readonly issue?: TemplateIssue;
  readonly line?: number;
  readonly addedAt: number;
}

export interface TemplateAddReport {
  readonly added: number;
  readonly failed: readonly { readonly line: number; readonly issue: TemplateIssue; readonly label: string }[];
  readonly tooBig: readonly string[];
  readonly unreadable: readonly string[];
}

/** What the pairing screen shows for each PDF. */
export interface MatchState {
  readonly kind: BatchMatchKind | 'choose' | 'none' | 'error';
  readonly templateId?: string;
  readonly candidates: readonly string[];
}

export interface BatchItem {
  readonly id: string;
  readonly name: string;
  readonly pdf: Blob;
  /** SHA-256 of the version A file, to tell a really new PDF from the same one. */
  readonly hash?: string;
  readonly pageCount: number;
  readonly pageSize: PageSize;
  readonly addedAt: number;
  readonly templateName?: string;
  readonly templateText?: string;
  /** Template of the bulk pool this PDF was paired with, and how. */
  readonly templateId?: string;
  readonly matchKind?: BatchMatchKind;
  /** Annotations as pasted (original coordinates). */
  readonly template: PageAnnotations[] | null;
  readonly templateIssue?: TemplateIssue;
  readonly newPdf?: Blob;
  readonly newHash?: string;
  /** The user confirmed (OK + modal) that the coordinates of this PDF are right. */
  readonly validated?: boolean;
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

export type RejectReason = 'notAllowed' | 'tooBig' | 'tooBigJson' | 'invalidJson' | 'duplicate' | 'limit';

export interface RejectedFile {
  readonly name: string;
  readonly reason: RejectReason;
}

export interface AddReport {
  readonly added: number;
  readonly rejected: RejectedFile[];
  readonly templatesAdded: number;
  readonly templatesFailed: number;
}

export const MAX_TEMPLATES = 2000;

export function countFields(pages: readonly PageAnnotations[] | null | undefined): number {
  return (pages ?? []).reduce((total, page) => total + page.fields.length, 0);
}

export function batchStatusOf(item: BatchItem): BatchStatus {
  if (item.templateIssue) return 'templateError';
  if (!item.template) return 'noTemplate';
  if (item.validated) return 'validated';
  if (!item.newPdf) return 'missingNew';
  if (item.relaid) return 'relaid';
  return 'ready';
}

const DB_NAME = 'pdf-annotator-batch';
const STORE = 'items';
const TEMPLATE_STORE = 'templates';
const KEY_FIELD_STORAGE = 'pdf-annotator-batch-key-field';

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
  readonly templates = signal<readonly BatchTemplate[]>([]);
  /** Template field that holds the PDF's name (usually `pdfName`). */
  readonly keyField = signal<string>(DEFAULT_KEY_FIELD);
  readonly loaded = signal(false);
  readonly busy = signal<{ done: number; total: number } | null>(null);
  readonly storage = signal<{ used: number; quota: number } | null>(null);
  readonly totalBytes = computed(() =>
    this.items().reduce((sum, item) => sum + item.pdf.size + (item.newPdf?.size ?? 0), 0)
  );
  /** Pairing state of every PDF: what it got, or what still needs a decision. */
  readonly matchStates = computed(() => {
    const items = this.items();
    const templates = this.templates();
    const outcomes = matchAll(
      items.filter((item) => !item.template && !item.templateIssue).map((item) => ({ id: item.id, name: item.name })),
      templates.filter((template) => !items.some((item) => item.templateId === template.id)),
      this.keyField()
    );
    const states = new Map<string, MatchState>();
    for (const item of items) {
      if (item.templateIssue || item.template) {
        states.set(item.id, {
          kind: item.templateIssue ? 'error' : item.matchKind ?? 'paste',
          templateId: item.templateId,
          candidates: [],
        });
        continue;
      }
      const outcome: MatchOutcome | undefined = outcomes.get(item.id);
      states.set(item.id, {
        kind: outcome?.kind === 'choose' ? 'choose' : 'none',
        candidates: outcome?.kind === 'choose' ? outcome.candidates : [],
      });
    }
    return states;
  });
  /** Templates of the pool that no PDF uses yet. */
  readonly unusedTemplates = computed(() => {
    const used = new Set(this.items().map((item) => item.templateId).filter(Boolean));
    return this.templates().filter((template) => !used.has(template.id));
  });
  /** "Same size change, same choice" rules picked in the page-size dialog (this session only). */
  private readonly sizeRules = new Map<string, SizeStrategy>();
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    this.loadPromise ??= Promise.all([
      this.readAll(),
      this.readAllRaw(TEMPLATE_STORE).then((values) => values.filter(isBatchTemplate)),
    ]).then(([items, templates]) => {
      this.items.set(items.sort((a, b) => a.addedAt - b.addedAt));
      this.templates.set(templates.sort((a, b) => a.addedAt - b.addedAt));
      this.keyField.set(this.storedKeyField() ?? detectKeyField(templates));
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
          hash: await hashBlob(file),
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

    const templateReport = await this.addTemplateFiles(jsons);
    templateReport.tooBig.forEach((name) => rejected.push({ name, reason: 'tooBigJson' }));
    templateReport.unreadable.forEach((name) => rejected.push({ name, reason: 'invalidJson' }));
    this.rematch();

    this.busy.set(null);
    await this.refreshStorage();
    return {
      added,
      rejected,
      templatesAdded: templateReport.added,
      templatesFailed: templateReport.failed.length,
    };
  }

  // ---- bulk templates ---------------------------------------------------------------------------

  /** Reads templates from JSON files (one, many, array or one per line). */
  async addTemplateFiles(files: readonly File[]): Promise<TemplateAddReport> {
    await this.load();
    const total = { added: 0, failed: [] as TemplateAddReport['failed'][number][], tooBig: [] as string[], unreadable: [] as string[] };
    for (const file of files) {
      if (file.size > MAX_TEMPLATE_BYTES) {
        total.tooBig.push(file.name);
        continue;
      }
      const report = await this.addTemplateText(await file.text(), file.name);
      total.added += report.added;
      total.failed.push(...report.failed);
      if (report.added === 0 && report.failed.length === 0) total.unreadable.push(file.name);
    }
    return total;
  }

  /** Adds every template found in the text. Failed ones are reported with their line. */
  async addTemplateText(text: string, source = 'paste'): Promise<TemplateAddReport> {
    await this.load();
    const docs = splitTemplateDocuments(text, MAX_TEMPLATES);
    const room = Math.max(0, MAX_TEMPLATES - this.templates().length);
    const created: BatchTemplate[] = [];
    const failed: TemplateAddReport['failed'][number][] = [];
    const now = Date.now();
    // A broken template from a file is kept (without pages) so its PDF can show the error; one
    // pasted in the box stays in the box for the user to fix.
    const keepFailed = source !== 'paste';
    let added = 0;
    for (const doc of docs) {
      if (!doc.result.ok) {
        failed.push({ line: doc.line, issue: this.issueOf(doc.result), label: this.docLabel(doc) });
        if (keepFailed && created.length < room) {
          created.push(this.toTemplate(doc, source, docs.length === 1, now + created.length));
        }
        continue;
      }
      if (created.length >= room) continue;
      created.push(this.toTemplate(doc, source, docs.length === 1, now + created.length));
      added += 1;
    }
    if (created.length) {
      this.templates.update((list) => [...list, ...created]);
      if (!this.storedKeyField()) this.keyField.set(detectKeyField(this.templates()));
      await this.run(TEMPLATE_STORE, 'readwrite', (store) => created.forEach((t) => store.put(t)));
      this.rematch();
    }
    return { added, failed, tooBig: [], unreadable: [] };
  }

  setKeyField(field: string) {
    this.keyField.set(field);
    try {
      localStorage.setItem(KEY_FIELD_STORAGE, field);
    } catch {
      /* private mode: the choice just lasts this session */
    }
    this.rematch();
  }

  /** Pairs a PDF with a template of the pool by hand; null releases it. */
  assignTemplate(itemId: string, templateId: string | null) {
    const item = this.get(itemId);
    if (!item) return;
    const template = templateId ? this.templates().find((t) => t.id === templateId) : undefined;
    if (!template) {
      this.patch(itemId, this.releasePatch(item));
      return;
    }
    this.patch(itemId, this.assignPatch(item, template, 'manual'));
  }

  async removeTemplates(ids: readonly string[]): Promise<void> {
    const drop = new Set(ids);
    this.templates.update((list) => list.filter((t) => !drop.has(t.id)));
    await this.run(TEMPLATE_STORE, 'readwrite', (store) => ids.forEach((id) => store.delete(id)));
  }

  async clearTemplates(): Promise<void> {
    this.templates.set([]);
    await this.run(TEMPLATE_STORE, 'readwrite', (store) => store.clear());
  }

  templateLabelOf(template: BatchTemplate): string {
    return templateLabel(template, this.keyField(), template.source);
  }

  /** Pairs every PDF that has no hand-made pairing with the template that clearly belongs to it. */
  rematch() {
    const field = this.keyField();
    const items = this.items();
    const manualIds = new Set(
      items.filter((i) => i.matchKind === 'manual' || i.matchKind === 'paste').map((i) => i.templateId).filter(Boolean)
    );
    const autoItems = items.filter((i) => i.matchKind !== 'manual' && i.matchKind !== 'paste');
    const pool = this.templates().filter((t) => !manualIds.has(t.id));
    const outcomes = matchAll(autoItems.map((i) => ({ id: i.id, name: i.name })), pool, field);
    for (const item of autoItems) {
      const outcome = outcomes.get(item.id);
      const template =
        outcome?.templateId && (outcome.kind === 'exact' || outcome.kind === 'similar')
          ? pool.find((t) => t.id === outcome.templateId)
          : undefined;
      if (template) {
        if (item.templateId !== template.id || item.matchKind !== outcome?.kind) {
          this.patch(item.id, this.assignPatch(item, template, outcome!.kind as 'exact' | 'similar'));
        }
      } else if (item.matchKind === 'exact' || item.matchKind === 'similar') {
        this.patch(item.id, this.releasePatch(item));
      }
    }
  }

  private docLabel(doc: TemplateDocument): string {
    return doc.keys[this.keyField()] ?? Object.values(doc.keys)[0] ?? '';
  }

  private issueOf(result: TemplateTextResult): TemplateIssue {
    if (result.ok) return { reason: 'syntax' };
    return { reason: result.reason, line: result.line, column: result.column };
  }

  private toTemplate(doc: TemplateDocument, source: string, single: boolean, addedAt: number): BatchTemplate {
    const keys: Record<string, string> = { ...doc.keys };
    if (single && source !== 'paste') keys[FILE_KEY] = source;
    const pages = doc.result.ok
      ? this.importer.normalizeImportedCoordinates(
          doc.result.data,
          (field) => prepareImportedField(this.fonts, field),
          emptyImportReport()
        ) ?? []
      : null;
    return {
      id: crypto.randomUUID(),
      source,
      keys,
      pages,
      pageCount: pages?.length ?? 0,
      fieldCount: countFields(pages),
      issue: doc.result.ok ? undefined : this.issueOf(doc.result),
      line: doc.line,
      addedAt,
    };
  }

  private assignPatch(item: BatchItem, template: BatchTemplate, kind: BatchMatchKind): Partial<BatchItem> {
    const label = this.templateLabelOf(template);
    if (!template.pages) {
      return {
        templateId: template.id,
        matchKind: kind,
        templateName: label,
        template: null,
        templateIssue: template.issue,
        layout: null,
        relaid: false,
        exported: false,
        validated: false,
      };
    }
    return {
      templateId: template.id,
      matchKind: kind,
      templateName: label,
      templateText: undefined,
      template: template.pages,
      templateIssue: undefined,
      layout:
        item.newPdf && item.sizeStrategy
          ? this.initialLayout(item, template.pages, item.sizeStrategy)
          : null,
      relaid: false,
      exported: false,
      validated: false,
    };
  }

  private releasePatch(item: BatchItem): Partial<BatchItem> {
    return {
      templateId: undefined,
      matchKind: undefined,
      templateName: undefined,
      templateText: undefined,
      template: null,
      templateIssue: undefined,
      layout: item.newPdf && item.sizeStrategy ? null : item.layout,
      relaid: false,
      exported: false,
      validated: false,
    };
  }

  private storedKeyField(): string | null {
    try {
      return localStorage.getItem(KEY_FIELD_STORAGE);
    } catch {
      return null;
    }
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
        matchKind: 'paste',
        templateId: undefined,
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
      templateId: undefined,
      matchKind: 'paste',
      template: pages,
      templateIssue: undefined,
      layout:
        item?.newPdf && item.sizeStrategy
          ? this.initialLayout(item, pages, item.sizeStrategy)
          : item?.layout ?? null,
      relaid: false,
      exported: false,
      validated: false,
    });
    return result;
  }

  async setNewPdf(id: string, file: File, strategy?: SizeStrategy): Promise<PdfSwapResult> {
    const item = this.get(id);
    if (!item) return { ok: false, reason: 'missing' };
    if (file.size > MAX_BATCH_PDF_BYTES) return { ok: false, reason: 'tooBig' };
    let info;
    let hash: string;
    try {
      info = await this.pdfInfo.read(file);
      hash = await hashBlob(file);
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    // The item may have changed while pdf.js was reading the file (pairing, saved layout…).
    const current = this.get(id);
    if (!current) return { ok: false, reason: 'missing' };
    if (await this.isSameContent(current, hash)) return { ok: false, reason: 'same' };
    return this.applyNewPdf(current, file, info, hash, strategy);
  }

  private applyNewPdf(
    item: BatchItem,
    file: File,
    info: { pageCount: number; pageSize: PageSize },
    hash: string,
    strategy?: SizeStrategy
  ): PdfSwapResult {
    const id = item.id;
    const differs = pageSizesDiffer(item.pageSize, info.pageSize);
    const rule = differs ? strategy ?? this.sizeRuleFor(item.pageSize, info.pageSize) : 'keep';
    const next: BatchItem = {
      ...item,
      newPdf: file,
      newHash: hash,
      newName: file.name,
      newPageCount: info.pageCount,
      newPageSize: info.pageSize,
      relaid: false,
      exported: false,
      validated: false,
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
      newHash: undefined,
      validated: false,
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
    this.patch(id, { layout: cloneAnnotationPages(layout), relaid, exported: false, validated: false });
  }

  /** Saves what changed in the compare view: coordinates B (the layout) and/or A (the template). */
  saveCoordinates(
    id: string,
    change: { layout: PageAnnotations[] | null; template: PageAnnotations[] | null }
  ) {
    const item = this.get(id);
    if (!item) return;
    const template = change.template
      ? {
          template: cloneAnnotationPages(change.template),
          templateIssue: undefined,
          // An edited copy must not be replaced when the pool is matched again.
          ...(item.matchKind === 'exact' || item.matchKind === 'similar' ? { matchKind: 'manual' as const } : {}),
        }
      : {};
    const layout = change.layout ? { layout: cloneAnnotationPages(change.layout), relaid: true } : {};
    this.patch(id, { exported: false, validated: false, ...template, ...layout });
  }

  setValidated(id: string, validated: boolean) {
    this.patch(id, { validated });
  }

  /** True when `hash` is the content of version A or of the version B already stored. */
  private async isSameContent(item: BatchItem, hash: string): Promise<boolean> {
    const a = item.hash ?? (await hashBlob(item.pdf));
    return hash === a || (!!item.newHash && hash === item.newHash);
  }

  /** Whether `file` has exactly the content of this PDF (or of its stored version B). */
  async isSame(id: string, file: Blob): Promise<boolean> {
    const item = this.get(id);
    return !!item && this.isSameContent(item, await hashBlob(file));
  }

  /**
   * Decides, for each dropped file, which PDF of the batch it is the version B of. The name pairs
   * them (exact, then similar); content decides whether it is really a different file. Nothing is
   * stored: the caller shows the plan and applies it with `setNewPdf`.
   */
  async planVersionB(files: readonly File[]): Promise<VersionBPlan[]> {
    await this.load();
    const items = this.items();
    const taken = new Set<string>();
    const plans: VersionBPlan[] = [];
    for (const file of files) {
      if (!isPdfFile(file)) {
        plans.push({ file, kind: 'notPdf', candidates: [] });
        continue;
      }
      if (file.size > MAX_BATCH_PDF_BYTES) {
        plans.push({ file, kind: 'tooBig', candidates: [] });
        continue;
      }
      const key = normalizeMatchName(file.name);
      const exact = items.filter((item) => normalizeMatchName(item.name) === key);
      const scored = items
        .map((item) => ({ id: item.id, score: nameSimilarity(file.name, item.name) }))
        .sort((a, b) => b.score - a.score);
      let itemId: string | undefined;
      let similar = false;
      let candidates: string[] = [];
      if (exact.length === 1) {
        itemId = exact[0].id;
      } else if (exact.length > 1) {
        candidates = exact.map((i) => i.id);
      } else if (scored[0] && scored[0].score >= 80 && (!scored[1] || scored[0].score - scored[1].score >= 10)) {
        itemId = scored[0].id;
        similar = true;
      } else {
        candidates = scored.filter((c) => c.score >= 50).slice(0, 4).map((c) => c.id);
      }
      if (itemId && taken.has(itemId)) {
        candidates = [itemId];
        itemId = undefined;
      }
      if (!itemId) {
        plans.push({ file, kind: candidates.length ? 'choose' : 'none', candidates });
        continue;
      }
      taken.add(itemId);
      plans.push({ file, kind: (await this.isSame(itemId, file)) ? 'same' : 'b', itemId, similar, candidates: [] });
    }
    return plans;
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
    await this.clearTemplates();
    await this.refreshStorage();
  }

  /** Next item that still needs work, searching after `afterId` and wrapping around. */
  nextPendingId(afterId?: string): string | null {
    const list = this.items();
    const pending = (item: BatchItem) => batchStatusOf(item) !== 'validated';
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
        const request = indexedDB.open(DB_NAME, 2);
        request.onupgradeneeded = () => {
          for (const name of [STORE, TEMPLATE_STORE]) {
            if (!request.result.objectStoreNames.contains(name)) {
              request.result.createObjectStore(name, { keyPath: 'id' });
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async run(
    storeOrMode: string,
    modeOrAction: IDBTransactionMode | ((store: IDBObjectStore) => void),
    maybeAction?: (store: IDBObjectStore) => void
  ): Promise<void> {
    const storeName = maybeAction ? storeOrMode : STORE;
    const mode = (maybeAction ? modeOrAction : storeOrMode) as IDBTransactionMode;
    const action = (maybeAction ?? modeOrAction) as (store: IDBObjectStore) => void;
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        action(tx.objectStore(storeName));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    }).finally(() => db.close());
  }

  private async readAll(): Promise<BatchItem[]> {
    return (await this.readAllRaw(STORE)).filter(isBatchItem);
  }

  private async readAllRaw(storeName: string): Promise<unknown[]> {
    const db = await this.open();
    if (!db) return [];
    return new Promise<unknown[]>((resolve) => {
      try {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    }).finally(() => db.close());
  }
}

export interface VersionBPlan {
  readonly file: File;
  /** b: different content, ready · same: identical to what is stored · choose/none: needs the user. */
  readonly kind: 'b' | 'same' | 'choose' | 'none' | 'notPdf' | 'tooBig';
  readonly itemId?: string;
  readonly similar?: boolean;
  readonly candidates: readonly string[];
}

export type PdfSwapResult =
  | { ok: true; needsSizeChoice: false }
  | { ok: true; needsSizeChoice: true; from: PageSize; to: PageSize }
  | { ok: false; reason: 'missing' | 'tooBig' | 'unreadable' | 'same' };

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

function isIssue(value: unknown): boolean {
  const v = value as { reason?: unknown } | null;
  return !!v && ['empty', 'no-object', 'syntax', 'no-pages'].includes(v.reason as string);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string')
  );
}

function isBatchTemplate(value: unknown): value is BatchTemplate {
  const v = value as Partial<BatchTemplate> | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.source === 'string' &&
    isStringRecord(v.keys) &&
    (v.pages === null || isPages(v.pages)) &&
    typeof v.pageCount === 'number' &&
    typeof v.fieldCount === 'number' &&
    typeof v.addedAt === 'number' &&
    (v.issue === undefined || isIssue(v.issue))
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
    (v.templateId === undefined || typeof v.templateId === 'string') &&
    (v.matchKind === undefined || ['exact', 'similar', 'manual', 'paste'].includes(v.matchKind)) &&
    typeof v.relaid === 'boolean' &&
    typeof v.exported === 'boolean' &&
    (v.validated === undefined || typeof v.validated === 'boolean') &&
    (v.hash === undefined || typeof v.hash === 'string') &&
    (v.newHash === undefined || typeof v.newHash === 'string')
  );
}
