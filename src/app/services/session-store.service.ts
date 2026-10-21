import { Injectable } from '@angular/core';
import type { PageAnnotations } from '../models/annotation.model';

export interface SavedSession {
  readonly name: string;
  readonly pdf: Blob;
  readonly coords: PageAnnotations[];
  readonly pageIndex: number;
  readonly scale: number;
  readonly savedAt: number;
}

export interface SavedSessionSummary {
  readonly name: string;
  readonly annotationCount: number;
  readonly savedAt: number;
}

const DB_NAME = 'pdf-annotator';
const STORE = 'session';
const KEY = 'last';
/** Larger PDFs are not persisted, to stay well within browser storage quotas. */
export const MAX_SESSION_PDF_BYTES = 40 * 1024 * 1024;

/**
 * Keeps the last working session (PDF + annotations + view) in IndexedDB so it survives a reload.
 * Everything stays in the user's browser; every method swallows storage errors (private mode,
 * quota, blocked storage) and reports failure through its return value.
 */
@Injectable({ providedIn: 'root' })
export class SessionStoreService {
  async save(session: SavedSession): Promise<boolean> {
    if (session.pdf.size > MAX_SESSION_PDF_BYTES) {
      return false;
    }
    return this.run('readwrite', (store) => store.put(session, KEY)).then((ok) => ok !== null);
  }

  async load(): Promise<SavedSession | null> {
    const value = await this.run<unknown>('readonly', (store) => store.get(KEY));
    return this.isSession(value) ? value : null;
  }

  async summary(): Promise<SavedSessionSummary | null> {
    const session = await this.load();
    if (!session) {
      return null;
    }
    const annotationCount = session.coords.reduce((total, page) => total + page.fields.length, 0);
    return { name: session.name, annotationCount, savedAt: session.savedAt };
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (store) => store.delete(KEY));
  }

  private isSession(value: unknown): value is SavedSession {
    const candidate = value as Partial<SavedSession> | null | undefined;
    return (
      !!candidate &&
      typeof candidate.name === 'string' &&
      candidate.pdf instanceof Blob &&
      Array.isArray(candidate.coords) &&
      typeof candidate.pageIndex === 'number' &&
      typeof candidate.scale === 'number' &&
      typeof candidate.savedAt === 'number'
    );
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

  /** Runs one request in a transaction; resolves to `null` when storage is unavailable or fails. */
  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T | null> {
    const db = await this.open();
    if (!db) {
      return null;
    }
    try {
      return await new Promise<T | null>((resolve) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        let result: T | null = null;
        request.onsuccess = () => {
          result = request.result ?? null;
        };
        transaction.oncomplete = () => resolve(mode === 'readwrite' ? (result ?? (true as T)) : result);
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
