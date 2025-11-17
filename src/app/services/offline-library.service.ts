import { Injectable } from '@angular/core';
import { OfflinePdfDocument, OfflinePdfSummary } from '../models/offline-library.model';

interface PersistedPdfSource {
  readonly weight: number;
  readonly bytes: ArrayBuffer;
}

interface PersistedPdfDocument extends Omit<OfflinePdfDocument, 'pdfBytes' | 'byteSources'> {
  readonly pdfBytes: ArrayBuffer;
  readonly byteSources: PersistedPdfSource[];
}

@Injectable({ providedIn: 'root' })
export class OfflineLibraryService {
  private readonly dbPromise = this.openDb();

  async saveDocument(doc: OfflinePdfDocument): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const payload: PersistedPdfDocument = {
        ...doc,
        pdfBytes: doc.pdfBytes.slice().buffer,
        byteSources: doc.byteSources.map((source) => ({
          weight: source.weight,
          bytes: source.bytes.slice().buffer,
        })),
      };

      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getDocument(id: string): Promise<OfflinePdfDocument | null> {
    const db = await this.dbPromise;
    if (!db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const request = store.get(id);

      request.onsuccess = () => {
        const value = request.result as PersistedPdfDocument | undefined;
        if (!value) {
          resolve(null);
          return;
        }

        resolve({
          ...value,
          pdfBytes: new Uint8Array(value.pdfBytes),
          byteSources: value.byteSources.map((source) => ({
            weight: source.weight,
            bytes: new Uint8Array(source.bytes),
          })),
        });
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listDocuments(searchText = ''): Promise<OfflinePdfSummary[]> {
    const db = await this.dbPromise;
    if (!db) {
      return [];
    }

    const normalized = searchText.trim().toLocaleLowerCase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as PersistedPdfDocument[]).map<OfflinePdfSummary>((doc) => ({
          id: doc.id,
          name: doc.name,
          updatedAt: doc.updatedAt,
          pageCount: doc.pageCount,
          thumbnailDataUrl: doc.thumbnailDataUrl,
        }));

        const filtered = normalized
          ? results.filter((doc) => doc.name.toLocaleLowerCase().includes(normalized))
          : results;

        resolve(filtered.sort((a, b) => b.updatedAt - a.updatedAt));
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open('pdf-annotator', 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
}
