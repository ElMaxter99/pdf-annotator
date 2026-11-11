import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

const WORKER_SRC = '/assets/pdfjs/pdf.worker.entry.mjs';
const THUMB_WIDTH = 160;
const CONCURRENCY = 2;

/** Shares the worker setup with the editor: set once, never overwritten if already there. */
function ensureWorker(): void {
  const options = (pdfjsLib as any).GlobalWorkerOptions as {
    workerSrc?: string;
    workerType?: string;
  };
  if (!options.workerSrc && typeof Worker !== 'undefined') {
    options.workerSrc = WORKER_SRC;
    options.workerType = 'module';
  }
}

/**
 * First-page thumbnails of PDFs, rendered in the browser. Results are cached per Blob and at most
 * a couple are rendered at once, so dropping many documents does not freeze the page.
 */
@Injectable({ providedIn: 'root' })
export class PdfThumbnailService {
  private readonly cache = new WeakMap<Blob, Promise<string | null>>();
  private running = 0;
  private readonly queue: Array<() => void> = [];

  /** Resolves to an object-free `data:` URL of page 1, or `null` when it cannot be rendered. */
  thumbnail(blob: Blob): Promise<string | null> {
    let promise = this.cache.get(blob);
    if (!promise) {
      promise = this.schedule(() => this.render(blob));
      this.cache.set(blob, promise);
    }
    return promise;
  }

  private schedule<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++;
        job()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.queue.shift()?.();
          });
      };
      if (this.running < CONCURRENCY) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private async render(blob: Blob): Promise<string | null> {
    if (typeof document === 'undefined') {
      return null;
    }
    try {
      ensureWorker();
      const data = new Uint8Array(await blob.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data }).promise;
      try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) {
          return null;
        }
        await page.render({ canvasContext: context, viewport } as never).promise;
        return canvas.toDataURL('image/png');
      } finally {
        void doc.destroy();
      }
    } catch {
      return null;
    }
  }
}
