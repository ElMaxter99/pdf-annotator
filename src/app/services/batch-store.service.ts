import { Injectable, computed, signal } from '@angular/core';
import type { PageAnnotations } from '../models/annotation.model';
import type { BatchItem, FieldLink } from '../models/batch.model';

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
  /** The user said the PDFs have new versions (B) to upload from the panel. */
  readonly expectVersions = signal(false);

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
    this.expectVersions.set(false);
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
    this.patch(id, { aPages: pages });
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
      status: 'review',
    });
  }

  /** Swaps the PDF being edited (B when there is one, otherwise A) keeping everything else. */
  replacePdf(id: string, file: File): void {
    const item = this.find(id);
    if (!item) {
      return;
    }
    this.patch(id, item.bPdf ? { bPdf: file, bName: file.name } : { aPdf: file, name: file.name });
  }

  removeB(id: string): void {
    this.patch(id, {
      bPdf: null,
      bName: null,
      bPages: null,
      bJson: null,
      links: [],
      dismissed: [],
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

  clear(): void {
    this.items.set([]);
    this.activeId.set(null);
    void this.run('readwrite', (store) => store.clear());
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
    return Array.isArray(values) ? values.filter(isBatchItem) : [];
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

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
