import { Injectable, computed, signal } from '@angular/core';
import type { PageAnnotations } from '../models/annotation.model';
import type { AiSavedProposal, BatchItem, FieldLink } from '../models/batch.model';
import { sanitizeDetails, sanitizeRow } from '../utils/ai-proposal.utils';

const DB_NAME = 'pdf-annotator-batch';
const STORE = 'items';
/** Larger PDFs are not persisted, to stay well within browser storage quotas. */
export const MAX_BATCH_PDF_BYTES = 40 * 1024 * 1024;

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

  async load(): Promise<void> {
    if (this.loaded()) {
      return;
    }
    const stored = await this.readAll();
    // Items added before the read finished win over stored ones with the same id.
    const known = new Set(this.items().map((item) => item.id));
    this.items.update((current) => [...current, ...stored.filter((item) => !known.has(item.id))]);
    this.loaded.set(true);
  }

  startDraft(pdfs: File[]): void {
    this.draft.set({ pdfs, jsons: [] });
  }

  add(init: { name: string; aPdf: Blob; aPages: PageAnnotations[] }): BatchItem {
    const item: BatchItem = {
      id: newId(),
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
  setFitA(id: string, fit: boolean | undefined): void {
    this.patch(id, { fitA: fit });
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
        : { aPdf: file, name: file.name, aiProposal: undefined },
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
    void this.run('readwrite', (store) => store.delete(id));
  }

  /** Empties the batch (memory and IndexedDB); resolves once the stored copy is gone too. */
  /** Notices of the editor that were closed (`itemId:notice` → what they were about). In memory only. */
  readonly closedNotices = signal<Record<string, string>>({});

  async clear(): Promise<void> {
    this.closedNotices.set({});
    this.items.set([]);
    this.activeId.set(null);
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
        updated = { ...item, ...changes, updatedAt: Date.now() };
        return updated;
      }),
    );
    if (updated) {
      this.persist(updated);
    }
  }

  private persist(item: BatchItem): void {
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
    return Array.isArray(values) ? values.filter(isBatchItem).map(withSafeProposal) : [];
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
      seconds: typeof raw['seconds'] === 'number' && Number.isFinite(raw['seconds']) ? raw['seconds'] : 0,
      at: typeof raw['at'] === 'number' && Number.isFinite(raw['at']) ? raw['at'] : 0,
    },
  };
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
