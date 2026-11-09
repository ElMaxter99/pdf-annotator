import { Injectable } from '@angular/core';

const THUMB_WIDTH = 240;

/** Renders the first page of a PDF as a small image for the batch panel (browser only, cached). */
@Injectable({ providedIn: 'root' })
export class PdfThumbService {
  private readonly cache = new Map<string, Promise<string | null>>();

  /** `key` identifies the content (its hash), so a replaced PDF gets a new thumbnail. */
  thumb(key: string, blob: Blob): Promise<string | null> {
    if (typeof document === 'undefined') return Promise.resolve(null);
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.render(blob).catch(() => null);
      this.cache.set(key, cached);
    }
    return cached;
  }

  private async render(blob: Blob): Promise<string | null> {
    const { pdfjsLib } = await import('../utils/pdfjs-setup');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.7);
    } finally {
      void doc.destroy();
    }
  }
}
