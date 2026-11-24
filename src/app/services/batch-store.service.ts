import { sanitizeAiRun, type AiRunRecord } from '../utils/ai-run.utils';
import type { KindFilter } from '../utils/batch-summary.utils';
import { DEFAULT_BATCH_SORT, type BatchSort } from '../utils/batch-sort.utils';
import { isValidStamp } from '../utils/status-time.utils';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import type { PageAnnotations } from '../models/annotation.model';
import type { AiSavedProposal, BatchItem, FieldLink, PageMapData } from '../models/batch.model';
import { sanitizeDetails, sanitizeRow } from '../utils/ai-proposal.utils';
import { sanitizeAiEdits } from '../utils/ai-session.utils';
import { ProjectStoreService } from './project-store.service';
import { sanitizePageMap } from '../utils/page-map.utils';
import { cleanAiInstructions } from '../utils/ai-instructions.utils';

const DB_NAME = 'pdf-annotator-batch';
const STORE = 'items';
/** Larger PDFs are not persisted, to stay well within browser storage quotas. */
export const MAX_BATCH_PDF_BYTES = 40 * 1024 * 1024;

/** Key of the batch-wide settings record in the same IndexedDB store (never an item: items have a UUID). */
const SETTINGS_KEY = '__batch-settings__';

/** Settings of the whole batch, not of one PDF. */
export interface BatchSettings {
  /** Instructions for the AI for every PDF of the batch (A6); a PDF can override them. */
  readonly aiInstructions: string;
  /** Borrador de la última pasada de «Trasladar con IA» (P-127); `null` = nada que recuperar. */
  readonly aiRun?: AiRunRecord | null;
}

/** Where a batch that belongs to a desktop project is mirrored (the folder on disk) instead of IndexedDB. */
export interface BatchSink {
  save(item: BatchItem): void;
  remove(id: string): void;
  /** Batch-wide settings (optional: a read-only project keeps them in memory only). */
  saveSettings?(settings: BatchSettings): void;
}

/**
 * The batch of PDFs being migrated (A = original, B = new version). Everything lives in the
 * user's browser: items are kept in memory and mirrored to IndexedDB, and every storage error is
 * swallowed (private mode, quota) so the batch still works for the current visit.
 */
@Injectable({ providedIn: 'root' })
export class BatchStoreService {
  readonly items = signal<BatchItem[]>([]);
  readonly loaded = signal(false);
  /** Id of the item open in the workspace, if any. */
  readonly activeId = signal<string | null>(null);
  readonly activeItem = computed(
    () => this.items().find((item) => item.id === this.activeId()) ?? null,
  );
  /** Set to `false` when the browser refuses to keep the batch between visits. */
  readonly persistent = signal(true);
  /** Files chosen in the landing/steps that are not a batch yet (kept in memory only). */
  readonly draft = signal<{ pdfs: File[]; jsons: File[] } | null>(null);
  /** Instructions for the AI for the whole batch (A6); each PDF can override them (`BatchItem.aiInstructions`). */
  readonly aiInstructions = signal('');
  /** Draft of the last AI run, so a closed app can offer to pick it up again (P-127). */
  readonly aiRun = signal<AiRunRecord | null>(null);
  private readonly injector = inject(Injector);
  /** Desktop project mirror: `null` = browser storage; in read-only projects nothing is saved at all. */
  private sink: BatchSink | null = null;
  private projectMode: 'none' | 'rw' | 'ro' = 'none';

  /** Puts the items of a desktop project in memory; from now on changes go to its folder (or nowhere if read-only). */
  attachProject(
    items: BatchItem[],
    sink: BatchSink | null,
    settings?: Partial<BatchSettings> | null,
  ): void {
    this.closedNotices.set({});
    this.resetPanelFilters();
    this.items.set(items);
    this.aiInstructions.set(cleanAiInstructions(settings?.aiInstructions));
    this.aiRun.set(sanitizeAiRun(settings?.aiRun));
    this.activeId.set(null);
    this.sink = sink;
    this.projectMode = sink ? 'rw' : 'ro';
    this.persistent.set(true);
    this.loaded.set(true);
  }

  /** Leaves the project: the batch goes back to browser storage and memory is emptied (the folder keeps everything). */
  detachProject(): void {
    this.sink = null;
    this.projectMode = 'none';
    this.items.set([]);
    this.aiInstructions.set('');
    this.aiRun.set(null);
    this.activeId.set(null);
    this.closedNotices.set({});
    this.resetPanelFilters();
    this.loaded.set(false);
  }

  /** The project lost its lock (another computer took it): keep working in memory without saving. */
  dropSink(): void {
    this.sink = null;
    this.projectMode = 'ro';
  }

  async load(): Promise<void> {
    if (this.loaded()) {
      return;
    }
    if (typeof window !== 'undefined' && (await this.injector.get(ProjectStoreService).restore())) {
      return;
    }
    const [stored, settings] = await Promise.all([this.readAll(), this.readSettings()]);
    if (settings && !this.aiInstructions()) {
      this.aiInstructions.set(cleanAiInstructions(settings.aiInstructions));
    }
    if (settings && !this.aiRun()) {
      this.aiRun.set(settings.aiRun ?? null);
    }
    // Items added before the read finished win over stored ones with the same id.
    const known = new Set(this.items().map((item) => item.id));
    this.items.update((current) => [...current, ...stored.filter((item) => !known.has(item.id))]);
    this.loaded.set(true);
  }

  startDraft(pdfs: File[]): void {
    this.draft.set({ pdfs, jsons: [] });
  }

  private lastAddedAt = 0;

  add(init: { name: string; aPdf: Blob; aPages: PageAnnotations[] }): BatchItem {
    const addedAt = Math.max(Date.now(), this.lastAddedAt + 1);
    this.lastAddedAt = addedAt;
    const item: BatchItem = {
      id: newId(),
      addedAt,
      name: init.name,
      aPdf: init.aPdf,
      aPages: init.aPages,
      bPdf: null,
      bName: null,
      bPages: null,
      bJson: null,
      links: [],
      dismissed: [],
      status: 'review',
      updatedAt: Date.now(),
    };
    this.items.update((items) => [...items, item]);
    this.persist(item);
    return item;
  }

  /** Replaces the template of A (used when a JSON is attached after the fact). */
  setTemplate(id: string, pages: PageAnnotations[]): void {
    this.patch(id, { aPages: pages, aiProposal: undefined });
  }

  /** Keeps the AI proposal of a pair until it is reviewed. Changing B or A drops it (the ids would no longer match). */
  setAiProposal(id: string, proposal: AiSavedProposal | undefined): void {
    this.patch(id, { aiProposal: proposal });
  }

  /** Remembers whether the coordinates of A are scaled to the page size of B. */
  /** Instructions for the AI for the whole batch (A6). Saved with the batch; untrusted when read back. */
  setBatchAiInstructions(text: string): void {
    const clean = cleanAiInstructions(text);
    if (clean === this.aiInstructions()) {
      return;
    }
    this.aiInstructions.set(clean);
    this.saveSettings();
  }

  /** Saves (or clears with `null`) the draft of the AI run; it lives next to the batch, in the same place. */
  setAiRun(record: AiRunRecord | null): void {
    this.aiRun.set(record);
    this.saveSettings();
  }

  private saveSettings(): void {
    const run = this.aiRun();
    const settings: BatchSettings = run
      ? { aiInstructions: this.aiInstructions(), aiRun: run }
      : { aiInstructions: this.aiInstructions() };
    if (this.projectMode !== 'none') {
      this.sink?.saveSettings?.(settings);
      return;
    }
    void this.run('readwrite', (store) => store.put(settings, SETTINGS_KEY));
  }

  /** Instructions for this PDF only; `undefined` = follow the batch again. */
  setItemAiInstructions(id: string, text: string | undefined): void {
    const next = text === undefined ? undefined : cleanAiInstructions(text);
    if (this.find(id)?.aiInstructions === next) {
      return;
    }
    this.patch(id, { aiInstructions: next });
  }

  setFitA(id: string, fit: boolean | undefined): void {
    this.patch(id, { fitA: fit });
  }

  /** Remembers which page of A each page of B is compared with (`undefined` = by number). */
  setPageMap(id: string, map: PageMapData | undefined): void {
    this.patch(id, { pageMap: map, aiProposal: undefined });
  }

  /** Attaches (or replaces) B. A new B starts empty and needs review again. */
  setB(id: string, file: File): void {
    this.patch(id, {
      bPdf: file,
      bName: file.name,
      bPages: null,
      bJson: null,
      links: [],
      dismissed: [],
      fitA: undefined,
      aiProposal: undefined,
      status: 'review',
    });
  }

  /** Swaps the PDF being edited (B when there is one, otherwise A) keeping everything else. */
  replacePdf(id: string, file: File): void {
    const item = this.find(id);
    if (!item) {
      return;
    }
    this.patch(
      id,
      item.bPdf
        ? { bPdf: file, bName: file.name, fitA: undefined, aiProposal: undefined }
        : { aPdf: file, name: file.name, aiProposal: undefined, pageMap: undefined },
    );
  }

  removeB(id: string): void {
    this.patch(id, {
      bPdf: null,
      bName: null,
      bPages: null,
      bJson: null,
      links: [],
      dismissed: [],
      aiProposal: undefined,
      pageMap: undefined,
      status: 'review',
    });
  }

  saveB(id: string, pages: PageAnnotations[], json: string): void {
    const item = this.find(id);
    if (!item) {
      return;
    }
    // Editing a validated item takes it back to review.
    this.patch(id, { bPages: pages, bJson: json, status: 'review' });
  }

  setStatus(id: string, status: BatchItem['status']): void {
    this.patch(id, { status });
  }

  dismiss(id: string, key: string): void {
    const item = this.find(id);
    if (item && !item.dismissed.includes(key)) {
      this.patch(id, { dismissed: [...item.dismissed, key] });
    }
  }

  restore(id: string, key: string): void {
    const item = this.find(id);
    if (item) {
      this.patch(id, { dismissed: item.dismissed.filter((k) => k !== key) });
    }
  }

  link(id: string, link: FieldLink): void {
    const item = this.find(id);
    if (item) {
      const rest = item.links.filter((l) => !(l.page === link.page && l.b === link.b));
      this.patch(id, { links: [...rest, link] });
    }
  }

  unlink(id: string, page: number, b: string): void {
    const item = this.find(id);
    if (item) {
      this.patch(id, { links: item.links.filter((l) => !(l.page === page && l.b === b)) });
    }
  }

  remove(id: string): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
    if (this.activeId() === id) {
      this.activeId.set(null);
    }
    this.deleteStored(id);
  }

  /** Removes several items at once; `reinsert` puts them back (used by «Deshacer»). */
  removeMany(ids: readonly string[]): BatchItem[] {
    const gone = new Set(ids);
    const removed = this.items().filter((item) => gone.has(item.id));
    this.items.update((items) => items.filter((item) => !gone.has(item.id)));
    const active = this.activeId();
    if (active && gone.has(active)) {
      this.activeId.set(null);
    }
    for (const item of removed) {
      this.deleteStored(item.id);
    }
    return removed;
  }

  reinsert(removed: readonly BatchItem[]): void {
    const known = new Set(this.items().map((item) => item.id));
    const back = removed.filter((item) => !known.has(item.id));
    this.items.update((items) => [...items, ...back]);
    for (const item of back) {
      this.persist(item);
    }
  }

  setStatusMany(ids: readonly string[], status: BatchItem['status']): void {
    for (const id of ids) {
      this.patch(id, { status });
    }
  }

  /** Empties the batch (memory and IndexedDB); resolves once the stored copy is gone too. */
  /** Notices of the editor that were closed (`itemId:notice` → what they were about). In memory only. */
  readonly closedNotices = signal<Record<string, string>>({});

  /** Filters of the batch panel (search, state, «what they have»). They live here, not in the page, so they survive going into a PDF and back. In memory only; they reset when the batch changes. */
  readonly panelQuery = signal('');
  readonly panelFilter = signal<'all' | 'review' | 'ready'>('all');
  readonly panelKind = signal<KindFilter>('any');
  readonly panelSort = signal<BatchSort>(DEFAULT_BATCH_SORT);

  private resetPanelFilters(): void {
    this.panelQuery.set('');
    this.panelFilter.set('all');
    this.panelKind.set('any');
    this.panelSort.set(DEFAULT_BATCH_SORT);
  }

  async clear(): Promise<void> {
    this.closedNotices.set({});
    this.resetPanelFilters();
    this.items.set([]);
    this.activeId.set(null);
    if (this.projectMode !== 'none') {
      return;
    }
    await this.run('readwrite', (store) => store.clear());
  }

  activate(id: string): void {
    this.activeId.set(id);
  }

  deactivate(): void {
    this.activeId.set(null);
  }

  find(id: string): BatchItem | undefined {
    return this.items().find((item) => item.id === id);
  }

  private patch(id: string, changes: Partial<BatchItem>): void {
    let updated: BatchItem | null = null;
    this.items.update((items) =>
      items.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const now = Date.now();
        const statusChanged = changes.status !== undefined && changes.status !== item.status;
        updated = {
          ...item,
          ...changes,
          ...(statusChanged ? { statusAt: now } : {}),
          updatedAt: now,
        };
        return updated;
      }),
    );
    if (updated) {
      this.persist(updated);
    }
  }

  private deleteStored(id: string): void {
    if (this.projectMode === 'none') {
      void this.run('readwrite', (store) => store.delete(id));
    } else {
      this.sink?.remove(id);
    }
  }

  private persist(item: BatchItem): void {
    if (this.projectMode !== 'none') {
      this.sink?.save(item);
      return;
    }
    const size = item.aPdf.size + (item.bPdf?.size ?? 0);
    if (size > MAX_BATCH_PDF_BYTES) {
      this.persistent.set(false);
      return;
    }
    void this.run('readwrite', (store) => store.put(item, item.id)).then((ok) => {
      if (ok === null) {
        this.persistent.set(false);
      }
    });
  }

  private async readAll(): Promise<BatchItem[]> {
    const values = await this.run<unknown[]>('readonly', (store) => store.getAll());
    return Array.isArray(values)
      ? values
          .filter(isBatchItem)
          .map(withSafeProposal)
          .map(withSafePageMap)
          .map(withSafeInstructions)
      : [];
  }

  private async readSettings(): Promise<BatchSettings | null> {
    const value = await this.run<unknown>('readonly', (store) => store.get(SETTINGS_KEY));
    return value && typeof value === 'object'
      ? {
          aiInstructions: cleanAiInstructions(
            (value as { aiInstructions?: unknown }).aiInstructions,
          ),
          aiRun: sanitizeAiRun((value as { aiRun?: unknown }).aiRun),
        }
      : null;
  }

  private open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | boolean | null> {
    const db = await this.open();
    if (!db) {
      return null;
    }
    try {
      return await new Promise<T | boolean | null>((resolve) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        let result: T | null = null;
        request.onsuccess = () => {
          result = request.result ?? null;
        };
        transaction.oncomplete = () => resolve(mode === 'readwrite' ? true : result);
        transaction.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      });
    } catch {
      return null;
    } finally {
      db.close();
    }
  }
}

/** Rebuilds an item read from storage (IndexedDB or a project folder) or drops it if it has the wrong shape. */
export function reviveBatchItem(value: unknown): BatchItem | null {
  return isBatchItem(value) ? withSafeInstructions(withSafeProposal(value)) : null;
}

/** Stored instructions are untrusted: plain text or nothing (unset = follow the batch). */
function withSafeInstructions(item: BatchItem): BatchItem {
  const raw = (item as { aiInstructions?: unknown }).aiInstructions;
  const at = (item as { statusAt?: unknown }).statusAt;
  return {
    ...item,
    statusAt: isValidStamp(at) ? at : undefined,
    aiInstructions: typeof raw === 'string' ? cleanAiInstructions(raw) : undefined,
  };
}

/** Stored data is untrusted: only keep what has the expected shape. */
function isBatchItem(value: unknown): value is BatchItem {
  const item = value as Partial<BatchItem> | null | undefined;
  return (
    !!item &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    item.aPdf instanceof Blob &&
    Array.isArray(item.aPages) &&
    (item.bPdf === null || item.bPdf instanceof Blob) &&
    Array.isArray(item.links) &&
    Array.isArray(item.dismissed) &&
    (item.status === 'review' || item.status === 'ready') &&
    typeof item.updatedAt === 'number'
  );
}

/** A stored proposal is untrusted like everything else read back: rebuild it or drop it. */
function withSafeProposal(item: BatchItem): BatchItem {
  const raw = (item as { aiProposal?: unknown }).aiProposal as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') {
    return { ...item, aiProposal: undefined };
  }
  const rows = (Array.isArray(raw['rows']) ? raw['rows'] : [])
    .map((row) => sanitizeRow(row))
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (!rows.length) {
    return { ...item, aiProposal: undefined };
  }
  return {
    ...item,
    aiProposal: {
      rows,
      details: sanitizeDetails(raw['details']),
      provider: typeof raw['provider'] === 'string' ? raw['provider'].slice(0, 20) : '',
      model: typeof raw['model'] === 'string' ? raw['model'].slice(0, 60) : null,
      seconds:
        typeof raw['seconds'] === 'number' && Number.isFinite(raw['seconds']) ? raw['seconds'] : 0,
      at: typeof raw['at'] === 'number' && Number.isFinite(raw['at']) ? raw['at'] : 0,
      edits: sanitizeAiEdits(raw['edits'], new Set(rows.map((row) => row.id))),
    },
  };
}

/** A stored page table is untrusted too. */
function withSafePageMap(item: BatchItem): BatchItem {
  return { ...item, pageMap: sanitizePageMap((item as { pageMap?: unknown }).pageMap) };
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
